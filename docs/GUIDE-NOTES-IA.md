# Guide opérationnel — Module Mes Notes IA (`/notes`)

> Documentation à l'usage des **agents de la DSI et des services**. Mes Notes IA remplace OneNote par un outil de prise de notes **assisté par intelligence artificielle** : vous écrivez ou dictez, l'IA corrige, reformule, résume, classe et propose les actions à mener — **sans jamais perdre votre texte d'origine**.

> 🧠 **Le principe** : vous gardez la main sur la saisie, l'IA fait le travail de mise au propre et d'organisation, **en arrière-plan**, après chaque enregistrement.

---

## 1. En un coup d'œil

| Capacité | Ce que ça fait |
|---|---|
| ✍️ **Note enrichie** | Éditeur WYSIWYG (titres, gras, listes, liens), sauvegarde automatique. |
| 🎤 **Dictée vocale** | Bouton micro : votre voix est transcrite et insérée au curseur. |
| @ **Mentions d'agents** | Tapez `@` puis un nom : l'agent est recherché (AD) et rattaché. |
| ✨ **Correction + reformulation IA** | Fautes corrigées, texte reformulé, **sans changer le sens**. |
| 📝 **Résumé automatique** | Un résumé de 1 à 3 phrases par note. |
| 🗂️ **Classement automatique** | L'IA range la note dans un **carnet › section** (créés si besoin). |
| 🏷️ **Tags intelligents** | Peu de tags, les plus pertinents, sans doublon ni mot inutile. |
| ☁️ **Nuage de mots** | Visualisation des thèmes récurrents de vos notes. |
| ✅ **Actions → tâches** | Les « actions à mener » deviennent des **tâches proposées** à valider. |
| 📎 **Pièces jointes** | Joignez fichiers et images à une note (stockage GED unifié). |
| 🕓 **Historique** | Toutes les versions conservées, restauration en un clic. |

---

## 2. L'interface en un schéma

Mes Notes se présente en **trois colonnes** : l'arborescence à gauche, la liste des notes au milieu, la note (et l'assistant IA) à droite.

```
 ┌──────────────────────────┐ ┌────────────────────┐ ┌──────────────────────────────────┐
 │  🗒️ MES NOTES            │ │  Boîte de réception│ │  Titre de la note                │
 │  [ + Nouvelle note ]     │ │  ·  12 notes       │ │  [✨ Version IA][Originale]  📌 👁 │
 │  🔍 Rechercher…          │ │────────────────────│ │──────────────────────────────────│
 │                          │ │  ▶ Note A    [IA]  │ │  ✨ 2 actions à mener         [Créer]│
 │  📥 Boîte de réception   │ │    Résumé…         │ │  ┌────────────────────────────┐  │
 │  📁 Projets              │ │  ▶ Note B    [IA]  │ │  │ 🎤 Dicter à la voix         │  │
 │    ├ Budget              │ │    Résumé…         │ │  └────────────────────────────┘  │
 │    └ Infra               │ │  ▶ Note C    [—]   │ │  Éditeur enrichi (Quill)…        │
 │  📁 Réseau               │ │    Résumé…         │ │                                  │
 │                          │ │                    │ │  ── Assistant IA ──────────────  │
 │  🏷️ #dg    #fibre        │ │                    │ │  Résumé · Versions · Tâches      │
 │  [☁️ Nuage][✨ Analyser]  │ │                    │ │                                  │
 └──────────────────────────┘ └────────────────────┘ └──────────────────────────────────┘
```

- **Colonne 1 — Arborescence** : carnets 📁 et sections, boîte de réception 📥, liste des tags, boutons *Nuage*, *Analyser* et *Réorganiser*.
- **Colonne 2 — Liste** : notes du carnet/section/tag sélectionné (ou résultats de recherche), avec pastille de statut IA et date.
- **Colonne 3 — Éditeur** : titre, tags, mentions, éditeur, puis le **panneau Assistant IA**.

---

## 3. Créer et enregistrer une note

