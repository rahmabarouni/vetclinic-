# Spécification projet — Application de gestion de clinique vétérinaire

> Document de référence destiné à un agent de développement (humain ou IA). Il couvre le produit, l'architecture, la stack technique, le modèle de données et les règles de sécurité/conformité à respecter impérativement.
>
> **Dernière mise à jour** : 9 septembre 2026 — reflet de l'état réel du code.

---

## 1. Vue d'ensemble du produit

Application de gestion pour **une seule clinique vétérinaire** (pas un SaaS multi-clinique), composée de deux interfaces connectées à un backend commun :

| Interface | Utilisateurs | Plateforme |
|---|---|---|
| **App mobile client** | Propriétaires d'animaux | Mobile (iOS/Android), cross-platform |
| **Back-office web** | Vétérinaires, staff, admin | Web (navigateur, utilisé sur ordinateur/tablette à la clinique) |

Les deux interfaces consomment la **même API backend** et la **même base de données**, garantissant une synchronisation en temps réel (ex : un RDV pris côté client apparaît immédiatement dans l'agenda du véto).

Il s'agit d'un **projet destiné à un vrai lancement commercial** — la robustesse, la sécurité et la conformité légale doivent être traitées comme des exigences de premier ordre, pas des options.

---

## 2. Fonctionnalités — Périmètre v1 (MVP)

### 2.1 Côté Client (app mobile)

- Inscription / connexion (email + mot de passe)
- Gestion de profils animaux : nom, espèce, race, âge, sexe, poids, photo
- Consultation de l'historique médical (lecture seule, alimenté par le véto)
- Prise de rendez-vous : créneaux disponibles en temps réel, type de consultation
- Modification / annulation de rendez-vous
- Chat avec le vétérinaire : **texte + partage de photos**
- Notifications :
  - Confirmation / rappel de rendez-vous
  - **Rappels de vaccins et traitements** (calculés automatiquement à partir des consultations)

### 2.2 Côté Véto / Staff (back-office web)

- Connexion sécurisée (staff)
- Calendrier (vue jour/semaine) avec gestion des rendez-vous : accepter, refuser, reporter, annuler
- Blocage de créneaux (pauses, congés, indisponibilités)
- Fiches clients et animaux avec historique complet
- Ajout de notes de consultation, diagnostics, traitements
- Chat avec les clients : texte + photos
- **Dashboard avec statistiques avancées** : RDV du jour, nouveaux clients, taux d'annulation, évolution du nombre de consultations, répartition par type de RDV
- Architecture prête pour multi-vétérinaires dans la base de données (interface d'assignation reportée en v2, mais le schéma doit déjà le supporter)

### 2.3 Explicitement exclu de la v1 (reporté en v2)

- Paiement en ligne (aucune intégration paiement pour l'instant)
- Ordonnances numériques structurées (un simple document uploadé peut suffire en v1)
- Programme de fidélité, avis clients
- Interface complète de gestion multi-vétérinaires (assignation, plannings individuels)
- Localisation/itinéraire, numéro d'urgence dédié

---

## 3. Stack technique

| Couche | Technologie | Version | Justification |
|---|---|---|---|
| App mobile client | **Flutter (Dart)** | SDK ^3.12.2 | Cross-platform, un seul code pour iOS/Android, rendu UI natif très cohérent |
| Back-office web | **Next.js (React)** | — | Partage de composants/logique avec l'app mobile, écosystème React unifié |
| Backend / API | **Node.js + Fastify + TypeScript** | Fastify 5.12.1, TypeScript 7.0.2 | Performance, validation de schéma native (sécurité) |
| Validation | **Zod** | 4.4.3 | Schémas stricts côté backend, types générés |
| ORM | **Prisma** | 5.20.0 | Types générés automatiquement, migrations sûres |
| Base de données | **PostgreSQL** | — | Relationnel, robuste, adapté à des données structurées et sensibles |
| Chat temps réel | **@fastify/websocket** | — | Intégré à Fastify, WebSocket natif |
| Authentification | **JWT** | — | Tokens signés, rôles (CLIENT, VETERINARIAN, ADMIN, STAFF) |
| Stockage fichiers | **MinIO** (self-hosted, compatible S3) | — | Photos d'animaux, radios, documents — hébergé localement |
| Notifications push | **Firebase Cloud Messaging (FCM)** | — | Seul composant Google toléré |
| Tests | **Vitest** | 5.0.0 | Tests unitaires et d'intégration backend |
| Hébergement | **VPS en Tunisie ou hébergeur EU reconnu adéquat par l'INPDP** | — | Voir section conformité |

### Pourquoi pas de solution "tout-en-un" type Firebase/Supabase pour tout ?

Ces plateformes hébergent par défaut sur des serveurs américains. Le transfert de données personnelles hors de Tunisie nécessite une autorisation de l'INPDP (voir section 6). Auto-héberger le backend (Node + PostgreSQL) donne un contrôle total sur la localisation des données. Firebase peut être conservé uniquement pour FCM, car les notifications push ne contiennent pas de données personnelles sensibles.

---

## 4. Architecture

```
[App Mobile - Flutter/Dart]  ──┐
                                 ├──► [API Backend - Fastify + TypeScript] ──► [PostgreSQL]
[Dashboard Web - Next.js]  ────┘              │
                                                ├──► [WebSocket - Chat temps réel]
                                                ├──► [MinIO - Stockage fichiers]
                                                └──► [FCM - Notifications push uniquement]
```

- L'app mobile et le dashboard web ne communiquent **jamais directement entre eux** — tout passe par l'API backend.
- Le backend est l'unique point d'accès à la base de données. Aucun client (mobile ou web) n'a d'accès direct à PostgreSQL.
- Un job planifié (cron) côté backend vérifie quotidiennement les `Reminder` à échéance et déclenche les notifications correspondantes.
- La documentation Swagger/OpenAPI est servie à `/docs` (UI) et `/docs/json` (spec JSON).

---

## 5. Modèle de données (schéma Prisma complet)

Le schéma complet est au fichier `vetclinic-backend/prisma/schema.prisma`. **13 modèles** et **11 enums** :

### Modèles

| Modèle | Table | Description |
|---|---|---|
| **User** | `users` | Compte utilisateur (CLIENT, VETERINARIAN, ADMIN, STAFF) |
| **Veterinarian** | `veterinarians` | Profil vétérinaire lié à un User (spécialité, bio, disponibilité) |
| **Pet** | `pets` | Animal lié à un owner (User client) |
| **Appointment** | `appointments` | Rendez-vous : pet, client, véto (nullable), type, statut, créneaux |
| **TimeSlotBlock** | `time_slot_blocks` | Blocage de créneaux par un véto |
| **MedicalRecord** | `medical_records` | Note de consultation, diagnostic, lié à un animal et un véto |
| **Reminder** | `reminders` | Rappel (vaccin, traitement), généré automatiquement depuis un MedicalRecord |
| **Conversation** | `conversations` | Conversation client-véto |
| **Message** | `messages` | Message dans une conversation (texte + pièce jointe) |
| **Document** | `documents` | Fichiers liés à un animal ou un dossier médical |
| **Notification** | `notifications` | Notification interne (rappel RDV, message, etc.) |
| **AuditLog** | `audit_logs` | Journal d'audit des actions sensibles (création, suppression, consultation) |
| **PasswordResetToken** | `password_reset_tokens` | Tokens de réinitialisation de mot de passe |

### Enums

`UserRole`, `AppointmentType`, `AppointmentStatus`, `MedicalRecordType`, `ReminderType`, `ConversationStatus`, `AttachmentType`, `DocumentType`, `NotificationType`, `PetSpecies`, `PetSex`

### Règles métier clés

1. Un `MedicalRecord` de type vaccination doit pouvoir générer automatiquement un `Reminder` avec une `due_date` calculée (ex : +6 mois).
2. Le workflow de statut d'un `Appointment` doit suivre : `PENDING → CONFIRMED → COMPLETED` (ou `CANCELLED` / `NO_SHOW` à tout moment avant `COMPLETED`).
3. Avant de créer un rendez-vous, vérifier qu'il n'y a pas de chevauchement avec un autre rendez-vous `PENDING` ou `CONFIRMED` sur le même animal (et le même vétérinaire si assigné).
4. Les animaux supportent le soft delete via `isActive` : un `DELETE /pets/:id` met `isActive` à `false`, et `GET /pets` ne retourne que les animaux actifs.

---

## 6. Règles de sécurité et de conformité — **à respecter impérativement**

### 6.1 Cadre légal (Tunisie)

- La loi organique n° 2004-63 du 27 juillet 2004 encadre la protection des données personnelles en Tunisie ; l'**INPDP** (Instance Nationale de Protection des Données Personnelles) en assure le contrôle.
- **Déclaration préalable obligatoire** à l'INPDP avant tout traitement de données personnelles.
- **Régime renforcé pour les données de santé** : nécessite un consentement écrit de la personne concernée ET l'accord préalable de l'INPDP avant tout traitement.
- Le traitement de données de santé doit être réalisé uniquement par des personnes tenues au secret professionnel.
- Le **transfert de données personnelles hors de Tunisie** nécessite une autorisation explicite de l'INPDP (article 52). Ne jamais héberger la base de données ou les fichiers sur un cloud étranger sans validation préalable.
- Bien que les données de *santé animale* elles-mêmes ne soient pas classées "données sensibles" par la loi (qui vise la santé humaine), les informations du propriétaire liées à ces dossiers (identité, contact) doivent être traitées avec le même niveau de rigueur par précaution.

### 6.2 Règles techniques obligatoires

| Règle | Détail | État |
|---|---|---|
| **Chiffrement en transit** | HTTPS/TLS obligatoire sur toutes les communications | ✅ Configuré (MinIO, API) |
| **Chiffrement au repos** | Mots de passe hachés avec bcrypt (12 rounds) | ✅ Implémenté |
| **Contrôle d'accès strict (RBAC)** | Un client ne peut accéder qu'à ses propres animaux, RDV, conversations et documents | ✅ Implémenté via `fastify.authorize` |
| **Validation stricte des entrées** | Toutes les données entrantes validées par Zod 4.4.3 | ✅ Implémenté sur toutes les routes |
| **Rate limiting** | 5 req/min sur routes auth, 100 req/min global | ✅ Implémenté via `@fastify/rate-limit` |
| **Audit log** | Traçabilité des actions sensibles (création, suppression) sur pets, medical-records, documents | ✅ Implémenté (`AuditLog` model + `logAudit` util) |
| **Fail-fast sur secrets** | Blocage au démarrage en production si `JWT_SECRET`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` manquants | ✅ Implémenté (`validate-env.ts`) |
| **Consentement explicite** | À l'inscription, case à cocher non pré-cochée | ⏳ Frontend uniquement |
| **Droit d'accès et de suppression** | Le client doit pouvoir consulter et demander la suppression de ses données | ⏳ Partiellement (soft delete animaux) |
| **Sécurisation du chat** | Messagerie chiffrée en transit, contrôle d'accès sur les conversations | ✅ WebSocket avec JWT auth |
| **Hébergement** | DB et fichiers en Tunisie ou pays reconnu adéquat | ⏳ Avant mise en production |
| **Séparation des secrets** | Variables d'environnement, jamais commitées | ✅ `.env` dans `.gitignore`, `.env.example` fourni |

---

## 7. Backend — structure du code

```
vetclinic-backend/
├── prisma/
│   ├── schema.prisma              # Schéma complet (13 modèles)
│   ├── seed.ts                    # Seed idempotent (users, pets, appts, records)
│   └── migrations/                # 11 migrations Prisma
├── src/
│   ├── server.ts                  # Point d'entrée (ecoute + cron)
│   ├── app.ts                     # buildApp() — registre plugins/routes (testable)
│   ├── validate-env.ts            # Fail-fast production secrets
│   ├── plugins/
│   │   ├── prisma.ts              # fastify.prisma (connexion DB)
│   │   ├── auth.ts                # JWT + fastify.authenticate / fastify.authorize
│   │   └── minio.ts               # Client S3 (upload + presigned URLs)
│   ├── routes/
│   │   ├── auth.ts                # POST register, login, change-password
│   │   ├── password-reset.ts      # POST forgot-password, reset-password
│   │   ├── pets.ts                # CRUD animaux + soft delete
│   │   ├── appointments.ts        # CRUD RDV + overlap check
│   │   ├── medical-records.ts     # CRUD dossiers médicaux
│   │   ├── documents.ts           # CRUD documents (liés à pet/medical-record)
│   │   ├── downloads.ts           # GET presigned URL (ownership vérifié)
│   │   ├── uploads.ts             # POST multipart upload → MinIO
│   │   ├── conversations.ts       # REST chat (list, messages, create)
│   │   ├── ws-conversations.ts    # WebSocket chat (JWT auth via query)
│   │   ├── time-slot-blocks.ts    # CRUD blocages créneaux véto
│   │   ├── veterinarians.ts       # CRUD vétérinaires (admin)
│   │   ├── notifications.ts       # CRUD notifications + batch mark-read
│   │   ├── dashboard.ts           # Stats agrégées (véto/admin)
│   │   ├── activity.ts            # Feed d'activité (audit logs paginés)
│   │   ├── search.ts              # Recherche globale (pets, appointments, records)
│   │   └── users.ts               # Profil utilisateur (GET/PUT)
│   ├── utils/
│   │   ├── audit.ts               # logAudit() helper
│   │   └── pagination.ts          # getPaginationParams, paginatedResponse
│   ├── cron/
│   │   └── reminders.ts           # Job quotidien 8h — vérifie rappels échus
│   └── __tests__/
│       ├── helper.ts              # getApp()/closeApp() pour tests
│       ├── auth.test.ts           # 5 tests (register, login, duplicate, etc.)
│       ├── rbac.test.ts           # 4 tests (CLIENT→403, ADMIN→200, etc.)
│       ├── ownership.test.ts      # 5 tests (isolation cross-client)
│       └── appointments.test.ts   # 4 tests (overlap, invalid, cross-owner)
├── vitest.config.ts
├── tsconfig.json
└── package.json
```

### Conventions

- Versioning : `/api/v1/...`
- Toutes les routes protégées : `preHandler: [fastify.authenticate]`
- Routes staff : ajout de `fastify.authorize(['VETERINARIAN', 'ADMIN', 'STAFF'])`
- Validation : Zod 4, `details: parsed.error.flatten()` sur les réponses 400
- Pagination : `GET /resource?page=1&limit=20` → `{ data: [...], pagination: { page, limit, total, totalPages } }`
- Réponses wrappées : `{ pet: {...} }`, `{ appointment: {...} }` pour les créations
- Ownership : les CLIENTs ne voient que leurs propres données (filtrage côté serveur)

---

## 8. API Backend — endpoints (40 routes)

Source de vérité : Swagger à `/docs` (UI) et `/docs/json` (OpenAPI 3.0).

### Authentification

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| POST | `/api/v1/auth/register` | Public | Inscription client |
| POST | `/api/v1/auth/login` | Public | Connexion (retourne JWT + user) |
| POST | `/api/v1/auth/change-password` | Auth | Changement de mot de passe (requiert mot de passe actuel) |
| POST | `/api/v1/auth/forgot-password` | Public | Demande de réinitialisation (envoie token) |
| POST | `/api/v1/auth/reset-password` | Public | Réinitialisation avec token |

### Animaux (Pets)

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/api/v1/pets` | CLIENT | Liste des animaux (filtré par ownership) |
| GET | `/api/v1/pets/:id` | CLIENT | Détail d'un animal |
| POST | `/api/v1/pets` | CLIENT | Créer un animal |
| PATCH | `/api/v1/pets/:id` | CLIENT | Modifier un animal |
| DELETE | `/api/v1/pets/:id` | CLIENT | Soft delete (isActive=false) |

### Rendez-vous (Appointments)

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/api/v1/appointments` | CLIENT | Liste des RDV (filtré par ownership) |
| POST | `/api/v1/appointments` | CLIENT | Créer un RDV (overlap check animal + véto) |
| PATCH | `/api/v1/appointments/:id/status` | VET/ADMIN | Changer le statut |
| DELETE | `/api/v1/appointments/:id` | CLIENT | Annuler un RDV (→ CANCELLED) |

### Dossiers médicaux

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/api/v1/pets/:id/medical-records` | ALL (CLIENT: ownership only) | Historique médical d'un animal |
| POST | `/api/v1/medical-records` | VET/ADMIN/STAFF | Créer un dossier médical |

### Documents

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/api/v1/pets/:id/documents` | ALL (CLIENT: ownership only) | Documents d'un animal |
| POST | `/api/v1/documents` | VET/ADMIN/STAFF | Attacher un document |
| GET | `/api/v1/downloads` | CLIENT | Télécharger via presigned URL (ownership vérifié) |

### Uploads

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| POST | `/api/v1/uploads` | VET/ADMIN/STAFF | Upload multipart vers MinIO |

### Chat (Conversations)

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/api/v1/conversations` | CLIENT | Liste des conversations |
| POST | `/api/v1/conversations` | CLIENT | Créer une conversation |
| GET | `/api/v1/conversations/:id/messages` | CLIENT | Messages paginés |
| POST | `/api/v1/conversations/:id/messages` | CLIENT | Envoyer un message (REST) |
| WS | `/api/v1/conversations/:id/ws?token=` | Auth | WebSocket temps réel |

### Notifications

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/api/v1/notifications` | CLIENT | Liste des notifications |
| GET | `/api/v1/notifications/unread-count` | CLIENT | Nombre de non-lues |
| PATCH | `/api/v1/notifications/:id/read` | CLIENT | Marquer comme lu |
| PATCH | `/api/v1/notifications/read-all` | CLIENT | Marquer toutes comme lues |
| DELETE | `/api/v1/notifications/:id` | CLIENT | Supprimer une notification |

### Blocages de créneaux

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/api/v1/time-slot-blocks` | VET/ADMIN/STAFF | Liste des blocages |
| POST | `/api/v1/time-slot-blocks` | VET/ADMIN/STAFF | Créer un blocage |
| DELETE | `/api/v1/time-slot-blocks/:id` | VET/ADMIN/STAFF | Supprimer un blocage |

### Vétérinaires

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| POST | `/api/v1/veterinarians` | ADMIN | Créer un véto |

### Utilisateurs

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/api/v1/users/profile` | Auth | Profil de l'utilisateur connecté |
| PUT | `/api/v1/users/profile` | Auth | Modifier son profil |

### Dashboard & Activité

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/api/v1/dashboard/stats` | VET/ADMIN/STAFF | Statistiques agrégées |
| GET | `/api/v1/activity` | CLIENT | Feed d'activité (audit logs paginés) |
| GET | `/api/v1/activity/stats` | CLIENT | Statistiques d'activité |

### Recherche

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/api/v1/search?q=...` | CLIENT | Recherche globale (pets, appointments, records) |

### Santé

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/health` | Public | DB ping, MinIO, uptime, mémoire |

---

## 9. Frontend — état actuel

### 9.1 App mobile (Flutter)

**Statut** : fonctionnelle sur Chrome et Android (SDK 37). Tests d'intégration API : 34/34 passent.

#### Structure du code

```
vetclinic_app/lib/
├── main.dart                          # Navigation (NavigationBar Animaux/RDV)
├── models/
│   ├── user.dart                      # Modèle User
│   ├── pet.dart                       # Modèle Pet (fromJson, speciesLabel, sexLabel)
│   └── appointment.dart               # Modèle Appointment (nested Pet/Client)
├── services/
│   └── api_service.dart               # Dio + JWT interceptor + flutter_secure_storage
├── providers/
│   ├── auth_provider.dart             # AuthState/AuthNotifier (login, register, logout)
│   ├── pets_provider.dart             # PetsState/PetsNotifier (load, create, refresh)
│   └── appointments_provider.dart     # AppointmentsState (load, create, cancel)
└── screens/
    ├── login_screen.dart              # Connexion
    ├── register_screen.dart           # Inscription
    ├── pets_list_screen.dart          # Liste animaux (pull-to-refresh, FAB)
    ├── pet_form_screen.dart           # Formulaire ajout animal
    ├── appointments_list_screen.dart  # Liste RDV (couleurs/statuts)
    └── appointment_form_screen.dart   # Formulaire création RDV
```

#### Stack Flutter

- **Riverpod** pour la gestion d'état
- **Dio** pour les appels API (intercepteur JWT automatique)
- **flutter_secure_storage** pour le stockage sécurisé du token JWT (chiffré, jamais en clair)
- **Material 3** (useMaterial3: true)

#### Limitations connues

- **SDK Android 37** : le build Android nécessite `compileSdk = 37` dans `build.gradle.kts`. Le téléchargement du SDK Platform 37 via sdkmanager peut être lent selon la connexion. Solution documentée dans le README.
- **Pas encore implémenté** : chat (Phase 5), photo upload, notifications push, écran profil détaillé.

### 9.2 Back-office web (Next.js)

**Statut** : non démarré (Phase 6 prévue).

---

## 10. Tests

### Backend (Vitest)

| Fichier | Tests | Couverture |
|---|---|---|
| `auth.test.ts` | 5 | Register, login, duplicate email, wrong password, nonexistent email |
| `rbac.test.ts` | 4 | CLIENT→403 dashboard, ADMIN→200, CLIENT→403 vets, no token→401 |
| `ownership.test.ts` | 5 | Can't view/edit/delete another's pet, filtered list |
| `appointments.test.ts` | 4 | Overlap detection, invalid times, cross-owner pet→403 |
| **Total** | **18** | Auth, RBAC, ownership, appointments |

### Intégration API (scripts PowerShell)

| Scénario | Résultat |
|---|---|
| Login jean.dupont@email.test | 34/34 PASS |
| Liste animaux (isolation) | ✅ |
| Création animal + vérification | ✅ |
| Liste RDV (isolation) | ✅ |
| Création RDV | ✅ |
| Annulation RDV (→ CANCELLED) | ✅ |
| Erreur chevauchement créneau (409) | ✅ |
| Isolation cross-client (Marie vs Jean) | ✅ |
| Erreur 403 cross-owner | ✅ |

---

## 11. Ce qu'il reste à construire

### Prioritaire (v1 MVP)

- [ ] **Chat Flutter** (Phase 5) — WebSocket branché sur le backend existant
- [ ] **Dashboard Next.js** (Phase 6) — calendrier RDV, changement de statut
- [ ] Intégration FCM pour notifications push
- [ ] Upload de fichiers côté Flutter (photos animaux, documents)
- [ ] Écran profil utilisateur dans l'app mobile
- [ ] Consentement explicite à l'inscription (case à cocher)

### Secondaire (post-MVP)

- [ ] Dashboard stats avancées (graphiques, tendances)
- [ ] Génération automatique de rappels depuis les MedicalRecord
- [ ] Ordonnances numériques structurées
- [ ] Programme de fidélité, avis clients

### Conformité

- [ ] Déclaration/autorisation auprès de l'INPDP avant mise en production
- [ ] Hébergement validé en Tunisie ou pays adéquat
- [ ] Audit de sécurité externe

---

## 12. Résumé des priorités pour l'agent qui reprend ce projet

1. Respecter strictement le modèle de données et les rôles définis (ne pas simplifier le RBAC).
2. Ne jamais introduire de dépendance à un service cloud hébergeant des données hors de Tunisie sans validation explicite.
3. Toujours valider les entrées et restreindre les données retournées par l'API selon le rôle de l'utilisateur.
4. Le MVP prioritaire est : auth, gestion animaux, prise de RDV, chat texte+photo, rappels vaccins, dashboard stats. Le paiement est explicitement hors scope.
5. Documenter toute nouvelle route ou table ajoutée en cohérence avec ce document.
6. **Ne jamais remplacer `flutter_secure_storage` par `shared_preferences`** pour stocker des tokens — c'est une régression de sécurité (stockage en clair vs chiffré).
