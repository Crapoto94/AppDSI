# Guide opérationnel — VibeCoding (`/vibecoding`)

> Espace de ressources et d'expérimentation « vibe coding » de la DSI : documents Markdown, catalogue d'applications internes et plan de formation.
> Module **non public** : l'accès est contrôlé **utilisateur par utilisateur**.

---

## 1. À quoi ça sert

VibeCoding centralise les ressources produites ou utilisées par la DSI autour du développement assisté par IA :

- **Documents Markdown** : notes, procédures, comptes rendus d'expérimentation, consignes de génération de code — rendus directement dans l'application.
- **Catalogue d'applications** : inventaire des applications internes générées ou maintenues par la DSI (nom, agent référent, dossier, nature, version, dépôt GitHub, ports Docker…), avec création / édition / suppression et **import JSON en lot**.
- **Plan de formation** : supports et parcours pour monter en compétence sur les pratiques « vibe coding ».

---

## 2. Accès et contrôle des droits

- La tuile **VibeCoding** n'est pas publique : elle n'apparaît qu'aux utilisateurs **explicitement autorisés**.
- L'ouverture d'accès se fait côté administration, **par utilisateur** ; un utilisateur non autorisé ne voit ni la tuile ni le contenu du module.

---

## 3. Catalogue d'applications

- **Créer une application** : renseignez le nom, l'agent référent, le dossier, la nature, la version, le dépôt GitHub et les ports Docker.
- **Importer en lot** : déposez un fichier **JSON** contenant un tableau d'applications pour alimenter le catalogue en une passe (utile pour un inventaire initial ou une reprise).
- **Modifier / supprimer** : chaque entrée est éditable et supprimable depuis la liste.

---

## 4. Documents Markdown

- Les documents sont stockés et affichés en Markdown (titres, listes, tableaux, blocs de code).
- Ils servent de base de connaissance partagée pour les pratiques et les projets de la DSI.

---

## 5. Interactions

| Module | Interaction |
|---|---|
| **MagApp** | Le catalogue d'applications s'inscrit dans l'écosystème du portail applicatif. |
| **GED & Documents** | Le stockage des fichiers suit le service unifié (`storage.js` + `hub_docs`). |