1. Cliquez sur **[ + Nouvelle note ]** (colonne de gauche) — la note est créée dans le carnet/section en cours.
2. Saisissez un **titre** et le **contenu**.
3. La note est **enregistrée automatiquement** après ~2,5 s d'inactivité. Le bouton **💾 Enregistrer** reste disponible pour forcer.
4. Dès l'enregistrement, l'**analyse IA démarre en arrière-plan** (voir §6).

> 💡 Une note vide ou en cours de rédaction s'ouvre en **édition**. Une note déjà analysée s'ouvre par défaut sur sa **version IA** (voir §7).

### 3.1 Joindre des pièces jointes 📎

Chaque note peut recevoir des **pièces jointes** (documents, images, PDF…).

1. Dans la note, bloc **« Pièces jointes »**, cliquez sur **« Ajouter »**.
2. Sélectionnez un ou **plusieurs fichiers** : ils sont envoyés et listés (nom, taille, type).
3. Les **images** affichent une miniature ; les autres fichiers une icône.
4. Cliquez sur **⤓ Télécharger** pour récupérer un fichier, ou sur **🗑️** pour le supprimer.

> 🗄️ Les fichiers sont stockés par le **service de stockage unifié** (dépôt configuré dans *Administration → GED / Stockage des documents*) et référencés dans la GED centrale. Taille maximale par fichier : **50 Mo**.

> ⚠️ La suppression d'une pièce jointe est **définitive** (fichier + référence).

---

## 4. Dicter une note à la voix 🎤

Le bouton **« Dicter à la voix »** ouvre le microphone du poste :

- Parlez normalement en français : le texte reconnu est **inséré à l'endroit du curseur**.
- Un indicateur rouge **« Écoute… parlez »** confirme la capture ; l'aperçu du texte en cours s'affiche à côté.
- Cliquez de nouveau sur **« Arrêter la dictée »** pour terminer.
- La dictée se relance automatiquement après une courte pause (pas besoin de recliquer).

> ⚠️ **Prérequis** : navigateur **Chrome** ou **Edge**, autorisation du **microphone** demandée au premier usage. En cas de refus, un message vous invite à autoriser le micro dans le navigateur.

---

## 5. Mentionner un agent avec `@`

Pour nommer une personne dans la note :

1. Tapez **`@`** puis les premières lettres (`@chev`).
2. Une liste s'ouvre avec les agents correspondants (nom, e-mail, service).
3. Sélectionnez la bonne personne : `@Chevalier Marc` est inséré.
4. Les personnes mentionnées apparaissent en **chips** sous le titre, chacune avec sa **pastille de présence** RH Studio.

