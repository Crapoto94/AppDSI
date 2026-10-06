---
name: telecom
description: >-
  Module /telecom d'AppDSI : inventaire des lignes (téléphonie fixe + accès
  internet), facturation opérateur (export ZIP SFR), parc mobile et optimisation
  des coûts. Déclencher dès qu'on parle de lignes téléphoniques, NDI, numéros de
  téléphone, accès internet/fibre/ADSL/SDSL, abonnements télécom, factures
  opérateur, SFR, forfaits mobiles, SIM, parc mobile, fin du cuivre/RTC,
  migration de lignes, résiliations, lignes dormantes, coût par ligne/site/
  direction, économies télécom, ou de l'import/suivi mensuel d'un export
  opérateur ; ou pour exploiter, analyser, suivre et optimiser les lignes.
---

# Module Télécom — inventaire, facturation & optimisation des lignes

## But

Aider à **exploiter, suivre et optimiser** le parc télécom de la collectivité :
lignes fixes/internet (inventaire), facturation opérateur (SFR), parc mobile, et
détection des économies. Le tout est ré-importable mois après mois pour un suivi
dans le temps.

## Architecture du module

### Backend (`backend/modules/telecom/`)
| Fichier | Rôle |
|---|---|
| `telecom.controller.js` | toute la logique (lignes, facturation, stats, rapprochement, historique) |
| `telecom.routes.js` | routes `/api/telecom/*` |
| `telecom.sfr-parser.js` | parseur de l'export ZIP SFR (ZIP de ZIPs → CSV latin1 `;`) |

Tables (créées dans `backend/shared/pg_db.js`, schéma `hub_telecom`) :
- **`lines`** — inventaire. Clé d'upsert **`mid`** (Identifiant MID). `category` déduite :
  `Offre = "Office"` → `fixe` (téléphonie), sinon `internet`. **Le numéro de téléphone = `ndi`.**
- **`line_billing`** — facturation par ligne et par mois. Clé **`(period, line_number, cf_id)`**
  (un même numéro peut être facturé sur 2 comptes). Contient `is_mobile`, `plan`, `user_name`,
  les montants ventilés (`amt_*`) et la **conso réelle** `conso_voix` (secondes) / `conso_data` (volume).
- **`billing_trend`** — tendance par offre/mois (fichier `tdb13Mois`).
- **`operators` / `billing_accounts` / `invoices`** — comptes opérateur et factures PDF (existant).

### Frontend (`frontend/src/pages/TelecomManagement.tsx`)
Onglets : **Comptes**, **Factures PDF**, **Engagements** (nature 6262, lu dynamiquement
depuis `oracle.budget_engagements`), **Lignes & Internet**, **Coûts & Mobile**, **Optimisation**.
Les numéros (NDI / N° ligne) sont **cliquables** → modale d'historique 12 mois glissants.

### Endpoints clés
| Méthode | Route | Usage |
|---|---|---|
| POST | `/api/telecom/lines/import` | import Excel inventaire (multi-fichiers, upsert par MID) |
| GET | `/api/telecom/lines` / `/lines/stats` | liste filtrable / KPIs (migration cuivre, résiliations, têtes de ligne) |
| POST | `/api/telecom/billing/import` | import ZIP SFR (remplace la période, idempotent) |
| GET | `/api/telecom/billing/stats` | KPIs coûts, dormantes, top lignes, par forfait/site/direction |
| GET | `/api/telecom/billing/trend` | tendance mensuelle |
| GET | `/api/telecom/billing/lines` | détail facturation filtrable |
| GET | `/api/telecom/billing/reconciliation` | rapprochement inventaire ↔ facturation |
| GET | `/api/telecom/billing/line/:number` | historique 12 mois d'un numéro |

## Sources de données (ce qui alimente quoi)

1. **Inventaire** = fichiers Excel opérateur (« Lignes fixes.xlsx », « accès internet.xlsx »).
   Colonnes : Numéro de site, Site, Adresse, Contrat, Compte de facturation, **Identifiant (MID)**,
   Offre, Type d'accès, A migrer, Fin du cuivre lot, **NDI**, Statut, dates, Raison sociale, Siren.
   ⚠ « Lignes fixes » est un **superset** qui contient déjà les accès internet → l'upsert par MID dédoublonne.
