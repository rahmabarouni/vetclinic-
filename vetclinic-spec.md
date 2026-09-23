# Spécification projet — Application de gestion de clinique vétérinaire

> Document de référence destiné à un agent de développement (humain ou IA). Il couvre le produit, l'architecture, la stack technique, le modèle de données et les règles de sécurité/conformité à respecter impérativement.
>
> **Dernière mise à jour** : 23 septembre 2026 — reflet de l'état réel du code (routes vérifiées contre `/docs/json` à cette date).

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

- Inscription / connexion (email + mot de passe) **+ vérification de l'adresse email par code OTP** + **connexion Google (Google Sign-In)**
- Gestion de profils animaux : nom, espèce, race, âge, sexe, poids, photo
- Consultation de l'historique médical (lecture seule, alimenté par le véto)
- Prise de rendez-vous : créneaux disponibles en temps réel, type de consultation
- Modification / annulation de rendez-vous
- Chat avec le vétérinaire : **texte + partage de photos** (rendez-vous lancé avec un vétérinaire choisi)
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
| App mobile client | **Flutter (Dart)** | SDK ^3.12.2, Android SDK 37 | Cross-platform, un seul code pour iOS/Android, rendu UI natif très cohérent |
| Back-office web | **Next.js (React)** | — | Écosystème React unifié, proxy API sécurisé côté serveur |
| Backend / API | **Node.js + Fastify + TypeScript** | Fastify 5.12.1, TypeScript 7.0.2 | Performance, validation de schéma native (sécurité) |
| Validation | **Zod** | 4.4.3 | Schémas stricts côté backend, types générés |
| ORM | **Prisma** | 5.20.0 | Types générés automatiquement, migrations sûres (rester sur v5.x) |
| Base de données | **PostgreSQL** | — | Relationnel, robuste, adapté à des données structurées et sensibles |
| Chat temps réel | **@fastify/websocket** | — | Intégré à Fastify, WebSocket natif (auth JWT via query `?token=`) |
| Authentification | **JWT + `google-auth-library`** | — | Tokens signés, rôles (CLIENT, VETERINARIAN, ADMIN, STAFF) ; Google Sign-In via `authProvider` |
| Vérification email | **Nodemailer (SMTP)** | — | Envoi des codes OTP (code stocké en base avant envoi, échec SMTP non bloquant) |
| Documentation API | **@fastify/swagger + swagger-ui** | — | UI à `/docs`, spec OpenAPI à `/docs/json` (source de vérité) |
| Stockage fichiers | **MinIO** (self-hosted, compatible S3) | — | Photos d'animaux, radios, documents — hébergé localement |
| Notifications push | **Firebase Cloud Messaging (FCM)** | — | Seul composant Google toléré — pas encore intégré |
| Tests | **Vitest** | 5.0.0 | Tests unitaires et d'intégration backend (include `src/**/*.test.ts`, exclude `dist`) |
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

- L'app mobile et le dashboard web ne communiquent **jamais directement entre eux** — tout passe par l'API backend (le dashboard via un proxy Next.js).
- Le backend est l'unique point d'accès à la base de données. Aucun client (mobile ou web) n'a d'accès direct à PostgreSQL.
- Un job planifié (cron) côté backend vérifie quotidiennement les `Reminder` à échéance et déclenche les notifications correspondantes.
- La documentation Swagger/OpenAPI est servie à `/docs` (UI) et `/docs/json` (spec JSON).
- Flux d'inscription : création du compte → génération **code OTP** envoyé par email → vérification via `POST /auth/verify-email` (statut `emailVerified` **informatif uniquement** — il ne bloque rien). Alternativement : connexion **Google** (`POST /auth/google`) avec `authProvider = "GOOGLE"`.

---

## 5. Modèle de données (schéma Prisma complet)

Le schéma complet est au fichier `vetclinic-backend/prisma/schema.prisma`. **14 modèles** et **12 enums** :

### Modèles

