---
name: sedit-finances
description: >-
  Accès direct à la base Oracle du logiciel financier Sedit Finances (Berger-
  Levrault, schéma FI) — le progiciel source de vérité pour factures, mandats,
  marchés, tiers et budget, dont AppDSI ne reprend qu'une copie partielle côté
  PostgreSQL. Explique comment se connecter à l'Oracle réel (paramètres stockés
  en SQLite `oracle_settings`), la convention d'identifiant technique
  `ROO_IMA_REF` commune à toutes les tables FI, et le chemin de jointure pour
  retrouver les pièces jointes (PJ PES : PDF/XML dématérialisés) d'une facture,
  d'un mandat, d'un marché ou d'un tiers. Déclencher dès qu'on parle de Sedit,
  Sedit Finances, e-GF, du schéma Oracle FI, de l'accès Oracle direct (par
  opposition à la copie Postgres), de pièces jointes/PJ PES d'une facture ou
  d'un mandat Sedit, ou qu'on cherche le modèle de données finances au-delà de
  ce qu'expose déjà le module /finance d'AppDSI.
---

# Sedit Finances — accès Oracle direct (schéma `FI`)

## Contexte

**Sedit Finances** (Berger-Levrault, aussi appelé **e-GF**) est le progiciel
source de vérité de la collectivité pour factures, mandats, engagements,
marchés, tiers et budget. AppDSI ne réplique qu'une **copie partielle** de
certaines tables côté PostgreSQL (schéma `oracle` synchronisé via
`backend/modules/oracle/`) — cette copie est **insuffisante** pour des
questions fines (ex. pièces jointes d'une facture). Pour ça, il faut se
connecter **directement à l'Oracle de Sedit**.

> ⚠️ Cette base est un **système de production tiers** (pas administré par
> AppDSI). Toujours interroger en **lecture seule** (`SELECT`). Ne jamais
> exécuter d'`UPDATE`/`DELETE`/`INSERT` sans autorisation explicite de
> l'utilisateur.

## Se connecter

Les paramètres de connexion (host/port/service/utilisateur/mot de passe) sont
stockés dans la table **SQLite** `oracle_settings` (`backend/data/database.sqlite`),
**pas** dans la table Postgres du même nom (celle-ci existe aussi via les
migrations `010-012` mais est restée vide/désactivée — ne pas s'y fier).

```js
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const oracledb = require('oracledb'); // v6+, mode "thin" natif, pas de client Oracle requis

const db = await open({ filename: 'backend/data/database.sqlite', driver: sqlite3.Database });
const settings = await db.get("SELECT * FROM oracle_settings WHERE type = 'FINANCES'");
await db.close();

const connection = await oracledb.getConnection({
  user: settings.username,           // 'FI'
  password: settings.password,
  connectString: `${settings.host}:${settings.port}/${settings.service_name}`
  // host 10.103.130.25, port 1527, service SMPROD (confirmé en environnement Ivry)
});
```

Il existe aussi un type `'RH'` (host `10.103.130.25:1525/RHIVR`, user `RH`) pour
la base RH Sedit, et `'DELIB'` (non configuré à ce jour).

Le helper applicatif équivalent existe déjà : `getOracleConnection(settings)`
dans `backend/shared/database.js` (attend un objet settings avec `is_enabled`).

## Convention d'identifiant technique : `ROO_IMA_REF`

**Toutes** les tables métier du schéma `FI` ont une clé primaire technique
`ROO_IMA_REF` (CHAR(31), padded avec espaces) — c'est l'identifiant objet
interne de Sedit (« Rowid image »), indépendant des clés métier lisibles
(ex. le numéro de facture `'F26008278'`). C'est **ce champ** qu'il faut
utiliser pour toute jointure inter-tables, jamais le libellé métier.

Colonnes techniques quasi systématiques sur ces tables : `DATE_CREAT`,
`USER_CREAT`, `DATE_MODIF`, `USER_MODIF`, `UPDATOKEN`, `NOTICE`,
`POBJ_EXTRACT` (résumé texte de l'objet, séparé par `\u0001`).

## Retrouver les pièces jointes d'une facture (PJ PES)

Les factures dématérialisées (flux PES = Protocole d'Échange Standard,
Chorus/Hélios) arrivent avec leurs pièces (PDF de la facture + XML du flux).
Chemin de jointure, 3 tables :

```
FI.FACTURE  (la facture)
   ROO_IMA_REF  ──┐  PK ; colonne métier "FACTURE" = numéro affiché (ex. 'F26008278')
                  │
FI.FIPES_OBJ_PJ (liaison objet ↔ pièce jointe)
   OBJECT_ROO  = FACTURE.ROO_IMA_REF
   OBJECT_TYPE = 'FACTURE'
   PJPES_ROO   ──┐  → PJ_PES.ROO_IMA_REF
   PRINCIPAL      │  1 = pièce principale (le PDF), 0 = pièce secondaire (le XML)
                  │
FI.PJ_PES (la pièce jointe elle-même)
   ROO_IMA_REF  PK
   NOM_PJ           nom du fichier
   CHEMIN_FICHIER   chemin UNC réel sur le stockage Sedit (PAS un BLOB en base)
   FORMAT           code type ('06' = PDF, '03' = XML, à confirmer pour les autres codes)
   TAILLE           taille du fichier
   USAGE            'P' = pièce PES
   TYPE_PIECE_ID    FK → FI.TYPE_PIECE (référentiel des types de pièce)
   GED_ID           FK optionnelle vers FI.SEDIT_BUSAPP_GED_DOC si géré en GED plutôt qu'en filesystem
```

Requête complète :

```sql
SELECT pj.NOM_PJ, pj.CHEMIN_FICHIER, pj.FORMAT, pj.TAILLE, lnk.PRINCIPAL
FROM FI.FACTURE f
JOIN FI.FIPES_OBJ_PJ lnk ON lnk.OBJECT_ROO = f.ROO_IMA_REF AND lnk.OBJECT_TYPE = 'FACTURE'
JOIN FI.PJ_PES pj        ON pj.ROO_IMA_REF = lnk.PJPES_ROO
WHERE f.FACTURE = :num_facture
ORDER BY lnk.PRINCIPAL DESC;
```

> Vérifié en conditions réelles sur la facture `F26008278` : renvoie exactement
> les 2 pièces visibles dans l'écran Sedit (PDF principal `PJ00XFAC...pdf` +
> XML secondaire `FAC...xml`), chemin type
> `\\seditgf-prod\editions$\SMPROD\eGF\pjust\FACTURE_D\30\00\UGAP\2026\<n°fournisseur>\...`.

**Le fichier n'est pas stocké en BLOB Oracle** : `CHEMIN_FICHIER` pointe vers
un partage réseau UNC. Pour le lire depuis AppDSI il faut accéder à ce
partage (même logique que le module GED d'AppDSI — voir [[ged]] — mais c'est
un **stockage Sedit distinct**, pas celui piloté par `/admin/ged`).

## Autres tables `FI.*PJ*` / `*PIECE_JOINTE*` repérées (schéma probablement analogue)

Par analogie avec le mécanisme facture, à vérifier au cas par cas avant de
s'y fier aveuglément :

| Table | Objet concerné probable |
|---|---|
| `MANDPJ` | pièces jointes de mandat |
| `MAR_PIECE_JOINTE` / `MAR_PIECE_JOINTE_AUD` | pièces jointes de marché |
| `TIE_PIECE_JOINTE` / `TIE_PIECE_JOINTE_BACKUP` | pièces jointes de tiers |
| `LIQ_PIECE_JOINTE` | pièces jointes de liquidation |
| `CEC_ELEMENT_PJ` / `APAE_ELEMENT_PJ` | pièces jointes d'éléments CEC/APAE (engagements) |
| `ESUBR_PIECES` / `ESUBV_PIECES` | pièces des dossiers de subvention (reçues/versées) |
| `ECP_PIECE_JOINTE` | à identifier (module ECP) |
| `TYPE_PIECE` | référentiel des types de pièce (FK `TYPE_PIECE_ID`) |
| `SEDIT_BUSAPP_GED_DOC` (+ `_DICT`, `_TYPE`, `_DOMAIN`) | GED interne Sedit, alternative au stockage filesystem quand `GED_ID` est renseigné |

## Méthode pour explorer une nouvelle question sur Sedit

1. Se connecter en lecture seule à Oracle `FINANCES` (voir ci-dessus).
2. Chercher les tables candidates :
   ```sql
   SELECT owner, table_name FROM all_tables
   WHERE owner = 'FI' AND table_name LIKE '%<MOT_CLE>%';
   ```
3. Inspecter les colonnes et la PK de chaque table candidate :
   ```sql
   SELECT column_name, data_type, data_length FROM all_tab_columns
   WHERE owner='FI' AND table_name=:t ORDER BY column_id;

   SELECT cols.column_name FROM all_constraints cons
   JOIN all_cons_columns cols ON cons.constraint_name = cols.constraint_name AND cons.owner = cols.owner
   WHERE cons.owner='FI' AND cons.table_name=:t AND cons.constraint_type='P'
   ORDER BY cols.position;
   ```
4. Chercher la table de liaison (souvent `<PREFIXE>_OBJ_PJ` ou `<PREFIXE>PJ`)
   qui référence le `ROO_IMA_REF` de l'objet source.
5. **Toujours valider avec une vraie requête** sur un cas concret connu
   (comme F26008278 ci-dessus) avant de documenter/généraliser un chemin.

## Garde-fous

- Lecture seule uniquement (`SELECT`) sur cette base de production tierce.
- Ne jamais faire confiance à la table Postgres `oracle_settings` (vide) :
  les vraies credentials sont en SQLite.
- Ne pas confondre les libellés métier (ex. `'F26008278'`) avec les clés
  techniques `ROO_IMA_REF` — toute jointure se fait sur `ROO_IMA_REF`.
- Le stockage réel des fichiers est un **partage UNC Sedit**, distinct du
  stockage AppDSI documenté dans [[ged]].
