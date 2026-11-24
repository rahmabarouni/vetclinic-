# VetClinic Backend

API backend pour la gestion de clinique vétérinaire — Fastify + Prisma + PostgreSQL.

## Prérequis

- Node.js >= 18
- PostgreSQL (via Docker recommandé)
- MinIO (pour les uploads de fichiers)

## Démarrage rapide

```bash
# 1. Démarrer les services (PostgreSQL + MinIO)
docker-compose up -d

# 2. Installer les dépendances
npm install

# 3. Configurer l'environnement
cp .env.example .env

# 4. Générer le client Prisma + migrer
npx prisma generate
npx prisma migrate dev

# 5. Peupler la base avec les données de test
npx prisma db seed

# 6. Lancer le serveur en dev
npm run dev
```

## Comptes de test (seed)

> ⚠️ Comptes de **démonstration** uniquement, destinés à une base de développement.
> Le mot de passe n'est pas versionné : il provient de la variable
> `SEED_PASSWORD` ; à défaut, `npm run db:seed` en génère un **aléatoire**
> et l'affiche une seule fois. Ne réutilisez jamais ces comptes en production.

| Rôle | Email |
|---|---|
| ADMIN | admin@vetclinic.test |
| VÉTÉRINAIRE | dr.martin@vetclinic.test |
| VÉTÉRINAIRE | dr.durand@vetclinic.test |
| CLIENT | jean.dupont@email.test |
| CLIENT | marie.leroy@email.test |
| CLIENT | pierre.moreau@email.test |

## Variables d'environnement

Voir `.env.example` pour la liste complète. **Ne commitez jamais de fichier
`.env`** : il est ignoré par git et doit contenir des valeurs propres à votre
machine / environnement.

| Variable | Description | Défaut |
|---|---|---|
| `DATABASE_URL` | URL PostgreSQL | `postgresql://...` |
| `JWT_SECRET` | Secret pour les tokens JWT | (obligatoire en prod) |
| `MINIO_ENDPOINT` | URL du serveur MinIO | `http://localhost:9000` |
| `MINIO_ROOT_USER` | Utilisateur MinIO | (à définir — voir `.env.example`) |
| `MINIO_ROOT_PASSWORD` | Mot de passe MinIO | (à définir — voir `.env.example`) |
| `REMINDER_CRON_SCHEDULE` | Planification du cron rappels | `0 8 * * *` (8h/jour) |

## Architecture

```
src/
├── server.ts              # Point d'entrée Fastify
├── plugins/
│   ├── prisma.ts          # Client Prisma
│   ├── auth.ts            # JWT auth + rôles
│   └── minio.ts           # Client S3/MinIO
├── routes/
│   ├── auth.ts            # Register/Login
│   ├── pets.ts            # CRUD animaux
│   ├── appointments.ts    # RDV
│   ├── medical-records.ts # Dossiers médicaux
│   ├── conversations.ts   # Chat REST
│   ├── ws-conversations.ts# Chat WebSocket
│   ├── documents.ts       # Documents
│   ├── notifications.ts   # Notifications
│   ├── uploads.ts         # Upload fichiers (MinIO)
│   ├── dashboard.ts       # Stats dashboard
│   ├── time-slot-blocks.ts# Créneaux vétérinaires
│   └── veterinarians.ts   # Gestion vétérinaires (admin)
└── cron/
    └── reminders.ts       # Cron job rappels vaccins
```

## Endpoints principaux

| Méthode | Route | Description |
|---|---|---|
| POST | `/api/v1/auth/register` | Inscription client |
| POST | `/api/v1/auth/login` | Connexion |
| GET/POST | `/api/v1/pets` | Liste/création animaux |
| GET/POST | `/api/v1/appointments` | Liste/création RDV |
| POST | `/api/v1/medical-records` | Créer dossier médical |
| GET/POST | `/api/v1/conversations` | Liste/création conversations |
| WS | `/ws/conversations/:id?token=` | Chat temps réel |
| POST | `/api/v1/uploads` | Upload fichier (MinIO) |
| GET | `/api/v1/dashboard/stats` | Statistiques (vet/admin) |
| GET | `/api/v1/notifications` | Notifications |