| Modèle | Table | Description |
|---|---|---|
| **User** | `users` | Compte utilisateur (CLIENT, VETERINARIAN, ADMIN, STAFF) + `authProvider` (LOCAL/GOOGLE) + `emailVerified` |
| **Veterinarian** | `veterinarians` | Profil vétérinaire lié à un User (spécialité, bio, disponibilité) |
| **Pet** | `pets` | Animal lié à un owner (User client) |
| **Appointment** | `appointments` | Rendez-vous : pet, client, véto (nullable), type, statut, créneaux |
| **TimeSlotBlock** | `time_slot_blocks` | Blocage de créneaux par un véto |
| **MedicalRecord** | `medical_records` | Note de consultation, diagnostic, lié à un animal et un véto |
| **Reminder** | `reminders` | Rappel (vaccin, traitement), généré automatiquement depuis un MedicalRecord |
| **Conversation** | `conversations` | Conversation client-véto (veterinarianId obligatoire) |
| **Message** | `messages` | Message dans une conversation (texte + pièce jointe) |
| **Document** | `documents` | Fichiers liés à un animal ou un dossier médical |
| **Notification** | `notifications` | Notification interne (rappel RDV, message, etc.) |
| **AuditLog** | `audit_logs` | Journal d'audit des actions sensibles (création, suppression, consultation) |
| **PasswordResetToken** | `password_reset_tokens` | Tokens de réinitialisation de mot de passe |
| **EmailVerificationCode** | `email_verification_codes` | Code OTP de vérification d'email (hashé, lié à un User) |

### Enums

`UserRole`, `AuthProvider`, `AppointmentType`, `AppointmentStatus`, `MedicalRecordType`, `ReminderType`, `ConversationStatus`, `AttachmentType`, `DocumentType`, `NotificationType`, `PetSpecies`, `PetSex`

### Règles métier clés

