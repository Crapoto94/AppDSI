# Formation Vibecoding avec OpenCode — Plan (~5h30, avec pause)

Public : 6 participants débutants, postes individuels en visio, internet + accès à l'écosystème DSI pour les clés API.

## Principes transversaux (tous les exercices)

- **Manifest d'appli** : rédigé **avec l'IA avant de coder** (objectif, stack, périmètre pressenti), puis tenu à jour jusqu'à la fin de chaque exercice (nom, objectif, stack, comment lancer, variables d'env/secrets utilisés, lien repo GitHub).
- **GitHub perso** : chaque participant crée son propre repo dès l'exercice 1 (en attendant l'org d'entreprise — cf. Djamel). Workflow simple : `init / add / commit / push`, pas de branches/PR à ce stade.
- **Clé Groq créée en séance**, en direct, pas de clé pré-fournie.
- **Demande d'amélioration à l'IA** : à la fin de chaque exercice, avant le commit final, demander à l'IA ce qu'elle améliorerait (sécurité, lisibilité, perf) — toujours suivi d'une relecture humaine, jamais un remplacement de celle-ci.

## Procédures de bonnes pratiques (document réutilisable au-delà de la formation)

> Ces deux procédures sont conçues pour survivre à la formation : elles seront partagées ensuite comme méthode commune. Basées sur l'écosystème DSI réel — `GUIDE_NOUVELLE_APP_VILLE.md` (référentiel technique de la Ville d'Ivry) et l'application réelle [Agora](https://github.com/Crapoto94/AgoraVibe) (backend Node/Express5 + mssql, frontend React/TS/Vite/Tailwind, Docker Compose).

### A. Démarrer une application from scratch

