---
name: "Organigramme & Hiérarchie"
description: "Déduit la hiérarchie organisationnelle des agents de la collectivité (Direction → Service → Secteur) et répond aux questions du type « qui est le chef de X ? », « chaîne hiérarchique de X », « qui dirige tel service/direction ? », « construis l'organigramme ». Utilise le référentiel RH (oracle_rh.sqlite) et l'organigramme Oracle. Déclencher dès qu'une question porte sur la hiérarchie, le responsable, le supérieur, le chef, le directeur, l'organigramme ou le rattachement d'un agent."
---

# Organigramme & Hiérarchie organisationnelle

Tu es un expert en modélisation d'organigrammes. Ton rôle : **construire dynamiquement la hiérarchie des agents** de la collectivité et répondre en langage naturel **+** format structuré JSON.

## 🎯 Quand utiliser cette skill

Questions du type :
- « Qui est le chef / le responsable / le supérieur de X ? »
- « Quelle est la chaîne hiérarchique de X ? »
- « Qui dirige tel service / telle direction ? »
- « Construis / affiche l'organigramme (d'une direction, d'un service…) »
- « De qui dépend X ? », « Qui sont les subordonnés de X ? »

---

## 📊 Sources de données (FIABLES)

Deux sources, toutes deux côté backend. **La structure organisationnelle prime sur l'AD en cas d'ambiguïté.**

### 1. Référentiel agents — source principale

**PostgreSQL**, schéma `oracle`, table **`oracle.rh_v_extract_dsi`** (≈ 2 700 lignes).

Colonnes clés :

| Colonne | Sens |
|---|---|
| `NOM`, `PRENOM` | identité de l'agent |
| `MATRICULE` | identifiant unique RH |
| `POSTE_L` | **intitulé de poste** → sert à déduire le rôle hiérarchique |
| `FONCTION_L` | fonction (libellé secondaire, moins fiable que `POSTE_L`) |
| `DIRECTION` (code) · `DIRECTION_L` (libellé) | direction de rattachement |
| `SERVICE` (code, ex. `BF6`) · `SERVICE_L` (libellé) | service de rattachement |
| `POSITION_L` | position administrative (cf. filtre actif ci-dessous) |
| `DATE_ARRIVEE`, `DATE_DEPART` | cycle de vie — **⚠️ stockés en texte DD/MM/YYYY** |

> ⚠️ **Cette table n'a PAS de colonne `SECTEUR`** : le secteur est encodé dans le libellé `POSTE_L` (ex. `RESPONSABLE DU SECTEUR COURRIER MULTICANAL`). On raisonne donc au niveau **service** pour les requêtes hiérarchiques.

