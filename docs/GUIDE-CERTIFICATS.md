# Guide opérationnel — Module Certificats Électroniques (`/certif`)

> Documentation fonctionnelle et opérationnelle à l'usage des **administrateurs de sécurité, référents de dématérialisation, gestionnaires de clés et techniciens support**.
> Ce guide détaille le cycle de vie complet des certificats électroniques municipaux : import et analyse automatisée des PDF de commande, calcul des dates d'échéance, alertes préventives d'expiration, gestion des usages réglementaires et renouvellements.

---

## Sommaire

1. [Enjeux et périmètre des certificats électroniques](#1-enjeux-et-périmètre-des-certificats-électroniques)
2. [Vue d'ensemble et alertes d'expiration (`/certif`)](#2-vue-densemble-et-alertes-dexpiration-certif)
3. [Importation automatisée par lecture de PDF](#3-importation-automatisée-par-lecture-de-pdf)
4. [Téléversement par lot (*Batch upload*) et import Excel](#4-téléversement-par-lot-batch-upload-et-import-excel)
5. [Fiche certificat détaillée et métadonnées](#5-fiche-certificat-détaillée-et-métadonnées)
6. [Usages réglementaires et rattachement administratif](#6-usages-réglementaires-et-rattachement-administratif)
7. [Processus de renouvellement et suivi](#7-processus-de-renouvellement-et-suivi)
8. [Gestion des révocations et pertes de clés physiques](#8-gestion-des-révocations-et-pertes-de-clés-physiques)
9. [Liaison comptable avec le progiciel financier (SEDIT)](#9-liaison-comptable-avec-le-progiciel-financier-sedit)
10. [Interactions avec les autres modules du Hub](#10-interactions-avec-les-autres-modules-du-hub)
11. [Règles de sécurité et bonnes pratiques](#11-règles-de-sécurité-et-bonnes-pratiques)

---

## 1. Enjeux et périmètre des certificats électroniques

Les certificats électroniques (clés USB cryptographiques, tokens logiciels ou certificats serveurs) sont les garants juridiques des téléprocédures de la collectivité :
- **Télétransmission en préfecture (Application ACTES)** : contrôle de légalité des délibérations et arrêtés municipaux.
- **Télétransmission comptable (HELIOS / PES V2)** : mandatement et ordonnancement de la paie et des factures vers le Trésor Public.
- **Plateforme de marchés publics** : signature électronique des procès-verbaux de CAO et des actes d'engagement.
- **Parapheur électronique & État Civil** : signature des actes de naissance, mariage et décès par les officiers d'état civil.
- **Certificats SSL/TLS et VPN** : sécurisation des flux serveurs et accès distants.

> **Risque majeur** : Un certificat expiré bloque instantanément les paiements de la Ville, la transmission des actes juridiques ou l'attribution des marchés publics.

---

## 2. Vue d'ensemble et alertes d'expiration (`/certif`)

La page principale offre un tableau de contrôle haute visibilité :

### 2.1 Compteurs et codes couleurs
- 🔴 **Périmés** : certificats dont la date de validité est échue (blocage effectif ou risque juridique).
- 🟠 **Expirant sous 3 mois** : certificats prioritaires dont la procédure de renouvellement doit être engagée immédiatement (délai d'obtention de 3 à 4 semaines auprès de l'Autorité de Certification).
- 🟢 **Valides** : certificats opérationnels.
- ⚪ **À renouveler** : certificats pour lesquels le renouvellement a été formellement commandé.

### 2.2 Filtres et recherche
- Recherche instantanée par nom du bénéficiaire, e-mail, numéro de commande ou numéro de bon de commande SEDIT.
- Filtre par Usage métier (PES V2, ACTES, Marchés, État Civil, etc.) et par Direction.
- Filtre par Statut de renouvellement (Non renouvelé, En cours, Renouvelé).

---

## 3. Importation automatisée par lecture de PDF

Le module intègre un parseur automatique de PDF (`pdf-parse`) éliminant les erreurs de saisie manuelle :

### 3.1 Comment ça marche ?
1. Glissez-déposez le document PDF de confirmation de commande reçu de l'Autorité de Certification (ex. *ChamberSign, Certigna, Dhimyotis, CertEurope*).
2. Le moteur analyse le texte et extrait instantanément :
   - Le **Numéro de commande** (ex. format `BDxxxxxx`).
   - La **Date de demande**.
   - Le **Nom et prénom du titulaire** ainsi que son adresse e-mail professionnelle.
   - Le **Code produit** (ex. `OE2`, `OP2`, RGS**, eIDAS).
   - La **Durée de validité** (généralement 2 ans ou 3 ans) et calcule automatiquement la **Date d'expiration exacte**.
3. En cas d'ambiguïté sur la date de fin, le certificat est marqué temporairement `provisoire` (+15 jours) en invitant l'administrateur à vérifier la fiche.

---

## 4. Téléversement par lot (*Batch upload*) et import Excel

Pour les campagnes annuelles de renouvellement massif :

- **Téléversement par lot** : déposez jusqu'à **20 fichiers PDF simultanément**. Une barre de progression détaille l'analyse fichier par fichier avec compte-rendu immédiat (succès, doublons détectés, erreurs de format).
- **Import Excel** : import d'un tableau récapitulatif pour reprendre un historique ancien ou intégrer des clés acquises via une centrale d'achats.

---

## 5. Fiche certificat détaillée et métadonnées

Chaque certificat dispose d'une fiche complète :

- **Bénéficiaire & présence en direct** : nom de l'agent avec badge de présence temps réel (RH Studio) confirmant si l'agent est en poste ou a quitté la collectivité.
- **Rattachement administratif** : Direction et Service utilisateur.
- **Référence comptable SEDIT** : numéro du bon de commande municipal ayant servi au règlement.
- **Option Sérénité** : mentionne si le certificat bénéficie de l'assurance remplacement en cas de perte de mot de passe ou de clé physique défectueuse.
- **Observations libres** : emplacement physique de la clé (ex. *« coffre du secrétariat général »*, *« bureau DRH »*).

---

## 6. Usages réglementaires et rattachement administratif

Chaque clé doit être qualifiée par son usage métier pour faciliter la gestion des suppléances :
- *ACTES (Contrôle de légalité)*
- *HELIOS / PES V2 (Comptabilité publique)*
- *Marchés publics (Signature d'offres / CAO)*
- *État Civil / Citoyenneté*
- *Urbanisme (Permis de construire dématérialisés)*
- *Signature générique d'e-mails / VPN*

---

## 7. Processus de renouvellement et suivi

Dès qu'un certificat entre dans la fenêtre des 90 jours avant expiration :

1. **Passage en statut « En cours de renouvellement »** : l'administrateur consigne la commande effectuée auprès du prestataire.
2. **Champ commentaire de suivi** : horodatage des étapes (envoi des pièces d'identité du porteur, validation de l'Opérateur d'Enregistrement Délégué, rendez-vous de remise en main propre).
3. **Clôture du renouvellement** : dès réception de la nouvelle clé, dépôt du nouveau PDF. Le système lie l'ancien certificat comme prédécesseur et bascule son statut à `Renouvelé`.

---

## 8. Gestion des révocations et pertes de clés physiques

En cas de départ d'un agent, de perte de la clé USB ou de compromission du code PIN :

- **Bouton « Révoquer »** : accessible aux administrateurs de sécurité.
- **Saisie obligatoire du motif de révocation** : *Départ de l'agent, Perte du support physique, Clé défectueuse, Changement de fonctions*.
- Horodatage certifié de la révocation dans le journal d'audit et notification aux services concernés pour suspension des délégations de signature.

---

## 9. Liaison comptable avec le progiciel financier (SEDIT)

- Chaque acquisition de certificat génère une ligne de dépense rattachée à la ligne budgétaire informatique.
- La mention du numéro de bon de commande SEDIT permet au gestionnaire financier de rapprocher instantanément la facture reçue avec la clé physique livrée avant d'apposer le service fait.

---

## 10. Interactions avec les autres modules du Hub

| Module lié | Nature du flux |
|---|---|
| **Tableau de bord DSI** (`/dsi-dashboard`) | Widget d'alerte comptabilisant les certificats expirant sous 3 mois. |
| **GED & Documents** (`/documents`) | Double écriture : tout bon de commande PDF déposé est indexé dans le coffre-fort `hub_docs`. |
| **RH & Active Directory** (`/rh`) | Vérification du statut actif de l'agent et de son affectation de service. |
| **Profil & Notifications** | Alertes e-mails adressées aux référents lors du franchissement du seuil des 30 jours. |

---

## 11. Règles de sécurité et bonnes pratiques

- ⚠️ **Remise en main propre obligatoire** : Les certificats nominatifs sur clé cryptographique (RGS**) doivent impérativement être remis en main propre au bénéficiaire contre signature d'une décharge physique ou électronique.
- 💡 **Délai d'anticipation** : Lancez toujours les formalités de renouvellement **45 jours minimum** avant la date de fin pour pallier tout retard d'instruction des pièces justificatives par l'Autorité de Certification.
- 💡 **Départs d'agents** : Lors de la notification du départ d'un collaborateur dans le module RH, vérifiez immédiatement dans le module Certificats si des clés électroniques doivent être récupérées et révoquées.
