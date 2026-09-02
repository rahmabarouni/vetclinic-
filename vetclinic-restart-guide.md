# Comment relancer le projet après avoir éteint le PC

Ce guide couvre uniquement le **redémarrage** de ce qui est déjà installé — pas besoin de tout réinstaller. À garder sous la main à chaque fois que tu reprends le développement.

---

## Rappel de ta configuration actuelle

- **Base de données** : conteneur Docker `vetclinic-db`, exposé sur le port **5433** (pas 5432, à cause du conflit avec un PostgreSQL natif déjà installé sur ta machine)
- **Backend** : dossier `C:\Users\rahma\Desktop\vetclinic\vetclinic-backend`
- **Utilisateur DB** : `vetclinic` / mot de passe `REDACTED_DB_PASSWORD`

---

## Étape 1 — Démarrer Docker Desktop

1. Ouvre **Docker Desktop** depuis le menu Démarrer
2. Attends que l'icône baleine 🐳 dans la barre des tâches soit stable (pas d'animation de chargement) — ça prend 15-30 secondes

Sans cette étape, rien d'autre ne fonctionnera : le backend ne pourra pas atteindre la base de données.

---

## Étape 2 — Redémarrer le conteneur PostgreSQL

Ouvre **PowerShell** et tape :

```powershell
docker start vetclinic-db
```

Vérifie qu'il tourne bien :

```powershell
docker ps
```

Tu dois voir une ligne avec `vetclinic-db`, statut `Up`, et le port `0.0.0.0:5433->5432/tcp`.

> Pas besoin de refaire `docker run` — cette commande ne sert qu'à la **création initiale** du conteneur. Pour les fois suivantes, `docker start` suffit à réutiliser le même conteneur avec les mêmes données.

---

## Étape 3 — Lancer le serveur backend

Toujours dans PowerShell :

```powershell
cd C:\Users\rahma\Desktop\vetclinic\vetclinic-backend
npm run dev
```

Tu dois voir apparaître :

```
🐾 Serveur démarré sur http://localhost:3000
```

**Laisse cette fenêtre PowerShell ouverte** — le serveur tourne tant que la fenêtre reste ouverte. Si tu la fermes, le serveur s'arrête.

---

## Étape 4 — Vérifier que tout fonctionne

Ouvre un **nouveau** terminal PowerShell (sans fermer celui du serveur) et teste :

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/health"
```

Tu dois voir `status: ok`. Si c'est le cas, tout est opérationnel.

---

## Résumé express (une fois que tu connais la routine)

```powershell
# 1. Ouvrir Docker Desktop manuellement (icône sur le bureau ou menu Démarrer)

# 2. Dans PowerShell :
docker start vetclinic-db
cd C:\Users\rahma\Desktop\vetclinic\vetclinic-backend
npm run dev
#bech nhel prisma studio f command cmd o5ra
npx prisma studio


# Backend
docker-compose up -d              # PostgreSQL + MinIO
npx prisma migrate dev            # Migration
npx prisma db seed                # Données de test
npm run dev                       # Serveur dev (port 3000)

# Flutter
cd vetclinic_app
flutter run                        # Émulateur Android (10.0.2.2:3000) 
```

C'est tout — 3 commandes après avoir ouvert Docker Desktop.

---

## En cas de problème au redémarrage

| Symptôme                                                | Cause probable                                                   | Solution                                                                     |
| ------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `docker start vetclinic-db` renvoie une erreur          | Docker Desktop n'est pas encore complètement démarré             | Attends 30 secondes de plus et réessaie                                      |
| `npm run dev` affiche une erreur de connexion à la base | Le conteneur n'a pas eu le temps de démarrer avant le backend    | Relance `npm run dev` après avoir vérifié `docker ps`                        |
| Le port 3000 est "déjà utilisé"                         | Une ancienne fenêtre `npm run dev` tourne encore en arrière-plan | Ferme toutes les fenêtres PowerShell liées au projet, rouvre-en une nouvelle |
| `docker ps` ne montre rien du tout                      | Docker Desktop n'est pas lancé                                   | Retourne à l'étape 1                                                         |



---

## Astuce pour aller plus vite : configurer Docker Desktop au démarrage de Windows

Dans Docker Desktop → **Settings (⚙️) → General** → coche **"Start Docker Desktop when you sign in to your computer"**. Ainsi, Docker (et donc ta base de données) sera prêt automatiquement à chaque allumage du PC, et tu n'auras plus que les étapes 2 et 3 à faire.
