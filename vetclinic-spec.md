# Spécification projet — Application de gestion de clinique vétérinaire

> Document de référence destiné à un agent de développement (humain ou IA). Il couvre le produit, l'architecture, la stack technique, le modèle de données et les règles de sécurité/conformité à respecter impérativement.

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

| Couche | Technologie | Justification |
|---|---|---|
| App mobile client | **Flutter (Dart)** | Cross-platform, un seul code pour iOS/Android, rendu UI natif très cohérent, bon écosystème de packages pour WebSocket/FCM |
| Back-office web | **Next.js (React)** | Partage de composants/logique avec l'app mobile, écosystème React unifié |
| Backend / API | **Node.js + Fastify + TypeScript** | Performance, validation de schéma native (sécurité), plus léger que NestJS pour un dev solo. Le mobile (Dart) et le backend (TS) sont dans des langages différents — aucune logique n'est partagée entre eux, toute la validation métier doit donc vivre côté backend, jamais dupliquée côté client |
| ORM | **Prisma** | Types générés automatiquement, migrations sûres — important pour un dossier médical |
| Base de données | **PostgreSQL** | Relationnel, robuste, adapté à des données structurées et sensibles |
| Chat temps réel | **Socket.io** ou `@fastify/websocket` | Simple à intégrer avec Fastify |
| Authentification | **JWT + refresh tokens**, rôles (`CLIENT`, `VETERINARIAN`, `ADMIN`, `STAFF`) | Contrôle d'accès fin, nécessaire pour respecter le secret médical |
| Stockage fichiers | **MinIO (self-hosted, compatible S3)** | Pour photos d'animaux, radios, documents — hébergé localement pour la conformité |
| Notifications push | **Firebase Cloud Messaging (FCM)** | Seul composant Google toléré : ne transite pas de données personnelles sensibles |
| Hébergement | **VPS en Tunisie ou hébergeur EU reconnu adéquat par l'INPDP** | Voir section conformité — ne jamais héberger de données de santé sur un cloud américain sans autorisation |

### Pourquoi pas de solution "tout-en-un" type Firebase/Supabase pour tout ?

Ces plateformes hébergent par défaut sur des serveurs américains. Le transfert de données personnelles hors de Tunisie nécessite une autorisation de l'INPDP (voir section 6). Auto-héberger le backend (Node + PostgreSQL) donne un contrôle total sur la localisation des données. Firebase peut être conservé uniquement pour FCM, car les notifications push ne contiennent pas de données personnelles sensibles.

---

## 4. Architecture

```
[App Mobile - Flutter/Dart]  ──┐
                                 ├──► [API Backend - Fastify + TypeScript] ──► [PostgreSQL]
[Dashboard Web - Next.js]  ────┘              │
                                                ├──► [Socket.io / WebSocket - Chat temps réel]
                                                ├──► [MinIO - Stockage fichiers]
                                                └──► [FCM - Notifications push uniquement]
```

- L'app mobile et le dashboard web ne communiquent **jamais directement entre eux** — tout passe par l'API backend.
- Le backend est l'unique point d'accès à la base de données. Aucun client (mobile ou web) n'a d'accès direct à PostgreSQL.
- Un job planifié (cron) côté backend vérifie quotidiennement les `Reminder` à échéance et déclenche les notifications correspondantes.

---

## 5. Modèle de données (résumé des entités)

Le schéma complet est au format Prisma (PostgreSQL). Entités principales :

- **User** — table unique avec un champ `role` (CLIENT / VETERINARIAN / ADMIN / STAFF), plutôt que des tables séparées
- **Veterinarian** — infos spécifiques liées à un User (spécialité, bio, disponibilité)
- **Pet** — animal, lié à un `owner` (User client)
- **Appointment** — rendez-vous : pet, client, véto (nullable si pas encore assigné), type, statut (`PENDING`/`CONFIRMED`/`CANCELLED`/`COMPLETED`/`NO_SHOW`), créneaux
- **TimeSlotBlock** — blocage de créneaux par un véto
- **MedicalRecord** — note de consultation, diagnostic, liée à un animal et éventuellement à un rendez-vous
- **Reminder** — rappel (vaccin, traitement), généré automatiquement à partir d'un `MedicalRecord`, avec `due_date` et statut d'envoi
- **Conversation** / **Message** — chat client-véto, avec pièces jointes (image/document)
- **Document** — fichiers liés à un animal ou une consultation (radio, analyse, ordonnance, photo)
- **Notification** — notification interne (rappel RDV, nouveau message, confirmation/annulation, rappel vaccin)

