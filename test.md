# Guide de test — App, Backend, Back Office

## Prérequis

- Docker Desktop actif
- Node.js installé
- Flutter installé (pour l'app mobile)

---

## 1. Backend (API)

### Démarrer

```bash
# Terminal 1 : PostgreSQL + MinIO
cd vetclinic-backend
docker-compose up -d

# Terminal 2 : Backend
cd vetclinic-backend
npx prisma migrate deploy
npx tsx prisma/seed.ts
npm run build
node dist/server.js
```

Le backend démarre sur `http://localhost:3000`.

### Tester avec PowerShell

**Santé (pas d'auth requise) :**
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing
```
Résultat : `{"status":"ok"}`

**Login (obtenir le token) :**
```powershell
$r = Invoke-WebRequest -Uri "http://localhost:3000/api/v1/auth/login" -Method POST -Body '{"email":"dr.martin@vetclinic.test","password":"REDACTED_DEMO_PASSWORD"}' -ContentType "application/json" -UseBasicParsing
$r.Content
```
Résultat : un JSON avec `user` et `token`. Copie le token.

**Utiliser le token (remplace LE_TOKEN par celui reçu) :**
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/v1/appointments" -Headers @{Authorization="Bearer LE_TOKEN"} -UseBasicParsing
```

> **Important :** Le header doit être `Authorization: Bearer <token>`, pas juste le token.

**Profil utilisateur :**
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/v1/users/profile" -Headers @{Authorization="Bearer LE_TOKEN"} -UseBasicParsing
```

**Changer le statut d'un RDV :**
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/v1/appointments/ID_DU_RDV/status" -Method PATCH -Body '{"status":"CONFIRMED"}' -ContentType "application/json" -Headers @{Authorization="Bearer LE_TOKEN"} -UseBasicParsing
```

### Tester avec Swagger (plus simple)

1. Ouvrir `http://localhost:3000/docs` dans le navigateur
2. Cliquer sur **Authorize** (bouton en haut)
3. Entrer le token
4. Tester chaque route directement dans l'interface

### Récapitulatif des routes

| Route | Méthode | Auth requise |
|-------|---------|-------------|
| `/health` | GET | Non |
| `/api/v1/auth/login` | POST | Non |
| `/api/v1/users/profile` | GET | Oui |
| `/api/v1/appointments` | GET | Oui |
| `/api/v1/appointments/:id/status` | PATCH | Oui (VET/ADMIN/STAFF) |

---

## 2. Back Office (Dashboard Next.js)

### Démarrer

```bash
# Terminal 3 (le backend doit déjà tourner)
cd vetclinic-dashboard
npm run dev
```

Le dashboard démarre sur `http://localhost:3001`.

### Tester

1. Ouvrir `http://localhost:3001` dans le navigateur
2. Se connecter avec :
   - Email : `dr.martin@vetclinic.test`
   - Mot de passe : `REDACTED_DEMO_PASSWORD`
3. Vérifier :
   - Redirigé vers `/dashboard` (pas de token visible dans l'URL)
   - Liste des RDV affichée avec les noms des animaux et propriétaires
   - Sélecteur de statut fonctionne (cliquer pour changer PENDING → CONFIRMED)
   - Déconnexion vide le cookie et redirige vers `/login`

### Vérifier que le token est httpOnly

1. Ouvrir les outils de développement (F12)
2. Onglet **Application** → **Cookies** → `localhost:3001`
3. Voir `dashboard_token` avec le drapeau **HttpOnly** coché
4. Onglet **Console** : taper `document.cookie` → le token n'apparaît PAS

---

## 3. App Mobile (Flutter)

### Démarrer

```bash
# Le backend doit déjà tourner
cd vetclinic_app
flutter pub get
flutter run
```

### Tester sur émulateur ou téléphone

| Test | Comment | Résultat attendu |
|------|---------|-----------------|
| Login | Entrer `jean.dupont@email.test` / `REDACTED_DEMO_PASSWORD` | Redirigé vers l'écran d'accueil |
| Liste animaux | Onglet "Pets" | Voir Rex, Luna, Mimi... |
| Détail animal | Cliquer sur un animal | Espèce, race, sexe, poids affichés |
| Chat | Onglet "Messages" | Liste des conversations |
| Envoyer message | Taper un message et envoyer | Le message apparaît en temps réel (bulle verte) |
| Déconnexion | Bouton Logout | Retour à l'écran de login |

### Tester le WebSocket (chat temps réel)

1. Ouvrir l'app sur 2 émulateurs différents
2. Se connecter avec 2 utilisateurs différents
3. Envoyer un message depuis l'un → il apparaît immédiatement sur l'autre

---

## Comptes de test

| Rôle | Email | Mot de passe |
|------|-------|-------------|
| Vétérinaire | `dr.martin@vetclinic.test` | `REDACTED_DEMO_PASSWORD` |
| Vétérinaire | `dr.durand@vetclinic.test` | `REDACTED_DEMO_PASSWORD` |
| Admin | `admin@vetclinic.test` | `REDACTED_DEMO_PASSWORD` |
| Client | `jean.dupont@email.test` | `REDACTED_DEMO_PASSWORD` |
| Client | `marie.leroy@email.test` | `REDACTED_DEMO_PASSWORD` |
| Client | `pierre.moreau@email.test` | `REDACTED_DEMO_PASSWORD` |