2. **Facturation** = export ZIP SFR (`GROUPE COMMUNE...export_SFR_MMYY.zip`), ZIP de ZIPs.
   CSV utiles : `synthese` (1 ligne = 1 numéro/mois + coûts), `syntheseLMDetail` (parc mobile :
   forfait, utilisateur, résiliation, **conso voix/data**), `tdb13Mois` (tendance).
   Jointure inventaire ↔ facturation : **`lines.ndi` = `line_billing.line_number`** (comparer chiffres uniquement).
3. **Engagements** = `oracle.budget_engagements` nature **6262** (lecture dynamique, pas d'import).

## Suivi mensuel (procédure récurrente)

À chaque nouvel export opérateur :
1. Onglet **Coûts & Mobile** → « Importer facturation (ZIP) » (l'import **remplace** la période,
   donc ré-importable sans doublon ; chaque mois ajoute un point à l'historique 12 mois).
2. Si l'inventaire a changé : onglet **Lignes & Internet** → « Importer / Réimporter (Excel) ».
3. Consulter l'onglet **Optimisation** : économies potentielles, dormantes, résiliées facturées.
4. ⚠ **Node ne se recharge pas seul** (`npm start`, pas de nodemon) : après modification du code
   backend, **redémarrer le backend** pour que les nouvelles routes/colonnes soient prises en compte.

## Leviers d'optimisation (à analyser/proposer systématiquement)

1. **Lignes mobiles dormantes** — `is_mobile` + facturé + `conso_voix = 0` ET `conso_data = 0`.
   → candidates à résiliation/mise en veille. (Levier le plus rentable.)
2. **Lignes résiliées encore facturées** — inventaire `status` ≠ « En service » mais présentes
   dans `line_billing`. → réclamation opérateur.
3. **Migration fin du cuivre (RTC)** — lignes analogiques (`offer = Office`, `to_migrate`) à basculer
   en fibre/ToIP avant fermeture. Surfacer les échéances (`copper_end_lot`).
4. **Liens mutualisés** (T2/T0/groupements) — têtes de ligne regroupant plusieurs SDA : cibles de
   consolidation SIP. Les numéros SDA secondaires ne sont **pas** dans l'inventaire (demander à l'opérateur).
5. **Sur/sous-dimensionnement forfaits** — comparer `plan` (Go/min) à la conso réelle.
6. **Coût par direction/service** (`list_label`) — base de refacturation interne et d'arbitrage.
7. **Lignes facturées hors inventaire** / **en service non facturées** — fiabiliser le référentiel.

## Conventions importantes

- **Numéros PostgreSQL en chaînes** : convertir avant somme (virgule décimale).
- **Comparaison de numéros** : normaliser en ne gardant que les chiffres
  (`regexp_replace(line_number,'\D','','g')` côté SQL).
- **Dates opérateur** : `JJ-MM-AAAA` (inventaire) ou `JJ/MM/AA` (facturation) → ISO.
- **`pgDb` réécrit les noms de tables nus** : toujours qualifier `hub_telecom.<table>`.
- **Règle dashboard** : tout nouveau KPI doit aussi devenir un widget `/dsi-dashboard`
  (voir skill `dashboard-widget`). Widgets télécom existants : `telecom_lines_kpi`,
  `telecom_cost_kpi`, `telecom_optim_kpi`.

## Étendre le module

- **Nouveau KPI/analyse** : ajouter une fonction au controller + route, puis un widget dashboard.
- **Nouvelle source de facturation (autre opérateur)** : créer un parseur dédié sur le modèle de
  `telecom.sfr-parser.js` et le brancher dans `importBilling` selon le format détecté.
- **Migrations de schéma** : `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` dans `setupPgDb()`.

## Vérification

- Frontend : `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
- Backend : `node -e "require('./modules/telecom/telecom.controller.js');require('./modules/telecom/telecom.routes.js')"`
- Données : interroger `hub_telecom.lines` / `line_billing` via un script ponctuel utilisant `pool`.