| Pastille | Signification |
|---|---|
| ⭐ | Agent **présent** (RH Studio) |
| ❌ | Agent **parti** (avec date si connue) |
| ⏳ | **Pas encore arrivé** (avec date d'arrivée prévue) |
| ❓ | **Inconnu** de RH Studio |

---

## 6. L'analyse IA en arrière-plan ✨

Après chaque enregistrement (et à la demande avec **✨ Analyser** / **Relancer**), l'IA traite la note **en arrière-plan**, une note à la fois :

```
   Vous écrivez / dictez / @mentionnez
                 │
                 ▼
   💾 Enregistrement (auto 2,5 s ou bouton)
                 │
                 ▼
   ⚙️ File d'attente IA  (arrière-plan, séquentielle)
                 │
                 ├──▶ ✅ Correction orthographique / grammaticale   → version « Corrigée »
                 ├──▶ 🪄 Reformulation (sens et faits conservés)     → version « IA »
                 ├──▶ 📝 Résumé (1 à 3 phrases)
                 ├──▶ 🏷️ Tags pertinents (2 à 8 selon la longueur)
                 ├──▶ 🗂️ Classement carnet › section  → appliqué automatiquement
                 └──▶ ✅ Actions « à mener »          → tâches proposées à valider
```

**Statuts affichés** sur la note :

| Pastille | État |
|---|---|
| ⚪ Non analysée | La note n'a pas encore été traitée. |
| 🟡 En attente IA | En file d'attente. |
| 🔵 Analyse IA… | Traitement en cours. |
| 🟢 Analysée | Traitement terminé. |
| 🔴 Erreur IA | Échec (détail affiché dans le panneau IA ; cliquez sur *Relancer*). |

> 💡 L'analyse se fait **sans bloquer** votre saisie : vous pouvez continuer à écrire pendant le traitement.

---

## 7. Version IA vs note originale

**Votre note initiale n'est jamais écrasée.** L'IA écrit ses propositions à côté.

- En haut de l'éditeur, un sélecteur **`[✨ Version IA]` / `[Originale]`** permet de basculer.
- À l'ouverture d'une note déjà analysée, c'est la **version IA** qui s'affiche par défaut.
- Dans le panneau **Assistant IA**, trois onglets sont disponibles :
  - **Reformulée** (version IA complète),
  - **Corrigée** (fautes uniquement, sens et tournures d'origine conservés),
  - **Originale** (votre texte brut).
- Le bouton **« Utiliser cette version »** copie la version choisie dans le contenu courant (l'ancienne version reste dans l'historique).

```
   Original (vous)            Reformulée (IA)             Corrigée (IA)
   ───────────────            ────────────────            ─────────────
   "faire le point            "Point à faire :            "Faire le point
    avec bouatou sur            organiser une réunion       avec Bouatou sur
    les sujets"                 avec Bouatou sur les        les sujets."
                                sujets en cours."
```

---

## 8. Classement automatique (carnets & sections) 🗂️

L'IA **propose et applique** un rangement cohérent :

- Elle choisit un **carnet** et une **section** pertinents, en **réutilisant l'existant**.
- Si le rangement n'existe pas, il est **créé automatiquement**.
- Les noms sont comparés sans tenir compte des accents/majuscules, ce qui évite les doublons (« Projets » vs « projets »).
- Le déplacement est visible immédiatement : la note apparaît dans son carnet.

Actions manuelles possibles :

- **Déplacer** une note : sélecteurs *Carnet* / *Section* en haut de l'éditeur.
- **Créer** un carnet : bouton **+** à côté de « Mes Notes ».
- **Créer** une section : survolez un carnet, cliquez sur **+**.
- **Réorganiser tout** avec l'IA : bouton **« Réorganiser »** (colonne 1) → proposition d'arborescence à valider.

> ℹ️ Le classement automatique peut être désactivé par l'administrateur (§14), auquel cas la suggestion reste proposée mais n'est pas appliquée seule.

---

## 9. Les tags 🏷️

Les tags servent à **retrouver** une note. Ils sont générés par l'IA et volontairement **peu nombreux** :

| Longueur de la note | Nombre de tags maximum |
|---|---|
| Note très courte (quelques lignes) | **2** |
| Note courte (< 120 mots) | **3** |
| Note moyenne (< 400 mots) | **5** |
| Note longue | **8** (maximum absolu) |

Règles appliquées automatiquement :

- Tags **classés du plus important au moins important** (les 2 premiers sont les thèmes forts).
- **Aucun doublon** (les variantes singulier/pluriel, accents et casse sont fusionnées).
- **Mots inutiles exclus** : *rdv, réunion, organisation, direction, usages, événement, info, divers, important, urgent, tâche, dsi…*
- Vous pouvez ajouter/retirer des tags à la main (8 maximum par note).

---

## 10. Nuage de mots ☁️

Cliquez sur **« Nuage »** (colonne 1) pour afficher les termes les plus fréquents de vos notes :

- Taille de police **proportionnelle à la fréquence**, couleur selon l'importance.
- Filtre par période : **Tout / 30 jours / 90 jours / 1 an**.
- Un clic sur un mot lance la **recherche** de ce mot dans vos notes.
- Les **tags IA** sont mis en avant (ils résument l'intention des notes).
- Une **liste de mots vides** (mots ignorés) est paramétrable en admin (§14).

---

## 11. Transformer les actions en tâches ✅

C'est l'un des points forts du module, calqué sur le **Transcript Manager**.

1. L'IA repère les **actions à mener** dans le texte, notamment celles introduites par :
   `Action à mener`, `Actions à faire`, `À faire`, `Todo`, `Prochaine étape`, `À prévoir`, `À vérifier`, `Rappel`.
2. Un **bandeau bleu** apparaît en haut de la note : **« N action(s) à mener identifiée(s) par l'IA »** avec le bouton **« Proposer N tâche(s) à l'application »**.
3. La modale de validation s'ouvre (comme pour un compte-rendu de réunion) :
   - description de la tâche (modifiable),
   - **affectation à un agent** (recherche AD automatique, la personne est « fixée » si le rapprochement est fiable),
   - **échéance**,
   - case à cocher pour inclure/ignorer chaque tâche.
4. **Valider** crée les tâches dans le module **Mes Tâches** (`context_source = notes`) ; le lien est conservé sur la note.

> 🔎 **Filet de sécurité** : même si le modèle local oublie une action, les lignes explicites (*« Action à mener : … »*) sont détectées automatiquement par analyse du texte. Rien ne passe à la trappe.

Bouton **« Détecter »** (panneau Assistant IA) : relance uniquement l'extraction des tâches, sans refaire toute l'analyse.

---

## 12. Rechercher, épingler, organiser

- **Recherche** (colonne 1) : filtre par titre, contenu et résumé.
- **Tags** (colonne 1) : cliquez un tag pour voir toutes les notes associées.
- **Épingler** 📌 : la note remonte en tête de liste (bouton dans la barre d'outils).
- **Aperçu / Édition** 👁 ✎ : bascule entre lecture et modification.

---

## 13. Historique des versions 🕓

Chaque modification significative du contenu crée une **version**. Dans le panneau Assistant IA, section **Historique** :

- Liste des versions (date, origine : *original*, *ia*, *manual*).
- Bouton **Restaurer** : revient à une version antérieure (l'état actuel est d'abord sauvegardé).
- La version **originale** de la note est conservée dès sa création.

---

## 14. Configuration (administrateur) — `/admin/notes`

Le paramétrage se fait dans **Administration → Notes IA (Mes Notes)** :

| Réglage | Rôle |
|---|---|
| **Modèle IA (API Ville / APM)** | Modèle local utilisé (modèle par défaut de l'APM ou modèle précis). |
| **Taille max analysée** | Nombre de caractères transmis à l'IA (troncature au-delà). |
| **Analyse automatique après sauvegarde** | Déclenche l'analyse en arrière-plan (activé par défaut). |
| **Classement automatique** | Applique carnet + section proposés par l'IA (activé par défaut). |
| **Prompt d'analyse** | Correction + reformulation + résumé + tags + classement + tâches. |
| **Prompt d'extraction des tâches** | Utilisé par « Détecter » et par la détection automatique. |
| **Prompt de classement** | Rangement d'un lot de notes. |
| **Prompt de réorganisation** | Réorganisation globale de l'arborescence. |
| **Mots vides du nuage de mots** | Mots ignorés dans le nuage. |

> ⚙️ L'API IA Ville (APM) se configure dans **Administration → API externes** (`/admin/infra`), clé **`apm_ai`** (URL + clé + activation).

---

## 15. Bonnes pratiques & dépannage

**Bonnes pratiques**

- Dictez ou saisissez sans vous soucier de la mise en forme : l'IA s'en charge.
- Utilisez les marqueurs **« Action à mener : … »** pour garantir la création de tâches.
- Laissez le classement automatique ranger, puis ajustez si besoin.
- Vérifiez la **version IA** avant de l'adopter : l'originale reste toujours accessible.

**Dépannage**

| Symptôme | Cause probable / solution |
|---|---|
| Pas de micro | Utilisez **Chrome/Edge** et autorisez le micro. |
| Statut 🔴 Erreur IA | API APM désactivée ou injoignable → vérifier `/admin/infra` ; puis *Relancer*. |
| Pas de tâche proposée | Aucune action réelle détectée, ou APM indisponible. Utilisez *Détecter*. |
| Trop/peu de tags | Les tags sont adaptés à la longueur ; ajustables à la main (8 max). |
| Note mal classée | Corrigez via les sélecteurs *Carnet/Section*, ou lancez *Réorganiser*. |

> 📌 En cas de doute, le bouton **✨ Relancer** dans le panneau Assistant IA relance l'analyse complète de la note.
