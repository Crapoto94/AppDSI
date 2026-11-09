# Intégration de PdfCraft dans MagApp — « Modifier un PDF »

PdfCraft (https://getartcraft.com/apps/pdfcraft, dépôt https://github.com/storytold/pdfcraft) est un éditeur PDF
open-source en WebAssembly. MagApp l'héberge en **statique** et l'ouvre dans une modale plein écran.

**Principe : on ne modifie JAMAIS les fichiers de PdfCraft.** Tout est dans le code MagApp (ci-dessous) et pilote
PdfCraft de l'extérieur. Mettre à jour PdfCraft = remplacer le dossier statique, puis vérifier 4 points de contrôle.
Version intégrée à ce jour : **0.20.0** (build web `pdfcraft-web-0.20.0.zip`).

## 1. Mettre à jour PdfCraft

```bash
bash magapp-frontend/scripts/update-pdfcraft.sh 0.21.0     # ou sans argument : dernière version
```

Le script télécharge l'archive officielle, vérifie son SHA256 (`SHA256SUMS.txt`) puis remplace
`magapp-frontend/public/pdfcraft/`. Ensuite : `cd magapp-frontend && npm run build`, ouvrir « Modifier un PDF »
et dérouler la **checklist du §4**. (Le dossier fait ~72 Mo dont un .wasm de ~59 Mo.)

## 2. Ce que MagApp ajoute (tout est à refaire si le code MagApp est perdu)

| # | Fichier | Rôle |
|---|---------|------|
| 1 | `magapp-frontend/public/pdfcraft/` | Build web de PdfCraft, copié tel quel (hors README/HOSTING). |
| 2 | `magapp-frontend/src/components/PdfTools/PdfCraftModal.tsx` | Modale plein écran + iframe `/pdfcraft/index.html?control`, bouton « Retour au magasin d'applications », bouton « Mon assistant IA », automatisations 3 et 4 ci-dessous. |
| 3 | `magapp-frontend/src/components/PdfTools/PdfAiAssistant.tsx` | Panneau « Mon assistant IA » (Résumer / Interroger / Traduire). |
| 4 | `magapp-frontend/src/App.tsx` | Import `PdfCraftModal` + icône `FilePen` ; état `showPdfCraft` ; tuile double largeur « Modifier un PDF » en tête du magasin (avant « Mes applications ») ; carte dans la modale « Mes outils DSI » ; rendu `{showPdfCraft && <PdfCraftModal … author={displayName} />}` ; `author` passé aussi à `PdfToolsHub`. |
| 5 | `magapp-frontend/src/components/PdfTools/PdfToolsHub.tsx` | Carte double largeur « Modifier un PDF » dans « Outils PDF », état `showPdfCraft`, prop `author`. |
| 6 | `backend/modules/pdf-tools/pdf-ai.controller.js` + route `POST /api/pdf-tools/ai` dans `pdf-tools.routes.js` | Extraction du texte (pdf-parse) + appel de l'API IA Ville (`shared/apm_ai.js` → `queryAi`). |

Les trois points d'entrée (magasin, Mes outils DSI, Outils PDF) sont gardés par le même réglage que « Outils PDF »
(`settings.show_pdf_tools || settings.is_beta_user`) : aucun changement base de données.

## 3. Les automatisations (le point fragile lors d'une mise à jour)

PdfCraft dessine toute son interface dans un `<canvas>` : le CSS ne peut rien masquer. MagApp utilise donc l'**API de
contrôle** de PdfCraft (activée par `?control` dans l'URL de l'iframe, même origine → `iframe.contentWindow.pdfcraft`),
documentée dans `HOSTING.md` de l'archive (« `?control` … `window.pdfcraft` »). Fonction `dismissCommunityBanner()`
de `PdfCraftModal.tsx`, exécutée par polling (500 ms, 30 s max) après le `onLoad` de l'iframe :

1. **Masquer le bandeau « Rejoindre la communauté ArtCraft »** : `pdfcraft.uiInspect({})` liste les widgets
   (`{role, label, description, rect, id}`). On repère le premier bouton dont `description` contient `discord.gg`
   avec `rect[1] > 100` (le bouton Discord du *corps* de page, pas celui de la barre de titre, à y≈3), puis on clique
   le **bouton qui le précède** dans la liste (la croix « Fermer ») via `pdfcraft.request('ui.click', {id})`.
   La croix n'est pas mémorisée par PdfCraft (le bandeau revient à chaque chargement) d'où l'automatisation.
2. **Nom des nouveaux commentaires = agent MagApp** : `pdfcraft.request('ui.set', {key:'author', value:<displayName>})`.
   (`?author=` dans l'URL n'a aucun effet hors mode `?host=parent`, qui change la gestion des fichiers : ne pas l'utiliser.)
   Le nom « bel.le inconnu.e » (utilisateur non identifié) n'est pas transmis.
3. **« Mon assistant IA »** : l'« Assistant IA » de PdfCraft (commandes `ai.summary`, `ai.ask`, `ai.translate`) affiche
   « nécessite un fournisseur d'IA (désactivé par défaut) » et n'expose aucun réglage de fournisseur dans la 0.20.0.
   MagApp fournit donc son propre panneau (§2 lignes 3 et 6) : l'agent choisit un PDF, le backend extrait le texte
   (60 000 caractères max) et interroge l'API IA Ville. La clé APM reste côté serveur (`hub.infra_apis`, key `apm_ai`,
   éditable dans /admin/infra) ; modèle = défaut de l'APM. Limite : le panneau ne voit pas le PDF ouvert dans
   PdfCraft (l'iframe ne donne pas accès aux octets) — l'agent le sélectionne à nouveau. Si une future version de
   PdfCraft expose un fournisseur IA configurable, on pourra le pointer vers un proxy backend et retirer le panneau.

## 4. Checklist après mise à jour de PdfCraft

1. `public/pdfcraft/index.html` référence bien les nouveaux fichiers hashés (rien à modifier à la main).
2. Ouvrir « Modifier un PDF » : **le bandeau communauté disparaît** seul. Sinon, ouvrir la console de l'iframe et
   inspecter `await pdfcraft.uiInspect({})` : si le libellé/rect du bouton Discord ou l'ordre « croix puis boutons »
   ont changé, adapter `dismissCommunityBanner()`.
3. Préférences ▸ Commentaire ▸ « Nom sur les nouveaux commentaires » = nom de l'agent. Si `ui.set` refuse la clé
   `author`, regarder `Object.keys(JSON.parse(localStorage.pdfcraft))` (réglages persistés) pour le nouveau nom.
4. Vérifier si l'« Assistant IA » interne gère maintenant un fournisseur (Préférences, panneau Assistant IA) ; sinon
   « Mon assistant IA » (bouton violet du bandeau) reste la voie à utiliser.
5. Les réglages de l'utilisateur sont dans `localStorage['pdfcraft']` (origine de MagApp) : ils survivent aux mises à jour.

## 5. Exploitation

- Le backend doit être **redémarré** après déploiement (nouvelle route `/api/pdf-tools/ai`).
- Nginx doit servir `.wasm` en `application/wasm` (c'est le cas dans `nginx:alpine`) et ne pas envoyer
  `X-Frame-Options: DENY` sur `/pdfcraft/`.
- Rien n'est envoyé à un service externe par PdfCraft lui-même (pas de télémétrie, pas de compte) ; seul « Mon assistant
  IA » appelle l'API IA Ville, via le backend.
- Licences de PdfCraft : MIT OU Apache-2.0 (fichiers `LICENSE-*` et `NOTICE` conservés dans `public/pdfcraft/`).