## Déploiement Production

### HTTPS / TLS

Le serveur Fastify ne doit **jamais** être exposé directement sur internet en HTTP.

En production, placer le serveur derrière un **reverse proxy** (Nginx ou Caddy) qui gère TLS :

- **Caddy** : terminates TLS automatiquement avec Let's Encrypt
- **Nginx** : utiliser Certbot pour obtenir un certificat, configurer `proxy_pass`

Variables d'environnement requises en prod (les valeurs ne doivent **jamais**
être commitées — elles sont fournies par l'environnement d'hébergement) :

| Variable | Description |
|---|---|
| `NODE_ENV=production` | Active le mode production |
| `DATABASE_URL` | URL PostgreSQL de production |
| `JWT_SECRET` | Secret de signature JWT |
| `JWT_EXPIRES_IN` | Durée de validité des JWT (ex. `7d`) |
| `CORS_ORIGIN` | Origines autorisées, séparées par des virgules |
| `TRUSTED_PROXY=true` | Indique que le serveur est derrière un reverse proxy TLS |
| `MINIO_ENDPOINT`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` | Stockage objet |
| `MAIL_MODE=smtp` + `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Envoi d'emails réel (obligatoire : `dry-run` refuse le démarrage en prod) |

### Checklist avant mise en production

1. `cd vetclinic-backend && npx prisma migrate deploy` — **jamais** `prisma db seed` :
   le seed est refusé en production depuis la Phase 4 (aucun compte de démonstration).
2. Vérifier que `/docs` renvoie 404 et que `/health` n'expose pas `memory`.
3. Vérifier que `TRUSTED_PROXY=true` correspond bien à un déploiement derrière
   un proxy : les rate limits utilisent alors `X-Forwarded-For`.
4. Tester l'envoi d'email avec `npm run mail:test` (sans afficher les identifiants).
5. Builder l'app Flutter avec l'URL de l'API de production :

   ```bash
   flutter build apk --dart-define=API_BASE_URL=https://api.votre-domaine.tld
   ```

   Sans ce `--dart-define`, l'app garde `10.0.2.2:3000` (Android) / `localhost:3000`
   et ne peut pas joindre la production. La WebSocket suit automatiquement le
   même host (`wss://` si l'API est en `https://`).
6. La CI (`.github/workflows/ci.yml`) rejoue `npm test`, `npm run build`,
   `flutter analyze` et `flutter test` sur chaque push / PR.

### Chiffrement au repos

Le chiffrement des données au repos se configure au niveau de l'infrastructure :

| Hébergement | Méthode |
|---|---|
| Cloud (AWS RDS, Azure, GCP) | Chiffrement disque natif du service managé |
| VPS / Serveur dédié | LUKS (Linux) ou BitLocker (Windows) |
| Docker | Non nécessaire en dev |

## Chat WebSocket — Guide client Flutter

### Connexion

```
ws://localhost:3000/api/v1/ws/conversations/{conversationId}?token={jwt}
```

### Format des messages (JSON)

**Envoi :**
```json
{ "content": "Bonjour !" }
```

**Réception (broadcast) :**
```json
{
  "type": "new_message",
  "message": {
    "id": "...",
    "conversationId": "...",
    "senderId": "...",
    "content": "Bonjour !",
    "createdAt": "2026-08-31T..."
  }
}
```

**Erreur :**
```json
{ "type": "error", "error": "Description de l'erreur" }
```

### Codes de fermeture WebSocket

| Code | Raison |
|---|---|
| 4001 | Token manquant ou invalide |
| 4003 | Accès refusé |
| 4004 | Conversation introuvable |

### Reconnexion

Le client doit implémenter une reconnexion automatique avec backoff exponentiel (ex: 1s, 2s, 4s, 8s... max 30s) en cas de déconnexion.