1. Un `MedicalRecord` de type vaccination doit pouvoir générer automatiquement un `Reminder` avec une `due_date` calculée (ex : +6 mois).
2. Le workflow de statut d'un `Appointment` doit suivre : `PENDING → CONFIRMED → COMPLETED` (ou `CANCELLED` / `NO_SHOW` à tout moment avant `COMPLETED`).
3. Avant de créer un rendez-vous, vérifier qu'il n'y a pas de chevauchement avec : (a) un autre rendez-vous `PENDING`/`CONFIRMED` sur le **même animal**, (b) si `veterinarianId` fourni, avec les RDV/blocages du **même vétérinaire**. `veterinarianId` est **optionnel** à la création (null autorisé).
4. Les animaux supportent le soft delete via `isActive` : un `DELETE /pets/:id` met `isActive` à `false`, et `GET /pets` ne retourne que les animaux actifs.
5. `POST /conversations` exige un `veterinarianId` valide (une conversation est toujours liée à un vétérinaire).
6. Un code OTP n'est valide qu'une seule fois et expiré après un délai court ; le champ `emailVerified` est informatif (aucun blocage fonctionnel).

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
| **Chiffrement au repos** | Mots de passe hachés avec bcrypt (12 rounds) ; codes OTP hashés en base | ✅ Implémenté |
| **Contrôle d'accès strict (RBAC)** | Un client ne peut accéder qu'à ses propres animaux, RDV, conversations et documents | ✅ Implémenté via `fastify.authorize` |
| **Validation stricte des entrées** | Toutes les données entrantes validées par Zod 4.4.3 | ✅ Implémenté sur toutes les routes |
| **Rate limiting** | 5 req/min sur routes auth (register/login), 100 req/min global | ✅ Implémenté via `@fastify/rate-limit` |
| **Audit log** | Traçabilité des actions sensibles (création, suppression) sur pets, medical-records, documents | ✅ Implémenté (`AuditLog` model + `logAudit` util) |
| **Fail-fast sur secrets** | Blocage au démarrage en production si `JWT_SECRET`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` manquants | ✅ Implémenté (`validate-env.ts`) |
| **Consentement explicite** | À l'inscription, case à cocher non pré-cochée | ⏳ Frontend uniquement (à faire dans la refonte) |
| **Droit d'accès et de suppression** | Le client doit pouvoir consulter et demander la suppression de ses données | ⏳ Partiellement (soft delete animaux) |
| **Sécurisation du chat** | Messagerie chiffrée en transit, contrôle d'accès sur les conversations | ✅ WebSocket avec JWT auth (?token=) |
| **Hébergement** | DB et fichiers en Tunisie ou pays reconnu adéquat | ⏳ Avant mise en production |
| **Séparation des secrets** | Variables d'environnement, jamais commitées | ✅ `.env` dans `.gitignore`, `.env.example` fourni |

---

## 7. Backend — structure du code

```
vetclinic-backend/
├── prisma/
│   ├── schema.prisma              # Schéma complet (14 modèles)
│   ├── seed.ts                    # Seed idempotent (users, pets, appts, records)
│   └── migrations/                # Migrations Prisma
├── src/
│   ├── server.ts                  # Point d'entrée (ecoute + cron)
│   ├── app.ts                     # buildApp() — registre plugins/routes (testable)
│   ├── validate-env.ts            # Fail-fast production secrets
│   ├── plugins/
│   │   ├── prisma.ts              # fastify.prisma (connexion DB)
│   │   ├── auth.ts                # JWT + fastify.authenticate / fastify.authorize
│   │   └── minio.ts               # Client S3 (upload + presigned URLs)
│   ├── routes/
│   │   ├── auth.ts                # POST register, login, change-password, google
│   │   ├── email-verification.ts  # POST verify-email, resend-verification (OTP)
│   │   ├── password-reset.ts      # POST forgot-password, reset-password
│   │   ├── pets.ts                # CRUD animaux + soft delete
│   │   ├── appointments.ts        # CRUD RDV + overlap check (animal + véto)
│   │   ├── medical-records.ts     # CRUD dossiers médicaux
│   │   ├── documents.ts           # CRUD documents (liés à pet/medical-record)
│   │   ├── downloads.ts           # GET presigned URL (ownership vérifié)
│   │   ├── uploads.ts             # POST multipart upload → MinIO
│   │   ├── conversations.ts       # REST chat (list, messages, create)
│   │   ├── ws-conversations.ts    # WebSocket chat (/ws/conversations/:conversationId)
│   │   ├── time-slot-blocks.ts    # CRUD blocages créneaux véto
│   │   ├── veterinarians.ts       # POST (admin) + GET (auth) vétérinaires
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
│       ├── auth.test.ts           # 11 tests (register, login, OTP, google, déjà-vérifié…)
│       ├── rbac.test.ts           # 4 tests (CLIENT→403, ADMIN→200, etc.)
│       ├── ownership.test.ts      # 5 tests (isolation cross-client)
│       ├── appointments.test.ts   # 4 tests (overlap véto, invalid, cross-owner)
│       └── veterinarians-conversations.test.ts  # 6 tests (vets + conversations)
├── vitest.config.ts               # include src/**/*.test.ts (exclut dist/)
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
- **Tests** : chaque requête utilise une IP cliente distincte (`remoteAddress`) pour isoler le rate limiter ; jamais de modifications de prod pour les tests.

---

## 8. API Backend — endpoints (45 routes)

> Source de vérité : Swagger à `/docs` (UI) et `/docs/json` (OpenAPI 3.0). Liste **vérifiée contre `/docs/json` le 23/09/2026** : 44 routes documentées OpenAPI + 1 WebSocket (non couverte par OpenAPI). Les WebSockets ne sont pas exposées dans la spec OpenAPI.

### Authentification (+ vérification email, Google)

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| POST | `/api/v1/auth/register` | Public | Inscription client (envoie un code OTP par email) |
| POST | `/api/v1/auth/login` | Public | Connexion (retourne JWT + user) |
| POST | `/api/v1/auth/verify-email` | Auth | Vérifier l'email avec le code OTP (400 si déjà vérifié) |
| POST | `/api/v1/auth/resend-verification` | Auth | Renvoyer un nouveau code OTP |
| POST | `/api/v1/auth/google` | Public | Connexion/inscription via Google (token idToken, `authProvider: GOOGLE`) |
| POST | `/api/v1/auth/change-password` | Auth | Changement de mot de passe (requiert mot de passe actuel) |
| POST | `/api/v1/auth/forgot-password` | Public | Demande de réinitialisation (envoie token) |
| POST | `/api/v1/auth/reset-password` | Public | Réinitialisation avec token |

