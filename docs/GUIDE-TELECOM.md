# Guide opérationnel — Module Télécom (`/telecom`)

> Documentation fonctionnelle et financière à l'usage des **gestionnaires télécom, acheteurs, techniciens réseaux et contrôleurs de gestion**.
> Ce guide détaille le pilotage global des dépenses de télécommunication : téléphonie fixe, flotte mobile, liens data/Internet, rapprochement automatisé avec la comptabilité Oracle, extinction du cuivre et chasse aux coûts inutiles (lignes dormantes, facturations indues).

---

## Sommaire

1. [Accès et missions du module](#1-accès-et-missions-du-module)
2. [Vue d'ensemble et architecture financière](#2-vue-densemble-et-architecture-financière)
3. [Opérateurs et comptes de facturation](#3-opérateurs-et-comptes-de-facturation)
4. [Rapprochement des factures avec le budget Oracle (Nature 6262)](#4-rapprochement-des-factures-avec-le-budget-oracle-nature-6262)
5. [Inventaire des lignes fixes et plan de fin du cuivre](#5-inventaire-des-lignes-fixes-et-plan-de-fin-du-cuivre)
6. [Flotte mobile et imports SFR Business](#6-flotte-mobile-et-imports-sfr-business)
7. [Détection des lignes dormantes et anomalies de facturation](#7-détection-des-lignes-dormantes-et-anomalies-de-facturation)
8. [Tendance sur 13 mois et tableaux de bord de synthèse](#8-tendance-sur-13-mois-et-tableaux-de-bord-de-synthèse)
9. [Gestion des duplicatas de factures PDF](#9-gestion-des-duplicatas-de-factures-pdf)
10. [Interactions avec les autres modules du Hub DSI](#10-interactions-avec-les-autres-modules-du-hub-dsi)
11. [Guide de contrôle mensuel et bonnes pratiques](#11-guide-de-contrôle-mensuel-et-bonnes-pratiques)

---

## 1. Accès et missions du module

### 1.1 Points d'accès
Le module est accessible depuis le menu principal via la route `/telecom`.

### 1.2 Enjeux opérationnels
Le module Télécom répond à un triple impératif :
1. **Contrôle budgétaire strict** : s'assurer que chaque euro facturé par les opérateurs (Orange, SFR, Linkt, Free, etc.) correspond à un service réellement commandé et actif.
2. **Gestion de l'obsolescence technologique** : piloter la fermeture du réseau cuivre historique d'Orange (arrêt du RTC et de l'ADSL) et la migration vers la fibre optique FTTH/FTTO.
3. **Optimisation des coûts** : identifier les abonnements mobiles et lignes fixes payés inutilement (postes vacants, sites fermés, forfaits inadaptés).

---

## 2. Vue d'ensemble et architecture financière

L'interface s'articule autour de 7 onglets spécialisés :

- **Synthèse des coûts** : vision consolidée de la dépense mensuelle et annuelle (Fixe vs Mobile vs Liens data).
- **Rapprochement factures** : vérification et liaison des factures réelles issues d'Oracle.
- **Lignes fixes & Liens Internet** : référentiel des numéros NDI/MID et des liaisons inter-sites.
- **Flotte mobile** : analyse fine des consommations (voix, données, hors-forfait, roaming).
- **Audit & Anomalies** : moteur de réconciliation croisant facturation et inventaire physique.
- **Duplicatas PDF** : coffre-fort des factures électroniques détaillées.
- **Comptes & Opérateurs** : paramétrage des comptes clients et rattachement aux tiers comptables.

---

## 3. Opérateurs et comptes de facturation

Les abonnements télécoms sont structurés par comptes de facturation rattachés aux tiers officiels :

- **Opérateurs référencés** : chaque opérateur est lié à une fiche fournisseur du référentiel Tiers Oracle (`gf_oracle_tiers`) via son code comptable et son SIRET.
- **Comptes de facturation** : identifiant du compte client chez l'opérateur, désignation (ex. *« Flotte mobile Mairie »*, *« Accès Internet Écoles »*, *« Téléphonie Centre Technique »*), code fonction et numéro de marché associé.
- **Engagements budgétaires** : association du numéro d'engagement de dépense annuelle Oracle pour suivre la consommation des crédits votés.

---

## 4. Rapprochement des factures avec le budget Oracle (Nature 6262)

Ce mécanisme exclusif supprime la double saisie entre la DSI et la Direction des Finances :

### 4.1 Fonctionnement du rapprochement
1. Le système interroge en temps réel les factures saisies dans le progiciel financier Oracle sous la nature comptable **6262 (Frais de télécommunications)**.
2. Le moteur suggère automatiquement les factures correspondant à chaque compte de facturation en croisant le code tiers, les montants et les libellés de période.
3. **Rattachement en 1 clic** : le gestionnaire valide la correspondance. Le montant HT, le montant TTC et les dates sont instantanément synchronisés.
4. **Rejet motivé définitif** : si une facture présente une anomalie (erreur de tarification, frais d'itinérance injustifiés), le gestionnaire peut la marquer comme rejetée avec un commentaire obligatoire. Elle est alors sortie du circuit et signalée aux Finances pour mise en attente du paiement.

---

## 5. Inventaire des lignes fixes et plan de fin du cuivre

L'onglet des lignes fixes inventorie chaque point de coupure téléphonique et accès Internet :

### 5.1 Fiche d'une ligne fixe
- **Numéro d'appel / NDI** : numéro de tête de ligne ou numéro d'identification technique de la paire de cuivre.
- **Usage de la ligne** : Téléphonie usager, Ligne d'ascenseur (téléalarme prioritaire), Alarme anti-intrusion / vidéo, Ligne de secours, Liaison modem/SDSL.
- **Site et localisation** : bâtiment municipal, étage, bureau, local technique répartiteurs.
- **Statut opérationnel** :
  - `En service` : ligne active et utilisée.
  - `Résiliation demandée` : demande envoyée à l'opérateur avec accusé de réception en attente.
  - `Résiliée` : ligne coupée administrativement et techniquement.
  - `À migrer cuivre` : alerte rouge indiquant une ligne cuivre devant être basculée vers la fibre ou la 4G avant l'extinction de la plaque Orange locale.

---

## 6. Flotte mobile et imports SFR Business

Le traitement des consommations mobiles est entièrement automatisé grâce à l'import des relevés d'opérateur :

### 6.1 Processus d'importation
1. Téléversement du fichier compressé ZIP mis à disposition mensuellement sur le portail SFR Business.
2. Le parseur extrait simultanément :
   - Le fichier de **synthèse globale** (facturation du mois par compte).
   - Le fichier de **détail par ligne** (numéro d'appel, titulaire, IMEI, volume data consommé, communications hors-forfait).
   - L'historique glissant sur 13 mois.
3. Les données remplacent de façon sécurisée les enregistrements de la période correspondante sans altérer l'historique antérieur.

---

## 7. Détection des lignes dormantes et anomalies de facturation

Le module calcule automatiquement les indicateurs d'optimisation budgétaire :

### 7.1 Lignes dormantes (*Ghost lines*)
- **Critère de détection** : ligne mobile ou fixe pour laquelle la collectivité paie un abonnement mensuel alors qu'aucune communication, aucun SMS et aucun Mo de données n'ont été consommés sur les 3 derniers mois glissants.
- **Impact financier** : affichage du coût annuel cumulé de ces lignes dormantes.
- **Action corrective** : proposition de suspension immédiate de la SIM ou de réattribution à un agent nouvellement arrivé.

### 7.2 Anomalies de facturation croisée
- **Lignes résiliées encore facturées** : alerte critique lorsqu'un prélèvement continue sur une ligne dont la date de résiliation effective est dépassée.
- **Lignes hors inventaire** : détection de numéros apparaissant sur la facture opérateur mais inconnus dans le référentiel DSI (risque de détournement ou d'oubli de rattachement).
- **Lignes actives non facturées** : signalement préventif pour éviter les régularisations rétroactives massives.

---

## 8. Tendance sur 13 mois et tableaux de bord de synthèse

- **Évolution mensuelle des dépenses** : graphiques interactifs en barres empilées décomposant la facture mensuelle en Forfaits fixes, Abonnements mobiles, Liaisons de données et Frais hors-forfait / numéros spéciaux.
- **Top 15 des lignes mobiles les plus coûteuses** : identification des agents en dépassement régulier (déplacements à l'étranger, data intensive) pour ajustement de leur formule de forfait.
- **Projection budgétaire annuelle** : estimation de l'atterrissage financier en fin d'exercice basée sur la moyenne glissante des dépenses réelles.

---

## 9. Gestion des duplicatas de factures PDF

- Les fichiers PDF des factures détaillées peuvent être téléversés ou rattachés automatiquement.
- Ils sont enregistrés dans le service unifié de stockage (`/storage/telecom`) et indexés dans la GED (`hub_docs`).
- Les gestionnaires peuvent ainsi télécharger la facture officielle d'un clic lors des audits de la Chambre Régionale des Comptes ou du Trésor Public.

---

## 10. Interactions avec les autres modules du Hub DSI

| Module lié | Nature de la synchronisation |
|---|---|
| **Budget & Finances** (`/budget`) | Partage des engagements et factures Oracle sur la nature 6262. |
| **Tiers / Fournisseurs** (`/tiers`) | Référentiel des prestataires télécoms (codes tiers, raisons sociales). |
| **Parc & Mobilité** (`/parc` > Lignes) | Réconciliation automatique des numéros d'appel avec les cartes SIM et téléphones attribués aux agents. |
| **GED & Documents** (`/documents`) | Archivage sécurisé des factures électroniques et des courriers de résiliation. |
| **Réseau Ville** (`/reseau`) | Suivi de l'infrastructure physique des accès Internet et liens opérateurs reliant les bâtiments municipaux. |

---

## 11. Guide de contrôle mensuel et bonnes pratiques

- 💡 **Contrôle mensuel systématique** : Dès notification de mise à disposition des factures par l'opérateur (vers le 5 du mois), lancez l'import du ZIP et effectuez le rapprochement Oracle.
- 💡 **Lignes d'ascenseurs** : Ne résiliez jamais une ligne sans avoir vérifié auprès du service Bâtiments qu'un boîtier de téléalarme GSM de substitution a été préalablement posé dans la cabine.
- ⚠️ **Courriers de résiliation** : Pour toute demande de résiliation, exigez de l'opérateur un accusé de réception formel avec date de coupure technique et conservez-le dans la GED.
