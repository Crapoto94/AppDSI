# Guide opérationnel — Module Vols et Pertes de Matériel (`/vols`)

> Documentation fonctionnelle et juridique à l'usage des **techniciens support, référents sécurité, gestionnaires de parc et correspondants assurances/DPD**.
> Ce guide détaille la gestion rigoureuse des sinistres matériels informatiques : déclaration de vol, perte ou casse, recueil des dépôts de plainte, notification du Délégué à la Protection des Données (RGPD), suivi des indemnisations d'assurance et radiation des actifs.

---

## Sommaire

1. [Enjeux juridiques et sécurité des sinistres matériels](#1-enjeux-juridiques-et-sécurité-des-sinistres-matériels)
2. [Vue d'ensemble et registre des déclarations (`/vols`)](#2-vue-densemble-et-registre-des-déclarations-vols)
3. [Workflow et cycle de traitement d'un sinistre](#3-workflow-et-cycle-de-traitement-dun-sinistre)
4. [Création d'un dossier et qualification de l'équipement](#4-création-dun-dossier-et-qualification-de-léquipement)
5. [Pièces justificatives obligatoires et dépôt de plainte](#5-pièces-justificatives-obligatoires-et-dépôt-de-plainte)
6. [Obligation réglementaire RGPD : Alerte DPD / CNIL](#6-obligation-réglementaire-rgpd--alerte-dpd--cnil)
7. [Mesures techniques conservatoires immédiates](#7-mesures-techniques-conservatoires-immédiates)
8. [Suivi des indemnisations d'assurance et clôture](#8-suivi-des-indemnisations-dassurance-et-clôture)
9. [Interactions avec les autres modules du Hub DSI](#9-interactions-avec-les-autres-modules-du-hub-dsi)
10. [Conduite à tenir et protocole en cas de vol](#10-conduite-à-tenir-et-protocole-en-cas-de-vol)

---

## 1. Enjeux juridiques et sécurité des sinistres matériels

La disparition d'un équipement informatique professionnel (ordinateur portable, smartphone, tablette, disque dur externe) n'est pas une simple perte matérielle : c'est un **incident de sécurité majeur**.
- **Risque de fuite de données (RGPD)** : données nominatives d'usagers, secrets administratifs, fichiers du personnel.
- **Risque d'intrusion sur le réseau municipal** : certificats VPN ou accès aux sessions de travail.
- **Obligation assurantielle** : nécessité d'un dépôt de plainte formel auprès des services de police pour activer la couverture d'assurance de la collectivité.

---

## 2. Vue d'ensemble et registre des déclarations (`/vols`)

L'écran principal centralise l'ensemble des dossiers de sinistres :
- **Cartes d'indicateurs** : nombre total de dossiers ouverts sur l'année, répartition par type (Vol, Perte, Casse/Dégradation), montant total du préjudice financier estimé.
- **Filtres de statut** : *Déclaré, Plainte déposée, En cours d'indemnisation, Remboursé, Classé sans suite, Clos*.
- **Recherche plein texte** : par numéro de dossier, nom de l'agent victime, numéro de série constructeur ou numéro de PV de police.

---

## 3. Workflow et cycle de traitement d'un sinistre

Tout dossier suit un cheminement formalisé :

```
1. DÉCLARATION (Par l'agent ou le technicien support)
       │
       ▼
2. PLAINTE DÉPOSÉE (Recueil du récépissé de police / gendarmerie)
       │
       ▼
3. EN COURS (Instruction assurance municipale & mesures techniques)
       │
       ├─────────────────────────┬─────────────────────────┐
       ▼                         ▼                         ▼
4. REMBOURSÉ (Indemnisé)    CLASSÉ SANS SUITE           5. CLOS (Radié)
```

---

## 4. Création d'un dossier et qualification de l'équipement

Lors de l'ouverture d'un nouveau dossier :
- **Identification de la victime** : sélection de l'agent dans l'annuaire municipal.
- **Circonstances précises** : date, heure estimée, lieu précis (cambriolage en bureau, vol dans un véhicule municipal, agression sur voie publique, perte lors d'un déplacement).
- **Rattachement matériel assisté** : un moteur de recherche permet d'interroger le module Parc et le module Mobilité pour sélectionner directement la machine (PC, tablette ou smartphone) :
  - Importe automatiquement la marque, le modèle, le numéro de série, le code IMEI, l'adresse MAC et la date d'achat.

---

## 5. Pièces justificatives obligatoires et dépôt de plainte

Pour chaque sinistre, l'espace documentaire intégré recueille les pièces officielles :
- **Déclaration sur l'honneur circonstanciée** rédigée et signée par l'agent.
- **Récépissé de dépôt de plainte officiel** émis par le Commissariat de Police Nationale ou la Brigade de Gendarmerie (avec numéro de procès-verbal et qualifications pénales).
- **Constat de dégradation ou devis de réparation** en cas de casse matérielle.
- Tous les documents sont scannés, horodatés et archivés de façon infalsifiable dans la GED (`hub_docs`).

---

## 6. Obligation réglementaire RGPD : Alerte DPD / CNIL

Le module comporte une commande essentielle : le sélecteur **« DPD Informé »** :
- **Conformité Article 33 du RGPD** : en cas de vol d'un terminal contenant des données à caractère personnel sans chiffrement complet du disque (BitLocker), la collectivité doit notifier l'incident à la CNIL sous **72 heures**.
- Le fait de cocher « DPD Informé » déclenche un rapport récapitulatif transmis au Délégué à la Protection des Données de la Ville avec horodatage d'audit.

---

## 7. Mesures techniques conservatoires immédiates

Dès la création du dossier, le technicien DSI doit activer les verrous techniques d'urgence :
1. **Révocation des accès nomades** : réinitialisation immédiate du mot de passe Active Directory et révocation des jetons Azure AD / Teams.
2. **Effacement à distance (MDM / Intune)** : émission de la commande d'effacement complet des données (*Remote Wipe*) dès que l'appareil se reconnectera à Internet.
3. **Blacklistage IMEI** : transmission du numéro IMEI à l'opérateur mobile pour blocage national de l'appareil sur tous les réseaux cellulaires.

---

## 8. Suivi des indemnisations d'assurance et clôture

- **Rattachement au dossier d'assurance municipal** : numéro de sinistre communiqué par la compagnie d'assurance de la Ville.
- **Enregistrement de l'indemnisation reçue** : saisie du montant remboursé par l'assureur (déduction faite de la franchise contractuelle).
- **Radiation de l'actif** : la clôture du dossier bascule automatiquement le statut de l'équipement à `Volé` ou `Perdu` dans le module Parc, autorisant sa sortie de l'inventaire comptable municipal.

---

## 9. Interactions avec les autres modules du Hub DSI

| Module en lien | Rôle dans l'instruction du sinistre |
|---|---|
| **Parc Informatique** (`/parc`) | Identification du matériel et bascule du statut de l'équipement à *Volé*. |
| **Mobilité / Lignes mobiles** (`/parc` > Mobilité) | Récupération du numéro IMEI et suspension de la ligne mobile SFR. |
| **GED & Documents** (`/documents`) | Conservation sécurisée des procès-verbaux de police et déclarations. |
| **Tickets & Support** (`/tickets`) | Rapprochement du ticket d'assistance ayant signalé le vol initialement. |

---

## 10. Conduite à tenir et protocole en cas de vol

- 🚨 **Réflexe immédiat (H+1)** : L'agent victime doit immédiatement contacter la DSI pour bloquer son compte et révoquer ses accès VPN/messagerie.
- 🚨 **Dépôt de plainte (H+24)** : L'agent doit se rendre au commissariat dans les 24 heures muni du numéro de série et de l'IMEI fournis par la DSI.
- 💡 **Remplacement temporaire** : Attribuez un matériel de prêt temporaire depuis le module Stocks le temps que l'assurance statue sur l'indemnisation et le rachat définitif.