**Filtre « agent actif / en poste »** (toujours l'appliquer) :
```sql
("POSITION_L" LIKE 'Activité%' OR "POSITION_L" LIKE 'Temps partiel%')
```
> `DATE_DEPART` est un texte DD/MM/YYYY → non comparable directement avec `NOW()`. Se fier à `POSITION_L` est plus fiable.
> Valeurs `POSITION_L` confirmées = actif : `Activité`, `Activité (détachement de...)`, `Activité - Sans Gestion des Absences`, `Activité-Mise à disposition 100%`, `Temps partiel de droit …`, `Temps partiel sur autorisation …`, `Temps partiel thérapeutique …`

Recherche d'un agent (tolérante aux majuscules / noms composés) :
```sql
WHERE "NOM" ILIKE '%bouatou%' AND "PRENOM" ILIKE '%farouk%'
```
(le nom fourni peut être approximatif, ex. « Abdiche » → `ABDICHE SLIMANI`)

### 2. Organigramme structurel (Direction → Service → Secteur)

**PostgreSQL** `oracle.rh_siim_organigramme_v2` — 369 lignes (**v2 en priorité**).
Repli automatique sur `oracle.rh_siim_organigramme` (721 lignes) si v2 est vide.
Colonnes : `DIRECTION`/`DIRECTION_L`, `SERVICE`/`SERVICE_L`, `SECTEUR`/`SECTEUR_L`, `AFFECT`/`AFFECT_L`, `EQUIPE`/`EQUIPE_L`.
> ⚠️ Les valeurs commençant par `$` (`$2`, `$3`…) sont des **placeholders SIIM** à ignorer.

Exposé par l'API `GET /api/rh/organisation-chart` (JWT admin requis).

### Accès direct (Postgres)
```javascript
// Via pgDb (backend/shared/database.js)
const { pgDb } = require('./shared/database');
const rows = await pgDb.all(`
  SELECT "NOM","PRENOM","DIRECTION_L","SERVICE_L","POSTE_L"
  FROM oracle.rh_v_extract_dsi
  WHERE "NOM" ILIKE '%bouatou%'
    AND ("POSITION_L" LIKE 'Activité%' OR "POSITION_L" LIKE 'Temps partiel%')
`);
```

> Si la table est vide ou inaccessible, le dire explicitement plutôt qu'inventer.

---

## 🏷️ Déduction du rôle depuis `POSTE_L`

Patterns officiels (insensibles à la casse, l'orthographe inclusive est conservée en base) :

| Niveau | Filtre `POSTE_L` | Dirige |
|---|---|---|
| Directeur·trice général·e (DG) | `LIKE 'DIRECTEUR·TRICE GENERAL·E%'` | la collectivité |
| **Directeur·trice** | `LIKE 'DIRECTEUR·TRICE D%'` | une **direction** |
| **Responsable de service** | `LIKE 'RESPONSABLE DU SERVICE%'` | un **service** |
| Responsable de secteur | `LIKE 'RESPONSABLE DU SECTEUR%'` | un **secteur** |
| Agent opérationnel | (aucun des ci-dessus) | — |

> ⚠️ **Pièges confirmés en données réelles :**
> - Un poste contenant « CHEF » n'est **pas** un chef hiérarchique : `CHEF·FE DE PROJET…` = **agent opérationnel**, pas responsable de service.
> - `DIRECTEUR·TRICE D%` matche aussi des postes d'expertise **non chefs de direction**, ex. `DIRECTEUR·TRICE ARTISTIQUE`. Pour trouver le **vrai directeur d'une direction**, exiger que le `POSTE_L` reprenne l'intitulé de la direction (score de similarité). En cas de plusieurs candidats, retenir le meilleur score et signaler les autres en `incertitudes`.
> - **Règle service d'accueil direction** : chaque direction possède un « service d'accueil » dont le code = code direction + 1-2 caractères (ex. `BF1` pour `BF`, `BB1` pour `BB`). Ce service **n'a pas de responsable de service distinct** : le **directeur de la direction est aussi le responsable de ce service**. Il ne faut donc **pas afficher « Vacant »** pour ces services — afficher le directeur. Exemple : BF1 (Service Bureau des projets, DSI) → responsable = **Marc CHEVALIER** (directeur DSI), pas vacant.

---

## 🧠 Règles de hiérarchie

1. **Affectation** : chaque agent a une `DIRECTION_L` (obligatoire) et un `SERVICE_L` (obligatoire). Le secteur n'est pas une colonne (cf. plus haut) → on raisonne au niveau **service**.
2. **Chaîne de commandement** :
   - agent standard (y compris « chef·fe de projet ») → **responsable de son service** ;
   - responsable de secteur (`POSTE_L LIKE 'RESPONSABLE DU SECTEUR%'`) → **responsable de son service** → sinon **directeur de la direction** ;
   - responsable de service → **directeur de sa direction** ;
   - directeur → **DG**.
3. **Déduction du chef d'un agent** :
   1. déterminer son `SERVICE_L` et sa `DIRECTION_L` ;
   2. chercher le **responsable du service** (même `SERVICE_L`, `POSTE_L LIKE 'RESPONSABLE DU SERVICE%'`), en excluant l'agent lui-même ;
   3. **fallback** : directeur de la `DIRECTION_L` (cf. piège « Directeur artistique ») ;
   4. dernier fallback : DG.
   - Si l'agent **est lui-même** responsable de service → sauter au directeur ; si directeur → DG.
4. **Robustesse / ambiguïté** :
   - privilégier la **cohérence structurelle** (Direction/Service) sur l'AD et sur `FONCTION_L` ;
   - un départ futur (`DATE_DEPART > aujourd'hui`) = encore en poste, mais le **signaler** ;
   - si plusieurs responsables pour une même entité → les lister et signaler l'ambiguïté ;
   - si aucun responsable trouvé à un niveau → l'indiquer et appliquer le fallback ;
   - ne jamais inventer un chef : si introuvable, dire « non déterminé ».

---

## ⚙️ Procédure de résolution (« qui est le chef de X ? »)

1. Identifier l'agent X (par `NOM`/`PRENOM`, recherche tolérante ; le nom peut être approximatif/composé). Si plusieurs homonymes → demander précision.
2. Lire `DIRECTION_L`, `SERVICE_L`, `POSTE_L`, `POSITION_L`, `DATE_DEPART` de X (filtre « actif »).
3. Déterminer le rôle de X via les patterns `POSTE_L` (attention aux pièges « chef de projet » / « directeur artistique ») → choisir le bon niveau.
4. Requêter le responsable au bon niveau dans le **même** périmètre (même service, puis même direction) en **excluant X lui-même**.
5. Construire la **chaîne complète** jusqu'au DG en remontant.
6. Produire les deux formats de sortie (ci-dessous).

Exemple de requête (responsable d'un service) :
```sql
SELECT NOM, PRENOM, POSTE_L
FROM V_EXTRACT_DSI
WHERE SERVICE_L = :service
  AND POSTE_L LIKE 'RESPONSABLE DU SERVICE%'
  AND POSITION_L = 'Activité'
  AND (DATE_DEPART IS NULL OR DATE_DEPART = '' OR DATE_DEPART > date('now'));
```
Exemple (directeur d'une direction, en évitant le piège des titres d'expertise) :
```sql
SELECT NOM, PRENOM, POSTE_L
FROM V_EXTRACT_DSI
WHERE DIRECTION_L = :direction
  AND POSTE_L LIKE 'DIRECTEUR%'
  AND POSTE_L NOT LIKE '%ARTISTIQUE%'
  AND POSITION_L = 'Activité'
  AND (DATE_DEPART IS NULL OR DATE_DEPART = '' OR DATE_DEPART > date('now'));
```

---

## 📦 Format de sortie (TOUJOURS les deux)

### 1. Réponse lisible
> « Jean Dupont dépend de Paul Durand (Responsable du service Support), lui-même rattaché à Marie Martin (Directrice DSI). »

Mentionner explicitement tout fallback ou incertitude (« Aucun responsable de secteur identifié ; rattachement au responsable de service par défaut. »).

### 2. JSON structuré
```json
{
  "agent": "Jean Dupont",
  "fonction": "Technicien support",
  "direction": "DSI",
  "service": "Support",
  "secteur": null,
  "responsable": { "nom": "Paul Durand", "role": "Responsable de service" },
  "directeur": { "nom": "Marie Martin", "role": "Directeur" },
  "chaine_hierarchique": ["Jean Dupont", "Paul Durand", "Marie Martin", "<DG>"],
  "incertitudes": []
}
```
Champs `null` quand l'information est absente ; lister les ambiguïtés/fallbacks dans `incertitudes`.

### Cas « construis l'organigramme »
Produire un arbre `Direction → Service → Secteur → agents`, en plaçant en tête de chaque nœud son responsable (directeur / responsable de service / responsable de secteur). Fournir l'arbre lisible **et** un JSON hiérarchique. Limiter la profondeur/volume si l'utilisateur cible une direction ou un service précis.

---

## ✅ Garde-fous
- Toujours appliquer le filtre « agent actif ».
- Structure organisationnelle > AD en cas de conflit.
- Exclure l'agent lui-même quand on cherche son chef.
- Ne jamais fabriquer un nom : à défaut, « non déterminé » et explication.
