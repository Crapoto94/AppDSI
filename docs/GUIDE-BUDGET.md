# Guide opérationnel — Module Budget & Finances (`/budget`)

> Documentation budgétaire et comptable à l'usage des **responsables de services, chefs de projets DSI, directeurs et gestionnaires financiers**.
> Ce guide détaille le suivi de l'exécution budgétaire annuelle de la DSI selon la nomenclature M57 : crédits votés, engagements, bons de commande SEDIT, facturation Oracle, certification du Service Fait et préparation budgétaire N+1.

---

## Sommaire

1. [Principes de la comptabilité publique M57 appliquée à la DSI](#1-principes-de-la-comptabilité-publique-m57-appliquée-à-la-dsi)
2. [Vue d'ensemble et tableau de bord synthétique (`/budget`)](#2-vue-densemble-et-tableau-de-bord-synthétique-budget)
3. [Distinction Fonctionnement (F) vs Investissement (I)](#3-distinction-fonctionnement-f-vs-investissement-i)
4. [Cycle d'une dépense : du vote au mandat de paiement](#4-cycle-dune-dépense-du-vote-au-mandat-de-paiement)
5. [Lignes budgétaires et rubriques mappées configurables](#5-lignes-budgétaires-et-rubriques-mappées-configurables)
6. [Suivi des engagements et des bons de commande (SEDIT)](#6-suivi-des-engagements-et-des-bons-de-commande-sedit)
7. [Factures et circuit de visa du Service Fait (`/service-fait`)](#7-factures-et-circuit-de-visa-du-service-fait-service-fait)
8. [Référentiel des Tiers et Fournisseurs (`/tiers`)](#8-référentiel-des-tiers-et-fournisseurs-tiers)
9. [Préparation budgétaire de l'exercice N+1](#9-préparation-budgétaire-de-lexercice-n1)
10. [Interactions avec les autres modules du Hub](#10-interactions-avec-les-autres-modules-du-hub)
11. [Règles de bonne gestion et calendrier financier](#11-règles-de-bonne-gestion-et-calendrier-financier)

---

## 1. Principes de la comptabilité publique M57 appliquée à la DSI

Le module Budget permet aux équipes de la DSI de piloter leurs enveloppes financières en toute autonomie tout en assurant une parfaite concordance avec les données du progiciel comptable central de la collectivité.

### 1.1 Objectifs
- Connaître à l'euro près les crédits réellement **disponibles** (crédits votés minorés des engagements en cours et des factures payées).
- Éviter les rejets comptables en fin d'exercice lors de la clôture de la journée complémentaire.
- Fournir un état de gestion clair et lisible lors des dialogues de gestion avec la Direction des Finances et la Direction Générale.

---

## 2. Vue d'ensemble et tableau de bord synthétique (`/budget`)

L'onglet **Synthèse** consolide la situation financière globale de l'exercice :

### 2.1 Cartes de pilotage
- **Budget voté total** : montant total des crédits ouverts au Budget Primitif (BP) et lors des Décisions Modificatives (DM).
- **Total engagé TTC** : somme des dépenses déjà juridiquement réservées via un bon de commande ou un marché.
- **Total facturé / mandaté TTC** : dépenses dont la facture est reçue et mise en paiement.
- **Crédits disponibles après reports** : montant exact restant mobilisable pour engager de nouvelles dépenses d'ici la fin de l'année.
- **Taux de consommation** : pourcentage d'exécution budgétaire permettant d'évaluer le rythme d'avancement des projets.

### 2.2 Sélecteurs de contexte
- **Exercice budgétaire** : bascule d'une année fiscale à l'autre (ex. 2024, 2025, 2026).
- **Périmètre analytique** : filtrage par service DSI ou vision globale « Ville ».

---

## 3. Distinction Fonctionnement (F) vs Investissement (I)

Selon la norme comptable M57 :

- **Section d'Investissement (I)** : dépenses qui enrichissent le patrimoine de la collectivité et font l'objet d'un amortissement pluriannuel.
  - *Règle automatique M57* : toute dépense imputée sur un compte de nature commençant par le chiffre **2** (ex. `2183` - Matériel informatique, `2051` - Concessions et logiciels propriétaires) est automatiquement classée en Investissement.
- **Section de Fonctionnement (F)** : dépenses de gestion courante consommées au cours de l'exercice sans valeur patrimoniale durable.
  - Exemples : abonnements SaaS (`651`), contrats de maintenance (`6156`), prestations d'assistance technique (`622`), consommables et petites fournitures (`6063`).

---

## 4. Cycle d'une dépense : du vote au mandat de paiement

Toute acquisition publique franchit 5 étapes jalonnées :

```
1. Vote des crédits (Budget Primitif / Décision Modificative)
       │
       ▼
2. Engagement comptable (Réservation des crédits sur une ligne)
       │
       ▼
3. Bon de commande (Émission du BC SEDIT et envoi au fournisseur)
       │
       ▼
4. Réception & Service Fait (Contrôle de conformité du matériel ou de la prestation)
       │
       ▼
5. Mandatement & Paiement (Virement bancaire au fournisseur via le Trésor Public)
```

---

## 5. Lignes budgétaires et rubriques mappées configurables

L'onglet **Lignes** détaille l'arborescence budgétaire :
- Découpage normalisé : **Chapitre > Fonction (ex. 020 Administration générale) > Nature comptable > Service gestionnaire**.
- **Moteur de rubriques mappées** : outil d'administration permettant de configurer des vues sur-mesure reliant des tables SQL complexes (jointures SEDIT/Oracle) sous forme de tableaux clairs et exportables sans compétences de développement.

---

## 6. Suivi des engagements et des bons de commande (SEDIT)

L'onglet **Engagements** assure le lien direct avec le système comptable central SEDIT :

- **Engagements sans bon de commande** : alerte prioritaire signalant des enveloppes réservées pour lesquelles aucun bon de commande officiel n'a encore été transmis au titulaire du marché.
- **Statut des engagements** :
  - *Partiellement mandaté* : bon de commande en cours avec livraisons échelonnées.
  - *Soldé* : commande entièrement livrée, facturée et clôturée.
- Détail d'un engagement : libellé de l'objet, montant voté initial, réajustements, montant restant à engager.

### 6.1 Onglet Commandes — enrichissements Sedit

La liste des **Commandes** est interrogée en direct depuis Sedit Finances (Oracle) :

- **Nature** et **Fonction** (nomenclature M57) : calculées sur les lignes d'imputation de la commande. Si toutes les lignes partagent la même valeur, elle est affichée (ex. `020` pour la fonction, `65818` pour la nature) ; si la commande est multiligne et hétérogène, la cellule affiche **Multi** avec une infobulle listant tous les codes.
- **Pastille FAC** : résume l'état de la ou des facture(s) rattachée(s) à la commande (*Reçue*, *Service fait*, *Mandatée*, *Refusée*). Cliquer dessus ouvre la ou les factures correspondantes dans la visionneuse de pièces jointes Sedit.
- **Bouton PJ** : ouvre le bon de commande (pièces jointes Sedit).
- **Associations** : chaque commande peut être rattachée à une **opération** budgétaire et à un **logiciel métier** (MagApp) ; l'association est conservée et affichée dans la ligne.

---

## 7. Factures et circuit de visa du Service Fait

L'onglet **Factures** interroge directement Sedit Finances (Oracle), sans copie locale. Le filtre **À traiter** ne retient que les factures dont le service fait n'est pas encore attesté dans Sedit et qui ne sont pas rejetées.

### 7.1 Le service fait

Avant qu'une facture ne soit payée, la réglementation impose de certifier que la prestation ou le matériel a bien été livré conformément au bon de commande.

- **Pastille Service Fait** : chaque facture porte une pastille compacte résumant son état (service fait attesté dans Sedit, rapprochement RA, refus, ou statut du circuit AppDSI). Cliquer dessus ouvre le **circuit de validation**.
- **Lancer une validation** : le circuit AppDSI envoie au **vérificateur** choisi (agent DSI) un e-mail avec un lien de validation ; le vérificateur consulte les pièces jointes Sedit de la facture puis rend sa décision (validé, validé avec réserves, non validé, retourné, transféré, en pause).
- **Déclaration directe** : le déclarant peut attester lui-même le service fait (sans circuit), avec commentaire et pièce justificative obligatoires.
- **Directeur (informé / avec visa)** : au lancement, le directeur de la direction concernée — résolu automatiquement depuis le référentiel des **encadrants** (un directeur par direction, `/admin/param-ville`) — peut être :
  - **Aucun** *(défaut)* : ni informé, ni sollicité ;
  - **Informé** : il reçoit un e-mail au moment de la décision (validée ou non) ;
  - **Avec visa** : il doit viser **après** le valideur principal ; la certification dans Sedit n'a lieu qu'après son visa, et les **deux valideurs** sont embarqués dans le PV scellé.
- **PV scellé et écriture Sedit** : à la certification, AppDSI valide l'étape `SERVICE_FAIT` dans Sedit (écriture journalisée et réversible) et y pousse un **procès-verbal scellé** (signature PAdES, AC interne) reprenant les documents sources et les validateurs, en pièce jointe de la facture.
- **Liens publics** : le vérificateur reçoit un lien tokenisé (`/service-fait-verifier/:token`) ; en mode visa, le directeur reçoit un lien dédié (`/service-fait-visa/:token`).

### 7.2 Pièces jointes Sedit

La **visionneuse multidocuments** affiche les pièces jointes Sedit (facture PDF, bon de commande, XML…) d'une facture ou d'un bon de commande.

---

## 8. Référentiel des Tiers et Fournisseurs (`/tiers`)

La page `/tiers` interroge en lecture directe la base centrale des fournisseurs Oracle :

- **Fiche fournisseur complète** : Raison sociale, code tiers interne, numéro SIRET, adresse postale, code NAF/APE, nature juridique.
- **Carnet de contacts locaux** : gestionnaire de compte commercial, technicien support dédié, adresse e-mail d'envoi des commandes.
- **Historique financier avec le fournisseur** : liste exhaustive des marchés, commandes et factures payées à ce tiers sur les 5 dernières années.

---

## 9. Préparation budgétaire de l'exercice N+1

L'onglet **Préparation** pilote la phase amont de co-construction du budget prévisionnel :

- **Import de la proposition budgétaire** : chargement de la matrice Excel fournie par la Direction des Finances.
- **Comparaison N vs N+1** : analyse des écarts ligne par ligne (reconductions automatiques des contrats, augmentations de tarifs, suppressions de lignes obsolètes).
- **Rattachement automatique des contrats** : intégration directe des prévisions issues du module Contrats pour les marchés pluriannuels.
- **Cas particulier Télécom (Nature 6262)** : calcul de l'atterrissage prévisionnel basé sur la moyenne glissante des facturations réelles du module Télécom.

---

## 10. Interactions avec les autres modules du Hub

| Module | Rôle dans l'écosystème budgétaire |
|---|---|
| **Contrats** (`/contrats`) | Rapprochement des bons de commande SEDIT avec les marchés pluriannuels. |
| **Stocks** (`/stocks`) | Rapprochement des réceptions matérielles avec les bons de commande pour attestation de livraison. |
| **Télécom** (`/telecom`) | Rapprochement en direct des factures d'abonnements et de consommations. |
| **Consommables** (`/consommables`) | Consolidation des dépenses groupées d'impression. |
| **Rencontres Budgétaires** (`/rencontres-budgetaires`) | Les demandes arbitrées favorablement alimentent la préparation budgétaire N+1. |

---

## 11. Règles de bonne gestion et calendrier financier

- 💡 **Règle d'or de l'engagement préalable** : Aucun matériel ne doit être commandé verbalement à un fournisseur sans qu'un bon de commande officiel SEDIT n'ait été préalablement validé et signé.
- 💡 **Rythme d'engagement** : Visez un taux d'engagement de **50% fin mai** et de **80% fin septembre** pour éviter l'engorgement des services comptables lors de la clôture annuelle de novembre/décembre.
- ⚠️ **Service Fait rapide** : Visez un délai de visa du Service Fait inférieur à **4 jours** suivant la livraison pour respecter le délai global de paiement légal (30 jours) et éviter les intérêts moratoires.
