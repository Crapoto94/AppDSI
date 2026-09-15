# Guide opérationnel — Rencontres Budgétaires (`/rencontres-budgetaires`)

> Documentation fonctionnelle et méthodologique à l'usage des **directeurs de pôles, chefs de services métiers, responsables DSI et gestionnaires financiers**.
> Ce guide détaille le processus annuel d'expression des besoins informatiques des directions, l'organisation des réunions de concertation, les arbitrages budgétaires et la transformation des demandes validées en projets ou tickets de déploiement.

---

## Sommaire

1. [Objectif et calendrier des rencontres budgétaires](#1-objectif-et-calendrier-des-rencontres-budgétaires)
2. [Accès, profils et périmètre par direction](#2-accès-profils-et-périmètre-par-direction)
3. [Recueil et typologie des demandes métiers](#3-recueil-et-typologie-des-demandes-métiers)
4. [Organisation des réunions de concertation](#4-organisation-des-réunions-de-concertation)
5. [Diffusion des comptes-rendus et traçabilité des décisions](#5-diffusion-des-comptes-rendus-et-traçabilité-des-décisions)
6. [Arbitrage budgétaire et priorisation](#6-arbitrage-budgétaire-et-priorisation)
7. [Transformation en projets ou tickets techniques](#7-transformation-en-projets-ou-tickets-techniques)
8. [Importation de masse (Excel / CSV)](#8-importation-de-masse-excel--csv)
9. [Paramétrage des correspondants et e-mails de direction](#9-paramétrage-des-correspondants-et-e-mails-de-direction)
10. [Interactions avec les autres modules du Hub DSI](#10-interactions-avec-les-autres-modules-du-hub-dsi)
11. [Bonnes pratiques pour les chefs de projet DSI](#11-bonnes-pratiques-pour-les-chefs-de-projet-dsi)

---

## 1. Objectif et calendrier des rencontres budgétaires

Les « Rencontres Budgétaires » constituent le rendez-vous annuel stratégique entre la DSI et chacune des directions métiers de la Ville (Petite Enfance, Éducation, Culture, Sports, Urbanisme, Services Techniques, Police Municipale, Finances, RH).

### 1.1 Objectifs clés
- **Anticiper les investissements numériques** pour l'année N+1 (renouvellement de progiciels, équipements de nouveaux sites, acquisition de matériels spécifiques).
- **Cadrer la faisabilité technique et calendaire** : vérifier la bande passante de l'équipe DSI et l'adéquation avec le schéma directeur des systèmes d'information (SDSI).
- **Formaliser les arbitrages** de la Direction Générale avant la phase de vote du budget primitif (BP).

---

## 2. Accès, profils et périmètre par direction

### 2.1 Accès au module
- **URL** : `/rencontres-budgetaires` (accessible également via un jeton sécurisé dans les liens reçus par mail pour les participants extérieurs).

### 2.2 Scoping et visibilité
Pour préserver la confidentialité des arbitrages entre directions :
- **Responsables de direction métier** : visibilité restreinte aux demandes et réunions concernant leur propre direction.
- **Chefs de projets DSI** : visibilité sur les directions dont ils sont le référent désigné.
- **Direction DSI et Administrateurs** : vue panoramique sur l'ensemble des directions de la collectivité.

---

## 3. Recueil et typologie des demandes métiers

Chaque besoin exprimé par une direction fait l'objet d'une fiche normalisée :

### 3.1 Informations requises
- **Direction et Service demandeur**.
- **Titre de la demande et descriptif circonstancié** des objectifs attendus.
- **Typologie du besoin** :
  - *Incident / Correctif lourd* : obsolescence matérielle ou problème structurel récurrent.
  - *Évolution / Demande de service* : acquisition de licences supplémentaires, nouveaux modules logiciels.
  - *Projet numérique stratégique* : déploiement d'un nouveau progiciel métier, dématérialisation d'une téléprocédure usager.
  - *Autre / Renouvellement matériel*.
- **Estimation financière initiale (€ TTC)** : devis indicatif ou budget estimé.
- **Responsable DSI référent** : chef de projet accompagnant la direction dans l'instruction.

---

## 4. Organisation des réunions de concertation

Le module pilote l'ensemble de la logistique de chaque séance de concertation :

### 4.1 Planification et participants
- **Calendrier des réunions** : date, heure, durée, lieu physique ou visioconférence Teams.
- **Gestion des participants** :
  - Sélection des participants métier et DSI connectés à l'annuaire Active Directory.
  - Badge de présence en direct (*Présent*, *Absent*, *En congé*) via la synchronisation RH Studio.
  - Suivi des statuts d'invitation : *Présent*, *Excusé*, *Suppléant*.
- **Synchronisation Outlook / Teams** : envoi automatique des convocations avec ordre du jour structuré et lien de visio directement intégré dans les agendas des participants.

---

## 5. Diffusion des comptes-rendus et traçabilité des décisions

À l'issue de chaque rencontre :

- **Rédaction du compte-rendu** : synthèse des débats, opportunités, risques et pré-requis techniques.
- **Pièces jointes associées** : intégration des présentations diaporama, devis fournisseurs ou fiches d'expression de besoins (archivées en GED).
- **Diffusion par e-mail en un clic** : envoi formaté à tous les participants et aux directeurs de pôles avec pièce jointe PDF du relevé de décisions.
- **Lien de consultation sécurisé** : les destinataires peuvent relire le compte-rendu en ligne sans avoir besoin de compte d'administration sur le Hub.

---

## 6. Arbitrage budgétaire et priorisation

La phase d'arbitrage fixe le sort de chaque demande pour la construction budgétaire :

### 6.1 Statuts d'arbitrage
- 🟢 **Validé / Retenu** : la dépense est inscrite au budget prévisionnel N+1 de la DSI ou de la direction métier.
- 🟡 **Ajourné / Reporté** : demande jugée pertinente mais reportée à l'exercice N+2 par manque de crédits ou en attente d'un prérequis technique.
- 🔴 **Refusé** : demande non conforme à la politique de sécurité, incompatible avec le SI ou non prioritaire (avec justification écrite obligatoire).
- ⚪ **En attente d'instruction** : compléments d'information requis auprès du fournisseur ou de la direction.

---

## 7. Transformation en projets ou tickets techniques

Dès lors qu'une demande budgétaire est arbitrée favorablement :

- **Bascule vers le Portefeuille Projets** : pour les demandes complexes, un bouton dédié permet d'initialiser immédiatement une fiche projet dans le module `/portefeuille-projets`, reprenant le titre, le coût voté et le chef de projet.
- **Création de ticket de déploiement** : pour les acquisitions simples de matériel ou de logiciels, création d'un ticket assigné au support technique dans `/tickets`.
- **Suivi des actions (`rencontres_suivi`)** : liste des tâches intermédiaires assignées aux agents avec échéances (alimentant automatiquement l'écran *Mes tâches* de chaque collaborateur).

---

## 8. Importation de masse (Excel / CSV)

Pour les périodes d'initialisation de campagne budgétaire :

- **Bouton « Importer Excel »** : permet de charger le fichier consolidé de la Direction des Finances (`Demandes Directions.xlsx` ou `.csv`).
- **Analyse et déduplication** : reconnaissance automatique des colonnes Direction, Date, Description, Montant TTC, Arbitrage et Responsable DSI.
- Intégration en masse avec passage au statut initial `importée`.

---

## 9. Paramétrage des correspondants et e-mails de direction

La modale **« Emails par direction »** permet d'administrer la cartographie des contacts :
- Définition des listes de diffusion ou des adresses directes des directeurs et référents budgétaires par pôle.
- Garantie que les convocations et comptes-rendus parviennent systématiquement aux bons interlocuteurs institutionnels.

---

## 10. Interactions avec les autres modules du Hub DSI

| Module | Nature de la passerelle |
|---|---|
| **Portefeuille Projets** (`/portefeuille-projets`) | Transformation directe d'une demande budgétaire retenue en projet structuré. |
| **Tickets & Support** (`/tickets`) | Création de tickets de mise en œuvre pour les demandes d'équipements validées. |
| **Mes Tâches** (`/mes-taches`) | Récupération automatique des actions de suivi issues des réunions budgétaires. |
| **Budget & Finances** (`/budget`) | Alimentation de la phase de préparation budgétaire avec les montants validés. |
| **Active Directory & RH** | Sélection des agents et affichage de leur présence opérationnelle le jour de la réunion. |

---

## 11. Bonnes pratiques pour les chefs de projet DSI

- 💡 **Chiffrage exhaustif** : N'oubliez pas d'inclure dans le coût TTC estimé les frais annexes : formation des utilisateurs, maintenance de première année, prestations d'intégration et éventuelles extensions de garantie.
- 💡 **Clôture rapide du compte-rendu** : Diffusez le relevé de décisions dans les 48 heures suivant la réunion pour éviter tout malentendu sur les engagements pris.
- ⚠️ **Traçabilité des arbitrages** : Ne modifiez jamais un arbitrage verbalement sans consigner le motif de la décision dans le champ commentaire du module.