1. **Cadrer avant de coder** : objectif de l'app, utilisateurs cibles, périmètre minimal. Ne pas ouvrir OpenCode avant d'avoir une idée claire de ce qu'on veut.
2. **Faire rédiger un `MANIFEST.md` initial avec l'aide de l'IA, avant d'écrire une ligne de code** : objectif, stack visée, périmètre, contraintes connues. Ce n'est pas encore la doc technique finale (elle se complète au fil de l'eau, cf. étape 11) — c'est un contrat de départ qui sert ensuite de base au premier prompt. L'IA aide à **formaliser** ce cadrage, mais l'objectif et le périmètre restent décidés par l'humain, pas inventés par l'IA.
3. **Créer le repo Git dès le départ** (perso pour l'instant, org à venir), avec un README minimal (objectif, stack visée) et le `MANIFEST.md` de l'étape 2.
4. **Choisir la stack en cohérence avec le référentiel DSI**, pas au hasard : backend Node.js + Express, frontend React + TypeScript + Vite + Tailwind CSS, base de données PostgreSQL partagée (`ivry_admin`) avec un **schéma dédié par application** et des tables préfixées pour éviter les collisions, Docker Compose pour l'exécution. Le donner explicitement à OpenCode dans le prompt initial plutôt que de le laisser choisir.
5. **Poser un premier prompt précis et cadré**, qui reprend le `MANIFEST.md` (stack, contraintes, périmètre) — pas un prompt vague du type "fais-moi une app".
6. **`.env` dès la première variable sensible** : jamais de secret en dur dans le code, un `.env.example` documenté et commité, le vrai `.env` dans `.gitignore` dès la création du repo.
7. **Itérer en petits pas** : une fonctionnalité → vérification manuelle → commit. Ne pas laisser l'IA enchaîner de gros blocs de fonctionnalités sans regarder ce qui a été fait entre chaque étape.
8. **Authentification/API à choisir selon le besoin réel**, pas par défaut : dans l'écosystème DSI il existe trois systèmes distincts (API centrale APM avec `X-API-KEY` pour les services transverses mail/SMS/AD, Hub DSI avec clés `dsk_` pour les données métier de la ville, JWT applicatif pour les sessions internes) — ne pas les mélanger sans raison.
9. **Sécuriser au fil de l'eau, pas à la fin** : requêtes SQL paramétrées, validation des entrées, pas de clé API en dur, rate limiting sur les routes sensibles si l'app est exposée.
10. **Prévoir un endpoint de santé (`/health`) et des logs structurés** dès qu'il y a un backend destiné à tourner en continu.
11. **Documenter au fur et à mesure** : `MANIFEST.md` mis à jour à chaque étape significative depuis sa version initiale (pas rédigé une seconde fois en bloc à la fin), doc Swagger des endpoints si API exposée.
12. **Dockeriser en parallèle du développement**, pas en tout dernier — Dockerfile + docker-compose alignés sur le pattern standard (ports dédiés, variables d'environnement, volumes si besoin de persistance).
13. **Demander à l'IA ses propres pistes d'amélioration** (sécurité, performance, lisibilité, dette technique) avant la revue humaine — un complément à la relecture, jamais un remplacement : l'IA a ses propres angles morts, en particulier sur le code qu'elle vient elle-même de générer.
14. **Revue finale avant tout partage** : relire le code généré comme celui d'un collègue, vérifier qu'aucun secret n'est commité, vérifier que README/MANIFEST sont à jour.

### B. Maintenir / faire évoluer une application existante

1. **Cloner le repo et faire l'état des lieux avant toute chose** : `git status`, `git log` récent, branches en cours — ne jamais foncer tête baissée sur `main`.
2. **Lire la documentation existante en premier** (README, docs type `agora.md`, `.env.example`) pour comprendre les paramètres attendus, sans jamais committer un vrai `.env`.
3. **Lancer `/init` dans OpenCode** : c'est le moment où cette commande prend tout son sens — elle scanne le code réel existant (structure `backend/`/`frontend/`, dépendances, conventions déjà en place) et génère/actualise un `AGENTS.md` qui sert de contexte fiable à l'IA avant toute modification. Sur un projet from scratch vide, `/init` n'a rien à analyser ; ici, sur du code réel, c'est l'inverse : c'est l'outil le plus utile de toute la procédure.
4. **Relire soi-même l'`AGENTS.md` généré** avant de s'en servir — vérifier qu'il reflète bien la réalité du projet, corriger si besoin, puis le committer.
5. **Faire expliquer à OpenCode la zone de code visée** avant d'y toucher (ex. un endpoint précis) pour vérifier qu'il a bien intégré le contexte de l'`AGENTS.md`.
6. **Utiliser des accès en lecture seule / environnement de dev** quand la base est sensible (ex. base legacy SQL Server de production) — ne jamais laisser l'IA se connecter en écriture sur une base de prod sans validation humaine explicite.
7. **Respecter les conventions déjà en place** plutôt que d'imposer un nouveau style : organisation modulaire par fonctionnalité, requêtes paramétrées, documentation Swagger des endpoints, logs structurés, health checks, rate limiting sur les routes sensibles.
8. **Petits commits, un par changement logique**, messages clairs — jamais de commit fourre-tout sur une app qui tourne déjà en production.
9. **Tester localement avant de proposer un changement** (dev, puis Docker Compose si pertinent) — ne jamais se fier uniquement au fait que "le code s'exécute sans erreur".
10. **Mettre à jour la documentation existante** (README, doc technique, `MANIFEST.md`, Swagger) si le changement modifie le comportement ou les paramètres.
11. **Vérifier qu'aucune donnée sensible/personnelle n'a été exposée ou exportée** pendant les manipulations (ex. données de réservation avec noms/coordonnées).
12. **Demander à l'IA ses propres pistes d'amélioration** sur la zone modifiée (sécurité, régression possible, cohérence avec le reste du code) avant la revue humaine — complément à la relecture, jamais un remplacement.
13. **Revue avant merge/déploiement** : relire le diff généré par l'IA comme celui d'un collègue, jamais un merge "à l'aveugle".

### C. Cas particulier — générer à partir d'un prompt unique, cadré par une méthode documentée

> Variante de la procédure A, volontairement à l'opposé du "petits pas" enseigné partout ailleurs. Elle ne fonctionne que dans un cadre précis — voir Exercice 6 (résumé condensé) et Exercice 7 (documents officiels complets).

- Ne s'applique que si le domaine est **documenté par une référence publique et structurée** (une méthodologie, un référentiel, une norme) — jamais pour un besoin métier flou ou implicite.
- Le prompt unique doit intégrer explicitement la structure de la référence (étapes, entités, terminologie) plutôt que de compter sur la connaissance interne du modèle, qui peut être datée, incomplète, ou confondre des méthodes voisines.
- **Cas particulier du multi-documents (cf. Ex7)** : plus les sources fournies sont nombreuses et volumineuses (un guide complet + plusieurs fiches complémentaires), plus le risque augmente que l'IA privilégie silencieusement une source sur une autre, ou mélange des niveaux de détail incompatibles entre documents. Demander systématiquement, pour chaque élément notable produit, de quel document précis il provient.
- Demander systématiquement, dans le même prompt ou en fin de génération, que l'IA **explicite ce qu'elle a interprété ou complété par elle-même**, faute d'information — c'est le seul filet de sécurité sur une génération non découpée en petits pas vérifiés.
- Toujours suivi d'une vérification croisée avec la documentation de référence, pas seulement d'une revue de code générique.

---

## Bonnes pratiques — Checklist commune (à garder sous la main)

> Version condensée des procédures A et B ci-dessus, pensée pour être collée près de l'écran ou reprise dans un `CONTRIBUTING.md` d'équipe.

### Pourquoi la stack du `GUIDE_NOUVELLE_APP_VILLE.md` — comprendre le "pourquoi", pas juste appliquer

| Choix | Raison d'être |
|---|---|
| **Node.js + Express** (backend) | Un seul langage (JS/TS) partagé avec le frontend → moins de charge mentale pour une petite équipe/DSI, écosystème npm très large, et c'est le langage qu'OpenCode maîtrise le mieux (plus de code d'entraînement, meilleures suggestions) |
| **React + TypeScript + Vite + Tailwind** (frontend) | Le typage TypeScript attrape des erreurs de contrat à la compilation plutôt qu'en prod — précieux quand une partie du code est générée par IA et pas relue ligne à ligne. Vite = démarrage/rebuild rapides. Tailwind = cohérence visuelle sans réinventer un design system à chaque appli, et des classes utilitaires que l'IA génère de façon très fiable |
| **PostgreSQL partagée (`ivry_admin`) avec un schéma dédié par appli**, plutôt qu'une base par appli | Mutualise l'infrastructure (un seul serveur à sécuriser/sauvegarder/monitorer côté DSI) tout en isolant les données de chaque appli par schéma + préfixe de table (pas de collision, droits scoppés). Évite la prolifération de petites bases orphelines impossibles à inventorier (voir "shadow IT" plus bas) |
| **Docker Compose** | Portabilité ("ça marche pareil en dev/staging/prod"), déploiement reproductible et scriptable (cf. le pattern `docker-compose.yml` + script de pull utilisé par apm), isolation des dépendances entre applis sur un même serveur |
| **3 systèmes d'auth séparés** (APM `X-API-KEY` / Hub DSI `dsk_` / JWT applicatif) | Séparation des responsabilités : APM pour les services transverses génériques (mail/SMS/AD), Hub DSI pour les données métier de la ville avec des clés traçables et révocables individuellement, JWT pour les sessions propres à chaque appli. Ne pas les mélanger limite le rayon d'exposition ("blast radius") si une clé fuite un jour |

### Checklist — avant de coder
- [ ] Objectif et périmètre de l'app clairement définis (une phrase suffit)
- [ ] `MANIFEST.md` initial rédigé **avec l'aide de l'IA, avant la première ligne de code** (objectif, stack, périmètre) — l'humain décide, l'IA formalise
- [ ] Stack choisie conforme au référentiel DSI, sauf raison explicite documentée
- [ ] Repo Git créé, `.gitignore` en place dès le premier commit

### Checklist — pendant le développement
- [ ] Prompts précis, un objectif clair par prompt (pas de fourre-tout)
- [ ] Itération en petits pas, vérification humaine après chaque étape
- [ ] Aucun secret en dur — tout passe par `.env` / `.env.example`
- [ ] Requêtes SQL paramétrées, jamais de concaténation de chaînes
- [ ] Commits fréquents, un par changement logique, message clair
- [ ] `MANIFEST.md` tenu à jour au fil de l'eau, pas rédigé d'un coup à la fin

### Checklist — avant de partager / merger / déployer
- [ ] Demande faite à l'IA de ses propres pistes d'amélioration (sécurité, perf, lisibilité) — **avant** la relecture humaine, jamais à sa place
- [ ] Relecture humaine du code généré (jamais de merge "à l'aveugle")
- [ ] Vérification qu'aucun secret n'est commité (`git diff`, recherche de "key"/"password"/"token")
- [ ] Test manuel du chemin principal + au moins un cas limite
- [ ] Documentation à jour (README, MANIFEST, Swagger si API exposée)
- [ ] Vérification RGPD si des données personnelles sont impliquées

### Checklist — sur du code existant (maintenance)
- [ ] `git status` / `git log` avant de commencer
- [ ] `/init` lancé et `AGENTS.md` relu par un humain avant d'être committé
- [ ] Conventions déjà en place respectées, pas de style imposé en solo
- [ ] Accès en lecture seule sur toute base sensible tant que rien n'est validé

---

## Sécurité de l'application

### Secrets et accès
- Toute clé/API/mot de passe passe par `.env`, jamais en dur dans le code ni dans un prompt copié-collé ailleurs
- Clés à portée minimale : ne demander que les droits nécessaires (ex. lecture seule sur Agora tant que ce n'est pas un besoin d'écriture validé)
- Ne jamais logger un secret, même en debug

### Authentification et autorisation
- Toute vérification de droits se fait **côté serveur**, jamais côté frontend seul (le frontend peut être contourné)
- Sessions avec expiration, pas de token qui vit indéfiniment
- Ne pas mélanger les 3 systèmes d'auth DSI sans raison (cf. checklist ci-dessus)

### Entrées et sorties
- Toute entrée utilisateur est validée côté serveur (jamais confiance au frontend)
- Requêtes SQL paramétrées uniquement (anti-injection)
- Sorties échappées côté frontend (anti-XSS), en particulier si du contenu utilisateur est réaffiché

### Endpoints sensibles
- Rate limiting sur les routes qui coûtent ou qui ont un impact (ex. envoi de SMS — éviter le spam ou le déni de service par sur-sollicitation)
- CORS configuré explicitement, pas en `*` par défaut sur une app qui gère des données internes

### Données personnelles (agents, citoyens, usagers)
- Minimisation : ne stocker/exporter que ce qui est nécessaire à la fonctionnalité
- Pas de données personnelles en clair dans les logs
- Base légale et durée de conservation à clarifier dès la conception si l'app touche des données RGPD (agents municipaux, demandeurs de salle, usagers...)

### Dépendances
- Ne pas installer un package proposé par l'IA sans vérifier qu'il existe réellement et qu'il est légitime (voir risque de "package hallucination" ci-dessous)
- Dépendances tenues à jour, lockfile commité

### Environnements
- Éviter par défaut d'écrire sur une base ou un service de production (SMS réel, AD réel, base Agora en prod) — préférer mocks ou environnement de test. Quand un vrai appel est nécessaire (cf. Ex4 : vraie API ville), le rendre sûr par des garde-fous explicites plutôt que par l'absence d'accès : destinataire figé et connu de tous, rate limiting strict, clé à portée minimale
- Images Docker officielles/à jour, `.env` réel jamais copié dans une image
- Ne jamais laisser l'IA installer un outil système (interpréteur, runtime, CLI globale) sans lire et valider explicitement la commande proposée — une dépendance de projet (npm/pip local) n'a pas le même niveau de risque qu'une installation globale sur le poste

---

## Risques du vibecoding

### Risques généraux
- **Hallucination de code ou de dépendances** : l'IA peut inventer des fonctions, des endpoints, voire des packages qui n'existent pas. C'est même devenu un vecteur d'attaque documenté, le **"slopsquatting"** : des attaquants publient de vrais packages malveillants sous les noms que l'IA hallucine le plus souvent, en pariant qu'un développeur pressé va les installer sans vérifier ([Wikipedia — Slopsquatting](https://en.wikipedia.org/wiki/Slopsquatting), [CSA — AI Supply Chain Risk](https://labs.cloudsecurityalliance.org/research/csa-research-note-slopsquatting-ai-supply-chain-20260419-csa/))
- **"Ça s'exécute" ≠ "c'est correct"** : le code peut tourner sans erreur et pourtant contenir un bug métier, une faille de sécurité ou une mauvaise pratique invisible à l'usage
- **Sur-confiance progressive** : l'effort de relecture a tendance à diminuer avec le temps, alors que le volume de code généré augmente — c'est l'inverse de ce qu'il faudrait
- **Limites de l'auto-critique de l'IA** : demander à l'IA "comment améliorer ce code" est utile et à encourager (cf. checklists), mais elle a les mêmes angles morts que ceux qui ont produit le code — en particulier sur ses propres choix ou ses propres erreurs de logique. Ça reste un complément à la revue humaine, jamais un substitut
- **Fuite de contexte vers un tiers** : coller du code, un schéma de base ou des données réelles dans un prompt envoyé à un LLM externe (Groq ou autre) peut exposer des informations sensibles si on n'y prend pas garde (clé API collée par erreur, capture d'écran envoyée, extrait de données réelles d'agents/citoyens)
- **Dérive de périmètre ("scope creep")** : l'IA a tendance à faire "plus" que demandé si le prompt n'est pas cadré — fichiers, dépendances ou fonctionnalités en plus, non décidés consciemment
- **Perte de compétence / dépendance à l'outil** : risque de livrer du code qu'on ne comprend plus vraiment, donc difficile à dépanner sans IA
- **Coûts et quotas cachés** : appels API répétés (LLM, SMS, services tiers) peuvent générer des coûts ou atteindre des quotas sans qu'on s'en aperçoive tout de suite

### Risques spécifiques pour une équipe / une organisation
- **Hétérogénéité de qualité** : sans convention commune (`AGENTS.md`/`MANIFEST.md` partagés), chaque personne — et chaque session IA — produit un style différent
- **Savoir fragmenté** : si le code est généré vite par plusieurs personnes sans revue croisée, plus personne ne maîtrise vraiment le fonctionnement profond de l'app
- **Goulot d'étranglement à la revue** : la vitesse de génération dépasse largement la capacité de relecture humaine → risque de merges mal ou pas relus si la charge de revue n'est pas anticipée collectivement
- **Prolifération d'apps "shadow IT"** : la facilité à créer des apps encourage la multiplication de petits outils non recensés, non maintenus, non sécurisés — d'où l'intérêt du `MANIFEST.md` comme brique d'inventaire pour la DSI
- **Divergence des pratiques entre équipes** : sans méthode commune formalisée (l'objet même de cette formation), chaque équipe développe ses propres habitudes, rendant la maintenance croisée difficile
- **Exposition d'API internes critiques** : brancher des agents IA sur des API internes sensibles (APM, Hub DSI, bases de production) multiplie les points d'entrée à sécuriser — accès strictement scoppé/lecture seule tant qu'un humain n'a pas validé l'écriture
- **Incohérence dans la gestion des secrets** : sans standard partagé, chacun stocke ses clés différemment — d'où la nécessité d'une convention `.env`/`.env.example` commune à toute la DSI

---

## Déroulé

| Bloc | Durée | Contenu |
|---|---|---|
| 1. Setup | 40 min | Install OpenCode, clé provider via écosystème DSI, création repo GitHub perso, notion de manifest d'appli (exemple : apm), **notion de variables d'environnement / `.env`** |
| 1bis. Mini-démo — Environnement manquant (rapide) | 10 min | Un prompt qui nécessite un outil probablement absent du poste (ex. Python) : observer comment OpenCode détecte le manque, propose une installation, et demande confirmation avant d'agir |
| 2. Ex1 — App simple | 35 min | App from scratch (to-do list, calculatrice...). Itérations : compteur, style, puis ville de la tâche + carte (API géocodage publique, sans clé). Premier commit + push. Premier `MANIFEST.md` |
| 3. Ex2 — App interactive + IA embarquée | 55 min | **Notion frontend/backend** puis app qui appelle l'API Groq (chat, résumé, Q&A) via un petit backend qui cache la clé (jamais côté frontend). Création clé Groq en direct, stockée en `.env` côté backend. Itération en petits pas, debug assisté, commits réguliers |
| — Pause | 10-15 min | |
| 4. Ex3 — Analyse d'une base de données réelle (Agora) | 55 min | **Notions BDD** (tables, SQL de base) puis exploration de la base réelle d'Agora (outil de réservation de salles d'une collectivité), credentials fournis en séance, extraction de statistiques, graphiques. Vérification des résultats métier (pas juste que le code tourne) |
| 5. Ex4 — Analyse et amélioration de l'app réelle Agora | 55 min | `git clone` du vrai repo [Agora](https://github.com/Crapoto94/AgoraVibe), `/init` pour l'analyser, lancement en local (backend + frontend, credentials saisis via l'interface **DB Settings**, pas en `.env`), vérification que le dashboard fonctionne. Puis amélioration avec la **vraie API ville** (clé fournie en séance) : identification d'agent par login (absente de l'app aujourd'hui), envoi de SMS réel restreint à un numéro de test, et envoi d'email avec rapport PDF généré à la volée en pièce jointe, restreint à une adresse de test |
| 6. Ex5 — Déploiement Docker | 50 min | **Notions Docker** (image, conteneur, Dockerfile, docker-compose, volumes, ports) puis dockerisation de l'app (sur le modèle apm), push GitHub, principe de déploiement par pull sur serveur |
| 6bis. Ex6 — Génération one-shot cadrée par une méthode documentée (bonus, optionnel) | 20-30 min | *Pour les groupes qui finissent en avance, ou en démo formateur si le temps manque.* Prompt unique et riche, appuyé sur un résumé condensé d'EBIOS RM (5 ateliers), pour générer une app de suivi qui respecte la méthode. Contraste volontaire avec l'approche "petits pas" du reste de la journée |
| 6ter. Ex7 — Même app, à partir des documents officiels complets (bonus, très optionnel) | — *plutôt hors séance ou démo* | Suite directe de l'Ex6 : reconstruire la même app en lisant cette fois le vrai guide PDF ANSSI + les 8 fiches méthodes officielles (pas un résumé). Compare les deux versions : ce qui est gagné en fidélité, ce qui coûte en temps, et le risque de synthèse incohérente entre plusieurs documents |
| 7. Synthèse bonnes pratiques | 25 min | Construite avec le groupe : prompts efficaces, taille des itérations, quand vérifier, gestion secrets/clés API, contenu d'un bon manifest, hygiène Git, et retour sur l'Ex6 (quand le one-shot marche, quand il ne marche pas) |

---

## Notions clés à expliquer (théorie courte, injectée au bon moment)

Chaque notion est présentée juste avant d'être utilisée en pratique (5-10 min max, sur tableau/slide simple), pas en cours magistral isolé.

### Installation d'un environnement manquant par l'IA (bloc 1bis)
- Distinguer **dépendance de projet** (un package npm/pip installé dans le dossier du projet, sans risque pour le reste de la machine) et **outil système** (un interpréteur, un runtime, une CLI installée globalement sur le poste) — l'exercice porte sur le second cas
- OpenCode peut détecter qu'un outil manque, proposer la commande d'installation et l'expliquer — mais ne doit **jamais l'exécuter sans confirmation explicite** (même logique que toute action à risque : mieux vaut confirmer en trop qu'installer sans regarder)
- **Point de vigilance DSI** : sur un poste professionnel géré par l'IT, l'installation peut échouer faute de droits administrateur — c'est une barrière de sécurité normale, pas un problème à contourner. Si ça arrive en séance, c'est en soi une bonne illustration à commenter avec le groupe
- Lien direct avec la section Sécurité (dépendances) et les risques du vibecoding (ne jamais laisser l'IA agir sur le système sans lecture préalable de ce qu'elle s'apprête à faire)

### Variables d'environnement & `.env` (bloc 1, réutilisé Ex2 et Ex5)
- Pourquoi séparer config/secrets du code (portabilité, sécurité)
- Un fichier `.env` n'est **jamais** commité (`.gitignore`), un `.env.example` documente les clés attendues sans les valeurs
- Comment une app lit ces variables (`process.env.X` en Node, `import.meta.env` côté Vite — cf. `.env.production` dans `frontend/` de apm)
- Lien direct avec la clé Groq (Ex2) et les ports/URLs de service en Docker (Ex5)

### Frontend / Backend (bloc 1, mis en pratique dès l'Ex2)
- **Frontend** = ce qui tourne dans le navigateur de l'utilisateur : visible et inspectable par n'importe qui (outils de développement du navigateur, touche F12) → **aucun secret ne doit s'y trouver**
- **Backend** = ce qui tourne sur un serveur, invisible pour l'utilisateur : c'est là que doivent vivre les clés API, la logique métier sensible, l'accès aux bases de données
- Piège fréquent : une variable "d'environnement" utilisée côté frontend (même via un `.env` + Vite) finit intégrée au code JavaScript livré au navigateur → elle est donc visible par n'importe qui, ce n'est pas un vrai secret
- Règle simple pour trancher : dès qu'il y a une clé à cacher, une base de données à interroger, ou une action sensible à exécuter, il faut un backend. Sinon (affichage, interaction locale sans donnée sensible, comme l'Ex1), un frontend seul suffit
- Comment ils communiquent : le frontend appelle le backend via des requêtes HTTP (une API), et le backend ne fait jamais confiance à ce que le frontend lui envoie (validation systématique côté serveur)
- **Application directe en Ex2** : la clé Groq doit rester côté backend, jamais dans le code du frontend — c'est le premier cas concret où l'app a besoin des deux couches

### Bases de données (bloc Ex3)
- Différence fichier plat (CSV) / base de données (MySQL, Postgres, SQLite...) / API
- Notion de table, colonne, ligne, clé primaire/étrangère
- SQL de base : `SELECT`, `WHERE`, `GROUP BY`, `JOIN`, `ORDER BY`
- Pourquoi une base réelle de production n'a souvent pas de documentation à jour → intérêt de faire explorer le schéma par l'IA avant de l'interroger
- **Vigilance données réelles** : base d'un vrai outil métier (Agora, réservation de salles d'une collectivité) → rappeler prudence sur les accès en écriture, sur d'éventuelles données personnelles (noms de demandeurs, coordonnées) et sur le fait de ne jamais faire écrire/modifier la base par l'IA sans vérification

### Intégration à l'écosystème DSI (bloc Ex4)
- Notion d'API interne vs API publique/état, et pourquoi on ne les traite pas de la même façon (confiance, sensibilité des données, coût d'une erreur)
- Ici l'app est réelle **et** l'API appelée est réelle (API ville, vraie clé) : la prudence ne vient plus d'un mock, mais de garde-fous explicites — clé à portée restreinte, numéro de destination figé et connu de tous avant tout envoi de SMS, rate limiting
- Faire lire une documentation d'API (Swagger) par l'IA avant de coder est la même logique que l'exploration de schéma en Ex3 ou la lecture de méthode en Ex6 : comprendre avant d'agir, vérifier la lecture avant de la laisser produire du code
- Différence entre **analyser** une app existante (comprendre avant de toucher, `/init`) et l'**améliorer** (ajouter une fonctionnalité en respectant ce qui existe déjà) — les deux temps forts de cet exercice
- Lien avec la checklist Sécurité (clé API jamais côté frontend, portée minimale, garde-fou sur toute action à effet réel comme l'envoi de SMS)

### Prompt unique vs itération (bloc Ex6, bonus)
- Toute la journée a enseigné l'itération en petits pas — l'Ex6 montre volontairement l'inverse : un seul prompt, riche et cadré par une documentation de référence réelle, pour générer une app quasi complète en un passage
- Pourquoi ça peut marcher ici et pas ailleurs : le domaine (EBIOS RM) est **documenté publiquement et structuré** (5 ateliers nommés, entités précises) — l'IA a un cadre externe fiable à suivre, ce n'est pas elle qui invente la structure
- Pourquoi c'est risqué en général : sans référence externe solide, un prompt unique et ambitieux laisse l'IA combler les trous par des suppositions, invisibles tant qu'on n'a pas tout relu en détail
- Le filet de sécurité minimal sur ce mode : toujours demander explicitement ce que l'IA a interprété/complété elle-même, et vérifier ces points contre la vraie documentation

### Synthèse multi-documents (bloc Ex7, très bonus)
- L'Ex6 utilisait un résumé condensé (une seule source, courte, déjà nettoyée) ; l'Ex7 fournit le **vrai corpus documentaire** (guide complet + 8 fiches méthodes officielles) — un volume et une hétérogénéité de sources bien plus proches d'un cas réel
- Nouveau risque à observer : avec plusieurs documents qui se recoupent partiellement, l'IA peut privilégier une source sans le dire, ou mélanger des niveaux de détail incompatibles (le guide généraliste vs une fiche très technique sur un point précis)
- Bon indicateur pour le débriefing : demander pour chaque élément notable "de quel document précis vient cette information ?" — si la réponse est floue ou incohérente, c'est le signal que la synthèse multi-sources a dérapé quelque part
- Comparer les deux applications (Ex6 vs Ex7) rend ce risque concret et visible plutôt que théorique

### Docker (bloc Ex5)
- Image vs conteneur (recette vs plat servi)
- `Dockerfile` : suite d'instructions pour construire une image
- `docker-compose.yml` : orchestrer plusieurs conteneurs (back + front) ensemble
- Ports (exposition), volumes (persistance des données, ex. `database.sqlite` dans apm), variables d'environnement passées au conteneur
- Pourquoi dockeriser : reproductibilité, "ça marche pareil partout", base du déploiement chez apm (`docker-compose.yml` + script de pull sur le serveur)

---

## Prompts proposés par exercice

> À adapter en séance selon ce que les participants choisissent de construire. Objectif : montrer une formulation initiale précise, puis des itérations en petits pas.

### Bloc 1 — Setup

Deux prompts transversaux réutilisés à chaque exercice, à des moments différents :

1. **Prompt manifest initial (avant d'écrire du code)** :
   > "Je veux construire [décrire l'objectif en une phrase]. Aide-moi à rédiger un premier MANIFEST.md avec : l'objectif, la stack envisagée, le périmètre (ce qui est dans et hors scope), et les variables d'environnement/secrets déjà prévisibles. Pose-moi des questions si un point n'est pas clair avant de le rédiger."
2. **Prompt manifest à jour (à la fin de l'exercice)** :
   > "Mets à jour le MANIFEST.md avec ce qui a été réellement construit : comment lancer l'app en local, les variables d'environnement/secrets utilisés, et le lien du repo GitHub."
3. **Prompt d'amélioration (avant le commit final, à chaque exercice)** :
   > "Relis le code que tu viens de produire et propose 3 à 5 pistes d'amélioration concrètes (sécurité, lisibilité, performance, gestion d'erreurs), sans les appliquer tout de suite — je veux d'abord les voir et choisir lesquelles retenir."

*(`/init` et `AGENTS.md` ne sont volontairement pas abordés ici — ce sont des outils de **maintenance sur du code existant**, voir procédure B et Exercice 4.)*

### Bloc 1bis — Mini-démo : environnement manquant (rapide, ~10 min)
> Objectif : observer comment OpenCode réagit quand il lui manque un outil pour répondre à la demande. Choisir un outil probablement absent du poste (Python est un bon candidat sur un poste Windows DSI fraîchement configuré) — à vérifier avant la séance sur un poste représentatif.

1. **Prompt :**
   > "Génère un histogramme en PNG à partir de ces 5 valeurs : 12, 45, 23, 67, 34, en utilisant Python et matplotlib. Si un outil nécessaire n'est pas installé sur ma machine, explique-moi précisément ce qu'il te manque et propose-moi la commande d'installation — ne l'exécute pas sans mon accord explicite."
2. **Discussion collective (2-3 min) :** que propose OpenCode ? Est-ce clair et compréhensible ? Que se passe-t-il si l'installation échoue faute de droits admin — et pourquoi c'est plutôt rassurant que ça se comporte ainsi ?

### Exercice 1 — App simple
1. **Prompt initial :**
   > "Crée une application web simple de liste de tâches (to-do list) en HTML/CSS/JavaScript vanilla, sans framework, dans un seul fichier `index.html` autonome. Je dois pouvoir ajouter une tâche, la cocher comme terminée, la supprimer. Avant de commencer, explique-moi les fichiers que tu vas créer."
2. **Itération :**
   > "Ajoute un compteur qui affiche le nombre de tâches restantes."
   > "Améliore le style visuel : dégradé de couleur, boutons arrondis, mise en page plus aérée."
   > "Ajoute un champ 'Ville' à la création d'une tâche. Utilise l'API de géocodage gratuite de la Géoplateforme (https://data.geopf.fr/geocodage/search/?q=NOM_VILLE, sans clé nécessaire) pour récupérer les coordonnées de la ville saisie, et affiche une carte (avec Leaflet.js via CDN, pas d'installation nécessaire) avec un marqueur pour chaque tâche, positionné sur sa ville. Gère le cas où la ville n'est pas trouvée."

> **Lien avec la notion frontend/backend :** cet appel se fait directement depuis le frontend, sans backend — parce que cette API est publique et ne nécessite aucune clé. À mettre en contraste avec l'Ex2, où l'appel à Groq nécessite au contraire un backend pour cacher la clé. Bon moyen de faire sentir la différence entre "API publique sans secret" et "API avec clé à protéger".
3. **Git :**
   > "Initialise un dépôt Git dans ce dossier, crée un .gitignore adapté, et prépare un premier commit avec un message clair."

### Exercice 2 — App interactive + IA embarquée (Groq)
> Premier exercice qui nécessite un vrai backend (cf. notion frontend/backend ci-dessus) : la clé Groq ne peut pas vivre dans le frontend, même via un `.env` — il faut un petit serveur qui la garde et relaie l'appel.

1. **Prompt initial :**
   > "Crée une application avec un petit backend Node/Express et un frontend HTML/CSS/JS. Le backend expose une route qui appelle l'API Groq (modèle openai/gpt-oss-120b) avec la clé lue depuis un fichier .env côté serveur — cette clé ne doit jamais apparaître dans le code frontend. Le frontend envoie la question au backend et affiche la réponse. Avant de coder, explique-moi pourquoi la clé ne peut pas être directement dans le frontend."

> **Modèle à vérifier avant la séance** : `openai/gpt-oss-120b` est le modèle "featured" de Groq (~500 tokens/s, capacités de raisonnement), mais certains comptes gratuits fraîchement créés peuvent ne pas avoir accès immédiatement à tous les modèles (erreur "model does not exist or you do not have access to it"). Faire créer la clé en tout début de Bloc 1 et vérifier la liste des modèles réellement disponibles sur [console.groq.com/docs/models](https://console.groq.com/docs/models) avant l'Ex2 — `llama-3.1-8b-instant` reste une solution de repli plus systématiquement accessible si `gpt-oss-120b` pose problème sur certains comptes.
2. **Itérations :**
   > "Ajoute un indicateur de chargement pendant l'appel à l'API."
   > "Gère le cas où l'appel API échoue et affiche un message d'erreur clair."
   > "Ajoute un historique des questions/réponses au-dessus du champ de saisie."

### Exercice 3 — Analyse de la base réelle Agora (réservation de salles)
> Base SQL Server réelle de l'outil Agora (gestion de réservations de salles de la Ville d'Ivry). Credentials fournis en séance. **Connexion en lecture seule uniquement** — on interroge, on ne modifie jamais la base en direct.
>
> *Repère facilitateur (à ne pas donner aux participants avant l'exercice — laisser l'exploration se faire) : SGBD = SQL Server (driver `mssql`), tables clés `MAN_LIEUX_M07` (salles/bâtiments), `MAN_EVENEMENTS_M02` (créneaux), `MAN_LIEUX_MANIF_M10` (liaison événement/salle), `MAN_MANIFESTATIONS_M14` (réservations), `GRC_ORGANISMES_G09` (organismes). Une app de référence existe déjà ([Agora](https://github.com/Crapoto94/AgoraVibe)) — utile comme corrigé pour vérifier les résultats des participants, pas à montrer avant.*

1. **Prompt de connexion + exploration (toujours en premier, avant toute stat) :**
   > "Voici les identifiants de connexion à une base SQL Server nommée Agora, un outil de réservation de salles d'une collectivité. Connecte-toi en lecture seule, explore sa structure : liste les tables, leurs colonnes et le nombre de lignes, et donne-moi un aperçu de quelques lignes des tables qui semblent liées aux réservations et aux salles. N'écris aucune requête de modification, explique-moi d'abord ce que tu observes."
2. **Prompt d'analyse :**
   > "À partir de cette structure, écris un script qui calcule le nombre de réservations par salle, par mois, et le taux d'occupation par salle sur la période disponible. Génère un graphique en barres des réservations par salle. Montre-moi les requêtes SQL utilisées."
3. **Itérations :**
   > "Identifie les salles les plus et les moins demandées, et les créneaux horaires les plus demandés."
   > "Vérifie que le nombre total de réservations que tu calcules correspond bien à un simple COUNT sur la table principale — montre les deux calculs côte à côte."
   > "Certaines lignes ont l'air incohérentes (dates nulles, réservations sans salle associée) — identifie-les et propose une façon de les exclure proprement avant de recalculer les stats."
   > "Exporte les statistiques finales en CSV, sans aucune donnée personnelle (nom du demandeur, coordonnées) si ces colonnes existent."

### Exercice 4 — Analyse et amélioration de l'app réelle Agora
> C'est l'exercice où l'on applique la **procédure B** (maintenance) sur une vraie app, en trois temps : **cloner → analyser/lancer → améliorer**. Le vrai repo [Agora](https://github.com/Crapoto94/AgoraVibe) (backend Node/Express5 + mssql, frontend React/TS/Vite/Tailwind) est utilisé tel quel, pas une copie/starter.

**Temps 1 — Cloner et faire l'état des lieux**
1. `git clone https://github.com/Crapoto94/AgoraVibe.git`, puis `git log`, lecture du README/`agora.md`/`.env.example` — avant tout prompt.
2. **`/init` — c'est ici que ça a du sens :** lancer `/init` dans le TUI OpenCode pour générer l'`AGENTS.md` à partir du code réel (arborescence `backend/`/`frontend/`, dépendances, conventions déjà en place, commandes de lancement). Relire le fichier généré avec le groupe avant de le committer.
3. **Prompt d'analyse guidée (complément à `/init`) :**
   > "En te basant sur AGENTS.md et sur le code, explique-moi en langage simple : à quoi sert cette application, comment le backend et le frontend communiquent, où sont gérés les secrets, et quelles sont les étapes pour la lancer en local."

**Temps 2 — Configurer et lancer**
4. Copier `backend/.env.example` vers `backend/.env` pour les paramètres non sensibles (port, etc.) — **les credentials SQL Server ne vont pas dans le `.env`** sur cette app : ils se saisissent via l'interface web elle-même, menu **DB Settings**, une fois l'app lancée. Ils sont alors stockés dans `backend/db-config.json`, qui est gitignored comme le `.env`.
5. **Prompt de lancement/dépannage :**
   > "Aide-moi à installer les dépendances et lancer le backend et le frontend en mode développement, sans configurer de connexion base de données pour l'instant. Si une erreur apparaît (port occupé, dépendance manquante), explique-moi la cause avant de la corriger."
6. Une fois l'app lancée, aller dans le menu **DB Settings** de l'interface web et saisir les credentials SQL Server fournis en séance (mêmes qu'à l'Ex3, lecture seule) — tester la connexion directement depuis ce menu.
7. Vérifier ensemble que le dashboard Agora Stats s'affiche avec de vraies données (KPIs, salles, réservations) — ça valide que l'analyse du Temps 1 était correcte.

> **Point de vigilance :** `backend/db-config.json` contient un mot de passe en clair sur le disque, même s'il est gitignored — ne pas le committer par erreur (`git status` avant tout commit sur cet exercice), et rappeler que le mot de passe n'est jamais renvoyé par l'API de config (cf. `agora.md`).

**Temps 3 — Améliorer en lien avec l'API ville (APM) — vraie API, vraie clé**
> Constat de départ à faire dire au groupe : l'app Agora Stats n'a **aucune identification d'agent aujourd'hui** — n'importe qui ayant l'URL y accède. Contrairement à ce qui était prévu initialement, on utilise ici la **vraie API ville** (`https://api.ivry.local`, doc Swagger sur `https://api.ivry.local/api-docs/?url=https://api.ivry.local`), avec une clé réelle fournie par le formateur en séance — pas de mock. L'identification se fait par **login**, pas par matricule.

8. **Prompt de découverte de l'API (avant de coder quoi que ce soit) :**
   > "Voici la documentation Swagger de l'API ville : https://api.ivry.local/api-docs/?url=https://api.ivry.local — consulte-la et identifie précisément : l'endpoint qui permet de récupérer un agent à partir de son login (nom, service, direction), l'endpoint d'envoi de SMS, et l'endpoint d'envoi d'email (en cherchant notamment s'il supporte une pièce jointe). Indique-moi les méthodes HTTP, les chemins exacts, le format attendu (y compris le format d'une pièce jointe pour l'email), et comment l'en-tête X-API-KEY doit être transmis. N'écris pas encore de code, je veux d'abord valider ta lecture de la doc."
9. **Prompt identification agent (ajout d'une brique absente de l'app) :**
   > "Cette application n'a actuellement aucune identification de l'agent qui la consulte. En respectant les conventions décrites dans AGENTS.md, ajoute un écran d'identification au chargement de l'app : un champ de saisie du login qui appelle, **depuis le backend uniquement** (jamais depuis le frontend, pour ne pas exposer la clé), l'endpoint de l'API ville identifié précédemment. La clé d'API doit être lue depuis .env (APM_API_KEY, APM_API_URL), jamais en dur. Une fois l'agent identifié, affiche son nom, son service et sa direction dans l'en-tête, sur toutes les pages, et conserve cette identification pendant la session."
10. **Prompt envoi de SMS (nouvelle action métier — garde-fou obligatoire) :**
    > "Ajoute un bouton 'Partager ce rapport par SMS' sur le tableau de bord, visible uniquement une fois l'agent identifié, qui appelle l'endpoint SMS de l'API ville depuis le backend. **Important : pendant cette phase de test, le SMS doit être envoyé uniquement au numéro suivant, codé en dur temporairement : [NUMÉRO DE TEST fourni par le formateur]** — ignore tout autre numéro, même celui de l'agent identifié. Ajoute un rate limiting strict sur cette route (ex. 1 envoi par minute) pour éviter tout envoi répété accidentel."
11. **Prompt envoi d'email avec rapport PDF en pièce jointe (garde-fou obligatoire, comme le SMS) :**
    > "Ajoute un bouton 'Envoyer le rapport par email' à côté du bouton SMS, visible uniquement une fois l'agent identifié. Côté backend : génère à la volée un PDF simple reprenant les KPIs actuellement affichés sur le tableau de bord (choisis une librairie Node légère type pdfkit, pas besoin d'un navigateur headless), puis envoie cet email avec le PDF en pièce jointe via l'endpoint email de l'API ville identifié précédemment. **Important : pendant cette phase de test, l'email doit être envoyé uniquement à l'adresse suivante, codée en dur temporairement : [ADRESSE EMAIL DE TEST fournie par le formateur]** — ignore toute autre adresse. Ajoute le même rate limiting strict que sur la route SMS, et supprime le PDF généré côté serveur une fois l'email envoyé (ne pas le laisser traîner sur le disque)."
12. **Vérification (à ne pas sauter) :** relire avec le groupe où l'identification est stockée côté frontend (session/state, jamais un vrai token d'auth sans expiration), confirmer que la clé API n'apparaît nulle part côté frontend, et **vérifier ensemble le numéro de test et l'adresse email de test avant le premier clic réel sur "Envoyer"** — cf. checklist Sécurité.

> **⚠️ À préparer avant la séance, indispensable avec une vraie API :**
> - Une clé API ville à portée la plus restreinte possible (idéalement une clé de test/dev si elle existe, sinon une clé de prod dont on connaît précisément le scope), communiquée en séance et révoquée/régénérée après la formation.
> - Un **numéro de téléphone de test** et une **adresse email de test** (les vôtres, ou dédiés) à donner au groupe pour toute tentative d'envoi — sous aucun prétexte un vrai contact d'agent ou de citoyen pendant l'exercice.
> - Vérifier en amont les chemins exacts des endpoints sur la doc Swagger (`https://api.ivry.local/api-docs/?url=https://api.ivry.local`, accessible uniquement depuis le réseau DSI) : je n'ai pas pu y accéder pour préparer ce plan (URL interne), donc le prompt 8 fait découvrir l'API par OpenCode en direct plutôt que de préciser les routes à l'avance — à tester une fois avant la séance pour éviter les surprises.
> - **Charge accrue du Temps 3** : SMS + email/PDF en plus de l'identification, c'est ambitieux pour 55 minutes au total sur l'Ex4 avec un public débutant. Si le temps manque en séance, l'email/PDF (prompt 11) est le candidat naturel à reporter en fin d'exercice ou à traiter en démo plutôt qu'en pratique individuelle.

### Exercice 5 — Déploiement Docker
1. **Prompt initial :**
   > "Crée un Dockerfile pour le backend Node/Express, et un Dockerfile pour le frontend React/Vite servi par une image nginx légère. Ajoute un docker-compose.yml qui lance les deux services avec les bons ports et variables d'environnement. Explique chaque choix fait."
2. **Itérations :**
   > "Indique-moi les commandes pour builder et lancer le docker-compose en local, et aide-moi à diagnostiquer si une erreur apparaît."
   > "Rédige un README.md expliquant comment builder et lancer l'app avec Docker."
3. **Git final :**
   > "Prépare un commit regroupant les changements Docker avec un message clair, et rappelle-moi la commande pour pousser sur GitHub."

### Exercice 6 (bonus/optionnel) — Génération one-shot cadrée par EBIOS RM
> Applique la **procédure C**. Objectif pédagogique : observer ce que donne un prompt unique, riche, appuyé sur une vraie documentation de référence — et où ça peut déraper.
>
> **Fichier prêt :** [`exo6/EBIOS_RM_resume.md`](exo6/EBIOS_RM_resume.md) — généré et relu, à donner aux participants comme référence pour cet exercice. Évite de dépendre d'un parsing PDF en direct pendant l'exercice.
>
> **Prompt pour générer ce fichier (à faire tourner une fois, en préparation, pas en séance) :**
> > "Tu vas m'aider à préparer un support pédagogique. Voici le lien vers la méthode EBIOS Risk Manager de l'ANSSI : https://cyber.gouv.fr/securisation/analyse-des-risques/methode-ebios-rm/ (page qui donne accès au guide officiel). Lis-le et rédige un fichier EBIOS_RM_resume.md structuré ainsi :
> > - Une courte introduction : objectif de la méthode, à qui elle s'adresse (3-4 lignes maximum).
> > - Pour chacun des **5 ateliers, dans l'ordre, avec les noms exacts de l'ANSSI** : son objectif en une phrase, les entités/notions clés qu'il produit (nom exact + définition courte — ex. valeurs métier, biens supports, événements redoutés, sources de risque (SR), objectifs visés (OV), scénarios stratégiques évalués en gravité, scénarios opérationnels évalués en vraisemblance, mesures de traitement du risque, risque résiduel), et un exemple simple illustratif.
> > - Un tableau récapitulatif final : atelier / objectif / principales entités de sortie.
> > Utilise strictement la terminologie ANSSI actuelle — ne confonds pas avec EBIOS 2010 ou une autre méthode comme ISO 27005. Si un point n'est pas clair dans le guide, indique-le explicitement plutôt que de l'inventer. Le fichier doit rester concis (une à deux pages), compréhensible par des débutants sans bagage cybersécurité, et directement exploitable comme spécification pour construire une petite application de suivi."
>
> Une fois généré, relire ce fichier vous-même avant la séance (même logique de vérification croisée que celle enseignée à l'Ex6 lui-même) — c'est un document qui sera ensuite pris pour argent comptant par les participants.

1. **Le prompt unique (le seul de tout l'exercice, ou presque) :**
   > "Voici un résumé de la méthode EBIOS Risk Manager de l'ANSSI (fichier EBIOS_RM_resume.md joint), structurée en 5 ateliers : (1) Cadrage et socle de sécurité — valeurs métier, biens supports, événements redoutés ; (2) Sources de risque — sources de risque (SR) et objectifs visés (OV), évalués et priorisés ; (3) Scénarios stratégiques — scénarios de haut niveau reliant SR et OV, évalués en gravité ; (4) Scénarios opérationnels — modes opératoires techniques détaillés, évalués en vraisemblance ; (5) Traitement du risque — mesures de sécurité et risque résiduel. Construis une application (backend Node/Express + frontend React/TS) qui permette de créer une étude EBIOS RM, de saisir les éléments de chacun des 5 ateliers avec les bons champs, et d'afficher une matrice de risque (gravité x vraisemblance) pour les scénarios stratégiques. Respecte strictement la terminologie de la méthode. Une fois terminé, explique-moi comment chaque atelier a été traduit dans l'app, et signale-moi explicitement tout point où tu as dû interpréter ou compléter par toi-même faute d'information dans le résumé fourni."
2. **Vérification croisée (obligatoire, pas optionnelle) :**
   > "Relis le résumé EBIOS_RM_resume.md et vérifie que les noms des ateliers et leur contenu dans l'app correspondent exactement à ce document — pas à une autre méthode que tu connaîtrais par ailleurs (EBIOS 2010, ISO 27005...). Liste les écarts trouvés avant de les corriger."
3. **Débriefing collectif (à ramener en Bloc 7) :** qu'est-ce que l'IA a bien saisi du premier coup ? Qu'est-ce qu'elle a dû "inventer" ou approximer ? Est-ce que ça aurait été détecté sans la vérification croisée de l'étape 2 ?

### Exercice 7 (très bonus, plutôt hors séance ou démo) — Même app, à partir des documents officiels complets
> Suite directe de l'Ex6. Au lieu d'un résumé condensé, on fournit cette fois le **vrai corpus documentaire officiel** : le guide ANSSI complet + les 8 fiches méthodes. Objectif pédagogique : voir concrètement ce que gagne (ou perd) une génération one-shot quand la source n'est plus un résumé propre mais un ensemble de documents réels, volumineux et partiellement redondants.
>
> **Réalisme du créneau :** avec 6 débutants et un emploi du temps déjà chargé, ceci est plus réaliste comme démonstration formateur en fin de journée, ou comme prolongement à faire par les participants après la formation, que comme pratique individuelle en direct.

> **Documents à télécharger dans `docs/ebios-officiel/` avant l'exercice** (tous publics, gratuits, sans inscription) :
> - [Guide complet EBIOS Risk Manager (PDF, ANSSI)](https://messervices.cyber.gouv.fr/documents-guides/250129_np_anssi_guide_ebios_fr_final_collection_WEB.pdf)
> - [Identifier le périmètre métier et technique — atelier 1](https://messervices.cyber.gouv.fr/documents-guides/Fiche_methode-Identifier_le_perimetre_metier_et_technique-atelier_1.pdf)
> - [Évaluer la gravité des événements redoutés — atelier 1](https://messervices.cyber.gouv.fr/documents-guides/Fiche_methode-Evaluer_la_gravite_des_evenements_redoute-atelier_1.pdf)
> - [Identifier et caractériser les sources de risque — atelier 2](https://messervices.cyber.gouv.fr/documents-guides/Fiche_methode-Identifier_et_caracteriser_les_sources_de_risque-atelier_2.pdf)
> - [Définir des mesures de sécurité pour l'écosystème — atelier 3](https://messervices.cyber.gouv.fr/documents-guides/Fiche_methode-Definir_des_mesures_de_securite_pour_l_ecosysteme-atelier_3.pdf)
> - [Construire l'estimation de la dangerosité des parties prenantes de l'écosystème — atelier 3](https://messervices.cyber.gouv.fr/documents-guides/Fiche_methode-Construire_lestimation_de_la_dangerosite_des_parties_prenantes_de_l_ecosysteme-atelier_3.pdf)
> - [Élaborer des graphes d'attaque — atelier 4](https://messervices.cyber.gouv.fr/documents-guides/Fiche_methode-Elaborer_des_graphes_d_attaque-atelier_4.pdf)
> - [Évaluer la vraisemblance des scénarios opérationnels — atelier 4](https://messervices.cyber.gouv.fr/documents-guides/Fiche_methode-Evaluer_la_vraisemblance_des_scenarios_operationnels-atelier_4.pdf)
> - [Structurer les mesures de traitement du risque — atelier 5](https://messervices.cyber.gouv.fr/documents-guides/Fiche_methode-Structurer_les_mesures_de_traitement_du_risque-atelier_5.pdf)
> - [Modèle Excel des ateliers EBIOS RM](https://messervices.cyber.gouv.fr/documents-guides/EBIOS_RM_Ateliers_modele.xlsx) (optionnel, pour comparaison)

> **Deux applications indépendantes, pas une reconstruction de l'Ex6.** Pour que la comparaison soit propre, l'Ex7 ne demande pas de "modifier" l'app de l'Ex6 : c'est un **prompt autonome**, lancé dans un **dossier vide et une session OpenCode neuve** (`exo7/`, pas dans `exo6/`), qui ignore volontairement ce qui a été fait avant. On compare ensuite les deux applications finies, de l'extérieur.

1. **Prompt de construction (Ex7 — indépendant, dans un dossier/session neufs) :**
   > "Dans le dossier docs/ebios-officiel/, tu trouveras le guide complet EBIOS Risk Manager de l'ANSSI ainsi que 8 fiches méthodes détaillant certains ateliers. Lis l'ensemble de ces documents : ils décrivent une méthode structurée en 5 ateliers. Construis une application (backend Node/Express + frontend React/TS) qui permette de créer une étude EBIOS RM, de saisir les éléments de chacun des 5 ateliers avec les bons champs, et d'afficher une matrice de risque (gravité x vraisemblance) pour les scénarios stratégiques. Respecte strictement la terminologie de la méthode telle qu'elle apparaît dans ces documents — n'utilise aucune connaissance de la méthode que tu aurais par ailleurs, base-toi uniquement sur ces fichiers. Une fois terminé, explique-moi comment chaque atelier a été traduit dans l'app, et pour chaque élément notable, précise de quel document (le guide, ou quelle fiche méthode) il provient."
2. **Prompt de vérification croisée (même logique qu'en Ex6) :**
   > "Relis les documents du dossier docs/ebios-officiel/ et vérifie que les noms des ateliers et leur contenu dans l'app correspondent exactement à ce qu'ils décrivent — pas à une autre méthode que tu connaîtrais par ailleurs (EBIOS 2010, ISO 27005...). Liste les écarts trouvés avant de les corriger."
3. **Comparaison (une fois les deux apps terminées, indépendamment construites) :**
   > "Voici deux applications construites pour la même méthode EBIOS RM : l'une à partir d'un résumé condensé (dossier exo6/), l'autre à partir des documents officiels complets (dossier exo7/). Compare-les : qu'est-ce qui a été ajouté, reformulé, ou approfondi dans la seconde ? Y a-t-il des points où les deux versions se contredisent, ou des éléments que l'une a et pas l'autre ?"
4. **Débriefing collectif :** le temps/effort de l'Ex7 a-t-il augmenté proportionnellement à la qualité gagnée ? L'IA a-t-elle bien cité ses sources élément par élément, ou est-ce resté flou par endroits ? Qu'est-ce que ça dit sur les limites de la procédure C à grande échelle (beaucoup de documents, pas un seul résumé propre) ?

---

## Ressources utiles

> Ressources en français en priorité ; quand aucun équivalent francophone officiel n'existe (OpenCode, Groq), c'est signalé explicitement plutôt que de proposer une fausse traduction.

### Frontend / Backend (notion transversale)
- [MDN — Glossaire : Serveur](https://developer.mozilla.org/fr/docs/Glossaire/Serveur) — définition courte, en français
- [MDN — Introduction à Express/Node (fr)](https://developer.mozilla.org/fr/docs/Learn_web_development/Extensions/Server-side/Express_Nodejs/Introduction) — bonne base pour comprendre le rôle du backend avant l'Ex2

### OpenCode
- [Documentation officielle](https://opencode.ai/docs/) — *en anglais, pas de traduction française officielle*, installation/configuration/CLI
- [Présentation d'OpenCode (GiwiSoft, en français)](https://giwi.fr/2026-04-03-opencode/) — article d'introduction en français, complément à la doc officielle
- [Rules & AGENTS.md](https://opencode.ai/docs/rules/) — *en anglais* — ce que fait `/init`, hiérarchie des fichiers de règles

### Git & GitHub (niveau débutant)
- [GitHub Quickstart — Hello World (fr)](https://docs.github.com/fr/get-started/quickstart/hello-world) — créer un repo, premier commit/push
- [Les bases de Git (GitHub, fr)](https://docs.github.com/fr/get-started/using-git/about-git) — concepts de base
- [Syntaxe Markdown de base (GitHub, fr)](https://docs.github.com/fr/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax) — pour rédiger `MANIFEST.md`/`README.md`
- [Pro Git Book (fr)](https://git-scm.com/book/fr/v2) — référence complète si besoin d'aller plus loin
- [GitHub Desktop](https://desktop.github.com/) — alternative graphique si le terminal Git freine certains débutants
- [.gitignore templates (Node)](https://github.com/github/gitignore/blob/main/Node.gitignore) — utile pour Ex2/Ex4 (éviter de committer `node_modules`, `.env`)

### Groq (IA embarquée)
- [Créer un compte + clé API](https://console.groq.com/) — section API Keys
- [Quickstart Groq API](https://console.groq.com/docs/quickstart) — *en anglais, pas de version française officielle* — premier appel API
- [Groq API Cookbook (exemples)](https://github.com/groq/groq-api-cookbook) — code, langage-agnostique

### Docker
- [Optimisez votre déploiement en créant des conteneurs avec Docker (OpenClassrooms, gratuit, fr)](https://openclassrooms.com/fr/courses/8431896-optimisez-votre-deploiement-en-creant-des-conteneurs-avec-docker) — cours complet en français, correspond bien à l'Ex5
- [Documentation officielle Docker](https://docs.docker.com/get-started/) — *en anglais, pas de version française officielle* — référence si besoin de précision

### Bases de données & SQL (exercice 3 — base Agora, SQL Server)
- [Requêtez une base de données avec SQL (OpenClassrooms, gratuit, fr)](https://openclassrooms.com/fr/courses/7818671-requetez-une-base-de-donnees-avec-sql) — bases SELECT/WHERE/GROUP BY/JOIN, en français
- [DBeaver](https://dbeaver.io/) ou [Azure Data Studio](https://learn.microsoft.com/fr-fr/azure-data-studio/download-azure-data-studio) — client graphique pour inspecter la base SQL Server sans coder, en filet de sécurité
- [Pilote Python pour SQL Server, pyodbc (Microsoft Learn, fr)](https://learn.microsoft.com/fr-fr/sql/connect/python/python-driver-for-sql-server) — si l'exercice est fait en Python
- [node-mssql (driver Node.js pour SQL Server)](https://www.npmjs.com/package/mssql) — *page de référence du package, en anglais* — si l'exercice est fait en Node

### API publique d'état (exercice 4)
- [API Géoplateforme — Géocodage](https://data.geopf.fr/geocodage/search/) — remplace l'ancienne API Adresse `api-adresse.data.gouv.fr`, décommissionnée fin janvier 2026 ; gratuite, sans clé, en français (service de l'État)
- [Documentation technique Géoplateforme](https://geoservices.ign.fr/documentation/services/services-geoplateforme/geocodage) — référence complète du service de géocodage
- [geo.api.gouv.fr](https://geo.api.gouv.fr/) — alternative pour des données de découpage administratif (communes, etc.)

### Stack de référence (exercice 4 & 5 — sur le modèle de `apm`)
- [Documentation React (fr.react.dev, traduction officielle française)](https://fr.react.dev/) — frontend
- [Documentation Vite (vitejs.fr, traduction française communautaire)](https://vitejs.fr/guide/) — frontend
- [Tutoriel Tailwind CSS (Grafikart, fr)](https://grafikart.fr/tutoriels/tailwindcss-framework-css-1177) — *pas de doc officielle française* — bonne alternative pédagogique en français
- [Documentation Node.js](https://nodejs.org/en/docs) — *en anglais, pas de traduction officielle à jour* — backend Express

### Méthode EBIOS RM (exercices 6 et 7, bonus)
- [La méthode EBIOS Risk Manager (ANSSI, page officielle, fr)](https://cyber.gouv.fr/securisation/analyse-des-risques/methode-ebios-rm/) — présentation, téléchargement du guide
- [Guide EBIOS Risk Manager (PDF officiel complet, fr)](https://messervices.cyber.gouv.fr/documents-guides/250129_np_anssi_guide_ebios_fr_final_collection_WEB.pdf) — référence complète, base du fichier résumé de l'Ex6 et document source de l'Ex7
- [Page de téléchargement (MesServicesCyber, fr)](https://messervices.cyber.gouv.fr/guides/la-methode-ebios-risk-manager-le-guide) — donne accès au guide et aux 8 fiches méthodes (liens listés dans l'Ex7)
- [Modèle Excel des ateliers EBIOS RM (fr)](https://messervices.cyber.gouv.fr/documents-guides/EBIOS_RM_Ateliers_modele.xlsx) — utile pour comparer la structure de données de l'app générée à un vrai gabarit d'analyse

### Sécurité & risques du vibecoding
- [Slopsquatting : les hallucinations des IA se transforment en menace (Le Monde Informatique, fr)](https://www.lemondeinformatique.fr/actualites/lire-slopsquatting-les-hallucinations-des-ia-se-transforment-en-menace-96638.html) — article de référence en français sur le risque de "package hallucination"
- [12 Factor App (fr)](https://12factor.net/fr/) — bonnes pratiques app/config/secrets, utile pour la synthèse finale

---

## Points encore ouverts
1. Org GitHub d'entreprise en attente de Djamel → repos perso pour cette session.
2. Choix du langage pour l'exercice 3 (analyse de BDD) — Node avec `mssql` (cohérent avec le vrai backend Agora) ou Python avec `pyodbc`/`pymssql`, selon préférence du groupe.
3. **Base Agora (exercice 3)** — SGBD identifié : SQL Server (`IVRAGORA_PROD`, hôte type `agora.ivry.local\SQLAGORA`). Reste à confirmer avant la séance :
   - credentials en **lecture seule** de préférence (éviter tout risque d'écriture accidentelle sur une base de production par l'IA),
   - présence de données personnelles (nom/coordonnées des demandeurs de salle dans `GRC_ORGANISMES_G09` ou tables liées) → consigne stricte déjà intégrée aux prompts de ne jamais les exporter ; à confirmer si un accès restreint/anonymisé est possible ou si c'est bien la prod partagée.
4. **Stack "from scratch" (procédure A)** décrite d'après `GUIDE_NOUVELLE_APP_VILLE.md` (PostgreSQL partagée `ivry_admin`, schéma par app) — différente de la base SQLite utilisée par `apm` (projet antérieur au référentiel actuel). À clarifier en séance : présenter le référentiel actuel comme la norme à suivre pour toute nouvelle app, apm restant un exemple de structure back/front + Docker, pas de choix de BDD.
5. **Exercice 4 = vrai clone du repo Agora, avec la vraie API ville** (plus de mock). À préparer avant la séance :
   - une clé API ville à portée la plus restreinte possible, communiquée en séance et révoquée/régénérée après ;
   - un numéro de téléphone de test et une adresse email de test à communiquer au groupe pour l'envoi de SMS/email — jamais un vrai contact d'agent/citoyen pendant l'exercice ;
   - vérifier une fois les chemins exacts des endpoints sur `https://api.ivry.local/api-docs/?url=https://api.ivry.local` (URL interne, non accessible pour préparer ce plan) — le prompt de l'exercice fait découvrir l'API par OpenCode en direct, mais un test préalable évite les mauvaises surprises en séance ;
   - confirmer que l'API email de la ville accepte bien les pièces jointes (et le format attendu) — sinon prévoir un simple lien de téléchargement du PDF en repli plutôt qu'une vraie pièce jointe.
6. **Ex3 et Ex4 utilisent la même base SQL Server Agora** : vérifier que les credentials lecture seule fournis en séance permettent bien de lancer l'app Agora Stats (Ex4) en plus des requêtes manuelles (Ex3) — mêmes identifiants, deux usages différents. Comme l'app Agora Stats affiche déjà les stats que l'Ex3 demande de construire, l'ordre Ex3 → Ex4 doit être respecté (l'app ne doit pas être lancée/montrée avant l'Ex3, cf. repère facilitateur).
7. **Accès modèle Groq à vérifier en amont** : un test a montré que `llama-3.3-70b-versatile` peut renvoyer une erreur d'accès sur un compte gratuit fraîchement créé, alors qu'il est listé comme modèle de production côté Groq — probablement une restriction liée au compte plutôt qu'une suppression du modèle. Le plan utilise maintenant `openai/gpt-oss-120b` par défaut (modèle "featured" de Groq), avec `llama-3.1-8b-instant` en repli ; à confirmer en créant une clé de test avant la séance et en vérifiant l'accès réel sur chaque modèle envisagé.
8. ~~Fichier `EBIOS_RM_resume.md` de l'exercice 6~~ — **fait**, disponible dans [`exo6/EBIOS_RM_resume.md`](exo6/EBIOS_RM_resume.md). À relire une dernière fois avant la séance pour valider qu'il correspond bien à votre usage prévu.
9. **Ex6 reste optionnel/bonus** : à cadrer en séance selon l'avancement réel du groupe — pour un groupe de débutants, il est probable que seule une démonstration formateur en fin de journée soit réaliste plutôt qu'une pratique individuelle de chacun des 6 participants.
10. **Bloc 1bis (environnement manquant) à tester avant la séance** sur un poste représentatif du parc DSI : vérifier que Python (ou l'outil choisi) est bien absent par défaut, et que la tentative d'installation se comporte de façon prévisible (succès, ou échec propre faute de droits admin) — éviter de découvrir en direct que l'outil choisi est en fait déjà préinstallé sur l'image DSI standard.
