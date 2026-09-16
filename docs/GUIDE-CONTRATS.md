# Guide opérationnel — Module Contrats (`/contrats`)

> Documentation fonctionnelle et opérationnelle à l'usage des **responsables de marchés, chefs de projets DSI, gestionnaires financiers et administrateurs**.
> Ce guide détaille le suivi des contrats de maintenance logicielle, d'infogérance, de télécom et de prestations, l'analyse des niveaux de service (SLA), la trajectoire budgétaire pluriannuelle et l'analyse contractuelle par intelligence artificielle.

---

## Sommaire

1. [Accès et habilitations](#1-accès-et-habilitations)
2. [Vue d'ensemble du registre des contrats](#2-vue-densemble-du-registre-des-contrats)
3. [Fiche contrat détaillée et cycle de vie](#3-fiche-contrat-détaillée-et-cycle-de-vie)
4. [Engagements financiers pluriannuels et prévisions](#4-engagements-financiers-pluriannuels-et-prévisions)
5. [Niveaux de service (SLA) et pénalités](#5-niveaux-de-service-sla-et-pénalités)
6. [Gestion documentaire et pièces contractuelles](#6-gestion-documentaire-et-pièces-contractuelles)
7. [Rapprochement avec les commandes budgétaires (SEDIT / Oracle)](#7-rapprochement-avec-les-commandes-budgétaires-sedit--oracle)
8. [Renouvellements, reconductions et alertes d'échéance](#8-renouvellements-reconductions-et-alertes-déchéance)
9. [Analyses contractuelles par IA (`/contrats/analyses-ia`)](#9-analyses-contractuelles-par-ia-contratsanalyses-ia)
10. [Imports, exports et vues personnalisées](#10-imports-exports-et-vues-personnalisées)
11. [Interactions avec les autres modules du Hub](#11-interactions-avec-les-autres-modules-du-hub)
12. [Bonnes pratiques et recommandations](#12-bonnes-pratiques-et-recommandations)

---

## 1. Accès et habilitations

### 1.1 Points d'accès
- **Menu principal / Tuile Hub** : `/contrats`
- **Analyse IA des contrats** : `/contrats/analyses-ia`

### 1.2 Profils d'accès

| Profil | Droits sur le module |
|---|---|
| **Utilisateur connecté / DSI** | Consultation des contrats actifs, recherche, lecture des fiches et des pièces jointes, export. |
| **Gestionnaire Contrats / Finances** (Rôle `admin`, `superadmin` ou rôle délégué `contrats`) | Création, modification complète de tous les champs, téléversement de documents, changement de statut de renouvellement, archivage, liaison de bons de commande, imports Excel. |

---

## 2. Vue d'ensemble du registre des contrats

L'écran principal propose une grille de données haute performance personnalisable :

### 2.1 Cartes d'indicateurs et alertes rapides
En haut de page, trois compteurs clés permettent un audit visuel immédiat :
- 🔴 **Contrats expirés** : contrats dont la date de fin est dépassée mais dont le statut n'est pas archivé ou renouvelé (clic pour filtrer).
- 🟠 **Échéances ≤ 90 jours** : contrats arrivant à leur terme dans les 3 mois (reconduction tacite ou dénonciation à préparer).
- 🔵 **Engagements de l'année en cours** : ratio entre les contrats pour lesquels un bon de commande a déjà été émis et ceux en attente d'engagement.

### 2.2 Outils de filtrage et de recherche
- **Recherche plein texte instantanée** : sur l'objet du contrat, le nom du fournisseur (tiers), le numéro de marché ou le libellé de l'application liée.
- **Filtres à facettes** : par Direction/Service pilote, par Type de contrat (Maintenance logicielle, Infogérance, Assistance technique, Licence SaaS, Télécom, Matériel), par Nature comptable M57, par Statut (Actif, Archivé).
- **Gestion des colonnes** : sélection des champs affichés (plus de 35 colonnes disponibles) et réorganisation par glisser-déposer.
- **Vues sauvegardées (Favoris / Bookmarks)** : enregistrement de combinaisons de filtres et de colonnes favorites (ex. *« Mes contrats Direction Éducation »*, *« Contrats à renouveler cette année »*).

---

## 3. Fiche contrat détaillée et cycle de vie

Chaque contrat centralise l'ensemble des informations administratives, juridiques et techniques :

### 3.1 Bloc Identification & Acteurs
- **Numéro interne / Numéro de marché** : référence administrative de la commande publique.
- **Objet du marché** : description claire de la prestation ou de la licence.
- **Titulaire / Tiers** : lien direct avec le référentiel des tiers fournisseurs Oracle (raison sociale, code SIRET, contact commercial).
- **Application liée** : rattachement à l'application du Magasin d'applications (`magapp_apps`) permettant de savoir immédiatement quel contrat couvre quel logiciel métier.
- **Pilote DSI & Service métier** : chef de projet en charge du suivi opérationnel et direction bénéficiaire.

### 3.2 Dates clés et mécanisme de reconduction
- **Date d'effet (début)** et **Durée initiale** (en années ou mois).
- **Nombre de reconductions possibles** (ex. 1 an renouvelable 3 fois, soit 4 ans au total).
- **Date de fin de la période en cours** : date d'anniversaire prochaine.
- **Date de fin maximale** : date butoir absolue au-delà de laquelle le marché doit impérativement être remis en concurrence.
- **Délai de préavis de dénonciation** : généralement 2 à 3 mois avant la date anniversaire.

---

## 4. Engagements financiers pluriannuels et prévisions

Le module offre une visibilité financière complète sur un cycle de 8 ans :

- **Historique des réalisations** : montants TTC facturés pour les années passées (ex. 2022 à 2025).
- **Montant de l'année en cours** : budget voté et réservé pour l'exercice.
- **Prévisions pluriennes (N+1 à N+3)** : projection des coûts prévisionnels pour alimenter la préparation budgétaire de la collectivité.
- **Indice de révision de prix** : formule contractuelle de révision (ex. *Syntec*, *ICHTrev-TS*, *TP01*) et date de dernière révision appliquée.

---

## 5. Niveaux de service (SLA) et pénalités

Le suivi de la qualité de service rend le contrat exploitable par les techniciens du support :

- **Plage de garantie** : horaires de couverture (ex. *5j/7 8h-18h*, *24h/24 7j/7*).
- **GTI (Garantie de Temps d'Intervention)** : délai maximum contractuel avant la prise en compte d'un incident bloquant (ex. *2 heures*).
- **GTR (Garantie de Temps de Rétablissement)** : délai maximum pour remettre le service en état opérationnel (ex. *4 heures*).
- **Pénalités applicables** : montant ou pourcentage forfaitaire par heure ou jour de retard en cas de non-respect des engagements.

---

## 6. Gestion documentaire et pièces contractuelles

Tous les documents sont centralisés, versionnés et sécurisés :

- **Document principal** : acte d'engagement (AE), cahier des clauses techniques particulières (CCTP) ou convention signée (accessible en un clic pour téléchargement direct).
- **Pièces jointes complémentaires** : avenants, bordereau de prix unitaires (BPU), procès-verbaux de recette, fiches de révision de prix, courriers de reconduction expresse.
- **Stockage et GED** : les fichiers déposés sont enregistrés dans le stockage unifié et référencés dans la GED centrale (`hub_docs`), garantissant leur conservation et leur traçabilité.

---

## 7. Rapprochement avec les commandes budgétaires (SEDIT / Oracle)

Le module établit le pont entre l'engagement contractuel juridique et l'engagement comptable :

- **Liaison automatique ou manuelle** : association d'un ou plusieurs numéros de bons de commande SEDIT au contrat.
- **Visualisation de l'état d'engagement** : pastille colorée indiquant si le bon de commande de l'année en cours a été généré, envoyé au fournisseur et rapproché avec la facture.
- **Contrôle budgétaire** : détection des écarts entre le montant prévu au contrat et le montant effectivement consommé sur les commandes.

---

## 8. Renouvellements, reconductions et alertes d'échéance

Le workflow de renouvellement évite les ruptures de service ou les reconductions non souhaitées :

- **Statuts de renouvellement** :
  - `A renouveler` : marché arrivant à son terme maximum, nécessitant la rédaction d'un nouveau DCE.
  - `En cours de consultation` : procédure d'appel d'offres ou de MAPA en cours auprès de la commande publique.
  - `Reconduit` : reconduction annuelle validée et notifiée au prestataire.
  - `Non reconduit / Résilié` : arrêt du contrat avec motif documenté.
- **Contrat successeur** : possibilité de chaîner le nouveau contrat avec l'ancien pour conserver l'historique sans rupture de continuité.

---

## 9. Analyses contractuelles par IA (`/contrats/analyses-ia`)

L'onglet d'analyse par intelligence artificielle automatise la lecture des contrats volumineux (PDF de plusieurs dizaines de pages) :

### 9.1 Fonctionnalités IA
1. **Extraction automatique des clauses critiques** : identification instantanée de l'objet réel, des dates d'effet et d'échéance, des modalités de résiliation et des préavis.
2. **Détection des SLA et pénalités** : repérage automatique des engagements d'intervention et de rétablissement ainsi que du barème de pénalités.
3. **Analyse des risques et obligations réciproques** : synthèse des contraintes incombant à la collectivité (ex. *fourniture d'accès, sauvegardes préalables, clauses d'exclusivité*).
4. **Fiche de synthèse exécutif** : génération d'un mémo prêt à l'emploi pour les directeurs et techniciens.

---

## 10. Imports, exports et vues personnalisées

- **Import Excel initial et mises à jour de masse** : téléversement d'un classeur Excel formaté pour insérer ou mettre à jour des dizaines de contrats simultanément.
- **Export Excel complet** : export en un clic de la vue courante ou de la totalité du référentiel pour les revues budgétaires avec la Direction Générale et les Finances.

---

## 11. Interactions avec les autres modules du Hub

| Module | Nature de la dépendance |
|---|---|
| **Budget & Finances** (`/budget`) | Partage des lignes budgétaires, rapprochement des bons de commande SEDIT et contrôle du réalisé. |
| **Magasin d'applications** (`/admin/magapp`) | Rapprochement contrat ↔ fiche application : indique le prestataire support et le coût annuel d'une application. |
| **Tiers / Fournisseurs** (`/tiers`) | Interrogation directe du référentiel fournisseurs Oracle pour garantir l'exactitude des raisons sociales et des SIRET. |
| **Préparation budgétaire** (`/budget` > Préparation) | Les montants prévisionnels des contrats alimentent automatiquement la proposition budgétaire N+1. |
| **Tableau de bord DSI** (`/dsi-dashboard`) | Alimentation du widget d'alertes des contrats à échéance et du montant annuel engagé. |

---

## 12. Bonnes pratiques et recommandations

- 💡 **Anticipation des marchés (J-6 mois)** : Pour tout contrat arrivant à sa date de fin maximale, lancez la concertation avec le service Achats/Marchés au moins 6 mois avant l'échéance.
- 💡 **Numérisation systématique** : Déposez toujours l'Acte d'Engagement signé numériquement dans le document principal dès réception de la notification de marché.
- ⚠️ **Dénonciation expresse** : Si un contrat comporte une clause de reconduction tacite et que la DSI souhaite y mettre fin, veillez à envoyer la lettre recommandée avec AR en respectant scrupuleusement le préavis contractuel.