### Animaux (Pets)

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/api/v1/pets` | CLIENT | Liste des animaux actifs (filtré par ownership) |
| POST | `/api/v1/pets` | CLIENT | Créer un animal |
| PATCH | `/api/v1/pets/:id` | CLIENT | Modifier un animal |
| DELETE | `/api/v1/pets/:id` | CLIENT | Soft delete (isActive=false) |

> Note : il n'existe **pas** de route `GET /pets/:id` (détail) dans le code — le détail est obtenu via la liste ou les sous-ressources (`/pets/:id/medical-records`, `/pets/:id/documents`).

### Rendez-vous (Appointments)

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/api/v1/appointments` | CLIENT | Liste des RDV (filtré par ownership) |
| POST | `/api/v1/appointments` | CLIENT | Créer un RDV (overlap check animal + véto si fourni ; `veterinarianId` optionnel) |
| PATCH | `/api/v1/appointments/:id/status` | VET/ADMIN/STAFF | Changer le statut |
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
| POST | `/api/v1/uploads` | VET/ADMIN/STAFF | Upload multipart vers MinIO (limit 10 Mo) |

### Chat (Conversations)

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/api/v1/conversations` | CLIENT | Liste des conversations |
| POST | `/api/v1/conversations` | CLIENT | Créer une conversation (veterinarianId obligatoire) |
| GET | `/api/v1/conversations/:id/messages` | CLIENT | Messages paginés |
| POST | `/api/v1/conversations/:id/messages` | CLIENT | Envoyer un message (REST) |
| WS | `/api/v1/ws/conversations/:conversationId?token=` | Auth | WebSocket temps réel (non couvert par OpenAPI) |

### Notifications

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/api/v1/notifications` | CLIENT | Liste des notifications |
| GET | `/api/v1/notifications/unread-count` | CLIENT | Nombre de non-lues |
| PATCH | `/api/v1/notifications/:id/read` | CLIENT | Marquer une notification comme lue |
| PATCH | `/api/v1/notifications/read-all` | CLIENT | Marquer toutes comme lues |
| PATCH | `/api/v1/notifications/mark-read` | CLIENT | Marquer plusieurs notifications (batch) |
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
| POST | `/api/v1/veterinarians` | ADMIN | Créer un véto (avec compte User associé) |
| GET | `/api/v1/veterinarians` | Auth (tous rôles) | Liste des vétérinaires (utilisée par l'app pour le sélecteur) |

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

**Statut** : fonctionnelle sur Chrome et Android (SDK 37). **`flutter analyze` : 0 problème. Tests widget : 9/9 PASS.** Auth étendue : inscription + vérification email (OTP) + Google Sign-In.

#### Suivi des phases (récent)

| Phase | Contenu | Statut | Preuve |
|---|---|---|---|
| Phase 2a | Sélecteur de vétérinaire + bouton « Nouvelle conversation » | ✅ commit `180d902` | widget test `veterinarian_picker_test.dart` |
| Phase 2b | Écran de vérification email (OTP) + redirection après inscription | ✅ commit `e059151` | widget test `email_verification_test.dart` |
| Phase 2c | Bouton Google Sign-In (API v7 : `GoogleSignIn.instance.initialize()` + `authenticate()`) | ✅ commit `0dd4018` | widget test `google_sign_in_test.dart` |
| Phase 5 | Chat temps réel via WebSocket (broadcast bidirectionnel) | ✅ | preuve : 2 connexions simultanées, message reçu en direct |
| Refonte « PawCare » | Thème, accueil, 4 onglets, profil, stepper RDV | 🔜 à venir | — |

#### Structure du code

```
vetclinic_app/lib/
├── main.dart                          # Navigation (NavigationBar 3 onglets: Animaux/RDV/Messages)
├── theme/app_theme.dart               # Thème Material 3 (tokens, palette — à enrichir avec la refonte)
├── utils/date_utils.dart              # Helpers dates (formatage français)
├── models/
│   ├── user.dart                      # Modèle User
│   ├── pet.dart                       # Modèle Pet (fromJson, speciesLabel, sexLabel)
│   ├── appointment.dart               # Modèle Appointment (nested Pet/Client)
│   ├── conversation.dart              # Modèle Conversation (vétérinaire lié)
│   ├── message.dart                   # Modèle Message
│   └── veterinarian.dart              # Modèle Veterinarian (picker)
├── services/
│   ├── api_service.dart               # Dio + JWT interceptor + flutter_secure_storage
│   └── chat_ws_service.dart           # Client WebSocket du chat (?token=)
├── providers/
│   ├── auth_provider.dart             # AuthState/AuthNotifier (login, register, logout, loginWithGoogle, verifyEmail, resendVerification)
│   ├── pets_provider.dart             # PetsState/PetsNotifier (load, create, refresh)
│   ├── appointments_provider.dart     # AppointmentsState (load, create, cancel)
│   ├── conversations_provider.dart    # ConversationsState (list, messages, send)
│   └── veterinarians_provider.dart    # VeterinariansState (load — pour le picker)
└── screens/
    ├── login_screen.dart              # Connexion (email/mot de passe + bouton Google)
    ├── register_screen.dart           # Inscription (redirige vers la vérification email)
    ├── email_verification_screen.dart # Saisie/renvoi du code OTP
    ├── pets_list_screen.dart          # Liste animaux (pull-to-refresh, FAB)
    ├── pet_form_screen.dart           # Formulaire ajout animal
    ├── pet_detail_screen.dart         # Détail animal
    ├── appointments_list_screen.dart  # Liste RDV (couleurs/statuts)
    ├── appointment_form_screen.dart   # Formulaire création RDV
    ├── conversations_list_screen.dart # Liste conversations (+ FAB « Nouvelle conversation »)
    ├── veterinarian_picker_screen.dart# Sélecteur de vétérinaire (réutilisable)
    └── chat_screen.dart               # Chat temps réel (WebSocket)
```

#### Stack Flutter

- **Riverpod** pour la gestion d'état (`StateNotifierProvider`)
- **Dio** pour les appels API (intercepteur JWT automatique)
- **flutter_secure_storage** (`jwt_token`) — jamais `shared_preferences` pour un token
- **google_sign_in ^7.2.0** — « Google Sign-In » v7 : `initialize()` puis `authenticate()`
- **Material 3** (`useMaterial3: true`)

#### Limitations connues

- **SDK Android 37** : build Android avec `compileSdk = 37` (lent selon la connexion, solution documentée dans le README).
- **Tests & `flutter_secure_storage`** : pas d'implémentation en test → les fakes doivent surcharger `token`/`setToken`/`clearToken`.
- **Pas encore implémenté** : FCM (notifications push), photo/upload fichiers, écran profil détaillé, sélecteur vétérinaire dans le **formulaire de RDV** (le picker existe pour le chat ; à réutiliser dans le stepper RDV), consentement RGPD à l'inscription.

### 9.2 Back-office web (Next.js)

**Statut** : ✅ **livré (Phase 6)** — connexion staff, dashboard (stats + agenda), proxy API sécurisé côté serveur.

```
vetclinic-dashboard/
├── src/app/
│   ├── page.tsx                      # Redirection vers /login ou /dashboard
│   ├── login/page.tsx                # Connexion staff
│   ├── dashboard/page.tsx            # Dashboard (stats, agenda RDV)
│   └── api/                          # Routes Next.js
│       ├── auth/(login|me|logout)/route.ts   # Session côté serveur
│       └── proxy/[...slug]/route.ts  # Proxy vers le backend (/api/v1/...)
├── src/lib/{api.ts, auth.tsx}
├── src/middleware.ts                 # Protection des routes
└── test_dashboard.js                 # Script d'intégration (preuve : 6/6)
```

Preuve de fonctionnement : **`test_dashboard.js` — 6/6 scénarios PASS** (login, session, proxy vers le backend, stats du dashboard, déconnexion).

---

## 10. Tests

### Backend (Vitest) — suite complète **30/30** (3 runs consécutifs validés le 23/09/2026)

| Fichier | Tests | Couverture |
|---|---|---|
| `auth.test.ts` | 11 | Register, login, duplicate email, mauvais mot de passe, email inexistant, code OTP, verify-email OK, code invalide, **email déjà vérifié (400)**, Google invalide, Google email local existant |
| `veterinarians-conversations.test.ts` | 6 | GET vétérinaires, création conversation avec véto obligatoire, messages |
| `ownership.test.ts` | 5 | Can't view/edit/delete another's pet, filtered list |
| `rbac.test.ts` | 4 | CLIENT→403 dashboard, ADMIN→200, CLIENT→403 vets, no token→401 |
| `appointments.test.ts` | 4 | Overlap détection (même véto → 409), sans vétérinaire, retards invalides, cross-owner pet→403 |
| **Total** | **30** | Auth, vets, conversations, ownership, RBAC, appointments |

Note historique : le test « email déjà vérifié » a longtemps échoué à tort (erreurs Prisma « vides »). **Cause racine** : le rate limiter (`POST /auth/register`, max 5/min/IP) renvoyait 429 au 6e register de la suite — l'utilisateur n'était jamais créé. Correction : isolation du rate limiter par IP distincte par requête (`remoteAddress`), le limiter reste actif. Voir `auth.test.ts` (commentaire détaillé).

### Flutter (widget tests) — 9/9

| Test | Couverture |
|---|---|
| `auth` / `login`/`register` | Formulaire, redirection vers vérification email après inscription |
| `email_verification_test.dart` | Saisie code OTP, renvoi, erreurs |
| `google_sign_in_test.dart` | Bouton Google, gestion annulation/erreur |
| `veterinarian_picker_test.dart` | Chargement / sélection d'un vétérinaire |
| Pets / appointments | CRUD animaux + création RDV |

### Intégration API (scripts PowerShell — historique phase initiale)

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

- [ ] **Intégration FCM** pour les notifications push (rappels RDV, messages)
- [ ] **Upload de fichiers côté Flutter** (photos animaux, documents) — le backend (`/uploads`, `/downloads`, MinIO) est prêt
- [ ] **Écran profil utilisateur** dans l'app mobile
- [ ] **Consentement explicite à l'inscription** (case à cocher non pré-cochée — exigence 2004-63/INPDP)
- [ ] **Sélecteur de vétérinaire dans le formulaire de RDV** (réutiliser `veterinarian_picker_screen.dart` dans le stepper RDV)
- [ ] **Refonte visuelle « PawCare »** : thème/palette, écran d'accueil, navigation 4 onglets (Accueil / Animaux / Rendez-vous / Profil), page détail animal (bannière/badges/onglets), formulaire RDV en **stepper 4 étapes**, écran de confirmation, placement du chat à décider (5e onglet vs accès depuis Accueil/Profil)

### Secondaire (post-MVP)

- [ ] Dashboard stats avancées (graphiques, tendances)
- [ ] Génération automatique de rappels depuis les MedicalRecord (schéma `Reminder` prêt)
- [ ] Ordonnances numériques structurées
- [ ] Programme de fidélité, avis clients
- [ ] Interface complète multi-vétérinaires (assignation, plannings individuels)

### Conformité (INPDP)

- [ ] **Déclaration préalable** à l'INPDP + **consentement écrit** pour les données de santé + **accord préalable** avant mise en production
- [ ] Mettre en œuvre le **droit d'accès et de suppression** des données personnelles côté client
- [ ] Hébergement validé en Tunisie ou pays reconnu adéquat
- [ ] Audit de sécurité externe

---

## 12. Résumé des priorités pour l'agent qui reprend ce projet

1. Respecter strictement le modèle de données et les rôles définis (ne pas simplifier le RBAC).
2. Ne jamais introduire de dépendance à un service cloud hébergeant des données hors de Tunisie sans validation explicite.
3. Toujours valider les entrées et restreindre les données retournées par l'API selon le rôle de l'utilisateur.
4. Le MVP prioritaire est : auth (OTP + Google), gestion animaux, prise de RDV, chat texte+photo, rappels vaccins, dashboard stats. Le paiement est explicitement hors scope.
5. Documenter toute nouvelle route ou table ajoutée en cohérence avec ce document ; vérifier les routes contre `/docs/json` (source de vérité).
6. **Ne jamais remplacer `flutter_secure_storage` par `shared_preferences`** pour stocker des tokens — c'est une régression de sécurité (stockage en clair vs chiffré).
7. En cas de tests « qui échouent mystérieusement » sur auth : penser d'abord au **rate limiter** (5/min/IP), pas à Prisma — reproduire avec des IP distinctes dans les tests.
8. Prisma reste en **v5.x** — ne pas migrer en v6 sans accord explicite.