### Règles métier clés à respecter dans l'implémentation

1. Un `MedicalRecord` de type vaccination doit pouvoir générer automatiquement un `Reminder` avec une `due_date` calculée (ex : +6 mois), pas uniquement une saisie manuelle.
2. Le workflow de statut d'un `Appointment` doit suivre : `PENDING → CONFIRMED → COMPLETED` (ou `CANCELLED` / `NO_SHOW` à tout moment avant `COMPLETED`).
3. Avant de confirmer un rendez-vous à un vétérinaire donné, vérifier qu'il n'y a pas de chevauchement avec un autre rendez-vous `PENDING` ou `CONFIRMED` sur le même créneau.

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

| Règle | Détail |
|---|---|
| **Chiffrement en transit** | HTTPS/TLS obligatoire sur toutes les communications (API, chat, uploads) — aucune exception, y compris en développement si des données réelles sont utilisées |
| **Chiffrement au repos** | Mots de passe hachés avec bcrypt (jamais en clair, jamais réversible) ; envisager le chiffrement au niveau disque pour la base de données en production |
| **Contrôle d'accès strict (RBAC)** | Un client ne peut accéder qu'à ses propres animaux, rendez-vous, conversations et documents. Un véto/staff peut accéder aux dossiers de tous les clients, mais chaque accès à un dossier médical devrait être **tracé** (log d'audit) |
| **Validation stricte des entrées** | Toutes les données entrantes doivent être validées par un schéma strict (ex : Zod côté Fastify) avant traitement — ne jamais faire confiance aux données du client |
| **Consentement explicite** | À l'inscription, case à cocher non pré-cochée pour la collecte et l'usage des données personnelles |
| **Droit d'accès et de suppression** | Le client doit pouvoir consulter et demander la suppression de ses données personnelles |
| **Sécurisation du chat** | La messagerie doit être chiffrée en transit ; éviter de stocker en clair des données médicales sensibles échangées par chat sans contrôle d'accès équivalent au dossier médical |
| **Hébergement** | Base de données et stockage de fichiers hébergés en Tunisie ou dans un pays reconnu adéquat par l'INPDP. Ne pas utiliser Firebase/AWS US/Google Cloud US par défaut pour les données personnelles ou de santé |
| **Séparation des secrets** | Toutes les clés (JWT secret, identifiants base de données, clés API) dans des variables d'environnement, jamais commitées dans le code source |
| **Principe du moindre privilège** | Chaque rôle (client, véto, staff, admin) ne doit avoir accès qu'aux routes et données strictement nécessaires à sa fonction |

### 6.3 Recommandation

Avant le lancement commercial, une consultation avec un avocat spécialisé ou directement avec l'INPDP (inpdp.nat.tn) est nécessaire pour finaliser la déclaration/autorisation de traitement — ce document ne remplace pas un avis juridique.

---

## 7. Backend — structure attendue

```
vetclinic-backend/
├── prisma/
│   └── schema.prisma          # Modèle de données complet
├── src/
│   ├── plugins/
│   │   ├── prisma.ts           # Connexion DB partagée (fastify.prisma)
│   │   └── auth.ts             # JWT + fastify.authenticate / fastify.authorize(roles)
│   ├── routes/
│   │   ├── auth.ts             # /auth/register, /auth/login, /auth/me
│   │   ├── pets.ts             # CRUD animaux + historique médical
│   │   ├── appointments.ts     # Prise de RDV, changement de statut, annulation
│   │   ├── medical-records.ts  # (à construire) notes de consultation côté véto
│   │   ├── reminders.ts        # (à construire) génération et suivi des rappels
│   │   ├── conversations.ts    # (à construire) chat REST + WebSocket
│   │   └── dashboard.ts        # (à construire) statistiques agrégées côté véto
│   ├── utils/
│   │   └── validation.ts       # Schémas Zod
│   └── server.ts               # Point d'entrée Fastify
```

### Conventions à respecter

- Toutes les routes protégées utilisent `preHandler: [fastify.authenticate]`, et celles réservées au staff ajoutent `fastify.authorize(['VETERINARIAN', 'ADMIN', 'STAFF'])`.
- Toute réponse contenant des données utilisateur doit explicitement sélectionner les champs retournés (`select`) pour éviter d'exposer accidentellement `passwordHash` ou d'autres champs sensibles.
- Le versioning d'API se fait via un préfixe `/api/v1`.

---

## 8. Frontend — attentes générales

### 8.1 App mobile (Flutter)

- Authentification persistante : stockage sécurisé du token via `flutter_secure_storage` (jamais `SharedPreferences` en clair pour un token)
- Gestion d'état recommandée : `Riverpod` ou `Provider` (éviter `setState` pur dès que l'app dépasse quelques écrans — plus difficile à maintenir et à tester)
- Client HTTP : `dio` (intercepteurs pour injecter le token JWT automatiquement, gérer le refresh, centraliser la gestion d'erreurs)
- Chat temps réel : `web_socket_channel` ou `socket_io_client` selon le choix fait côté backend (section 3)
- Notifications push : `firebase_messaging` + gestion des permissions iOS/Android
- Écrans principaux : Connexion/Inscription, Liste des animaux, Détail animal + historique, Prise de RDV, Liste des RDV, Chat, Notifications, Profil
- Gestion des états de chargement/erreur explicite sur chaque appel API (pas de silence en cas d'échec réseau) — utiliser des états explicites (`loading` / `error` / `data`) plutôt que de déduire l'état depuis des booléens épars
- Respecter les conventions Material Design (Android) et Cupertino (iOS) là où c'est pertinent, sans sur-personnaliser inutilement pour la v1

### 8.2 Back-office web (Next.js)

- Authentification staff séparée du flux client (routes protégées par rôle)
- Écrans principaux : Dashboard (stats), Calendrier RDV, Liste clients/animaux, Fiche animal (historique + ajout de note), Chat, Blocage de créneaux, Gestion de profil véto
- Le calendrier est l'écran central — doit supporter vue jour/semaine, drag-and-drop optionnel pour reporter un RDV

### 8.3 Règles transverses

- Aucune donnée sensible (token, informations médicales) ne doit être loggée côté client en production.
- Toute erreur API renvoyée au frontend doit être un message générique côté utilisateur (ne pas exposer de détails techniques/stack traces).

---

## 9. Ce qu'il reste à construire (au-delà du MVP backend déjà initialisé)

- [ ] Routes véto : `TimeSlotBlock` (blocage de créneaux)
- [ ] Routes véto : création de `MedicalRecord` + génération automatique de `Reminder`
- [ ] Chat temps réel (WebSocket) — routes `Conversation` / `Message`
- [ ] Upload de fichiers (photos, documents médicaux) via `@fastify/multipart` + MinIO
- [ ] Job planifié (cron) pour les rappels de vaccins/traitements à échéance
- [ ] Intégration FCM pour l'envoi effectif des notifications push
- [ ] Endpoints d'agrégation pour le dashboard stats (RDV du jour, taux d'annulation, etc.)
- [ ] App mobile Flutter (tous les écrans listés en 8.1)
- [ ] Dashboard web Next.js (tous les écrans listés en 8.2)
- [ ] Tests automatisés (backend au minimum : auth, permissions, logique de rendez-vous)
- [ ] Log d'audit des accès aux dossiers médicaux (traçabilité, exigence de conformité)
- [ ] Déclaration/autorisation auprès de l'INPDP avant mise en production

---

## 10. Résumé des priorités pour l'agent qui reprend ce projet

1. Respecter strictement le modèle de données et les rôles définis (ne pas simplifier le RBAC).
2. Ne jamais introduire de dépendance à un service cloud hébergeant des données hors de Tunisie sans validation explicite.
3. Toujours valider les entrées et restreindre les données retournées par l'API selon le rôle de l'utilisateur.
4. Le MVP prioritaire est : auth, gestion animaux, prise de RDV, chat texte+photo, rappels vaccins, dashboard stats. Le paiement est explicitement hors scope.
5. Documenter toute nouvelle route ou table ajoutée en cohérence avec ce document.
