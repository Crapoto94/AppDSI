# Guide opérationnel — Module Ressources Humaines DSI (`/rh`)

> Documentation fonctionnelle et d'administration à l'usage des **administrateurs de comptes, gestionnaires RH/DSI, référents d'intégration et encadrants**.
> Ce guide détaille la synchronisation des effectifs municipaux : référentiel unique des agents enrichi depuis Oracle RH, organigramme hiérarchique, liaisons avec Active Directory et Azure AD (O365), onboarding des arrivants et suivi des renouvellements des contractuels.

---

## Sommaire

1. [Rôle du référentiel RH au sein du Hub DSI](#1-rôle-du-référentiel-rh-au-sein-du-hub-dsi)
2. [Vue d'ensemble et statistiques des effectifs (`/rh`)](#2-vue-densemble-et-statistiques-des-effectifs-rh)
3. [Synchronisation Active Directory (LDAP on-premise)](#3-synchronisation-active-directory-ldap-on-premise)
4. [Synchronisation Azure AD et licences Microsoft 365](#4-synchronisation-azure-ad-et-licences-microsoft-365)
5. [Organigramme hiérarchique dynamique de la collectivité](#5-organigramme-hiérarchique-dynamique-de-la-collectivité)
6. [Annuaire des encadrants et référents municipaux](#6-annuaire-des-encadrants-et-référents-municipaux)
7. [Parcours d'onboarding des nouveaux arrivants](#7-parcours-donboarding-des-nouveaux-arrivants)
8. [Suivi des agents contractuels et relances automatiques](#8-suivi-des-agents-contractuels-et-relances-automatiques)
9. [Interactions avec les autres modules du Hub](#9-interactions-avec-les-autres-modules-du-hub)
10. [Règles de conformité RGPD et bonnes pratiques](#10-règles-de-conformité-rgpd-et-bonnes-pratiques)

---

## 1. Rôle du référentiel RH au sein du Hub DSI

Pour attribuer un ordinateur, ouvrir un compte e-mail, affecter un ticket ou prêter du matériel, la DSI a besoin d'une source d'identité infalsifiable et continuellement à jour.

Le module RH assure cette mission en créant une **passerelle unifiée entre le progiciel de paie de la DRH (Oracle RH) et les annuaires techniques informatiques (Active Directory et Azure AD)**.

---

## 2. Vue d'ensemble et statistiques des effectifs (`/rh`)

Le tableau de bord consolide l'état des agents municipaux :
- **Total des agents recensés** (Titulaires, Stagiaires, Contractuels, Apprentis, Vacataires).
- **Agents en activité** vs **Départs enregistrés** vs **Arrivées futures programmées**.
- **Taux de couverture informatique** : pourcentage d'agents disposant d'un compte réseau synchronisé.
- **Alertes de désalignement** : détection des comptes AD actifs dont l'agent a quitté la collectivité selon la paie.

---

## 3. Synchronisation Active Directory (LDAP on-premise)

Le connecteur LDAP assure le rapprochement automatique entre l'agent physique et son compte Windows :

### 3.1 Algorithme de réconciliation par scoring
1. **Correspondance forte** : matching exact sur le matricule RH (`employeeID`).
2. **Correspondance nominative** : rapprochement phonétique et orthographique sur Nom + Prénom (`displayName` / `sn`).
3. **Alignement assisté** : pour les cas ambigus (homonymes, changements de nom d'usage), l'administrateur valide ou associe manuellement le bon compte AD.

---

## 4. Synchronisation Azure AD et licences Microsoft 365

En complément de l'annuaire local, le connecteur Microsoft Graph supervise le cloud municipal :
- Suivi de l'identifiant cloud (`azure_id`) et de l'adresse de messagerie principale.
- **Inventaire des licences O365 attribuées** : détection des licences coûteuses (Microsoft 365 E5 ou E3) assignées à des agents n'en ayant pas l'usage, permettant de réassigner des forfaits plus légers (E1 ou Exchange Online Kiosk).

---

## 5. Organigramme hiérarchique dynamique de la collectivité

L'onglet **Organisation** modélise l'arborescence complète de l'administration municipale :
- Découpage en 4 niveaux : **Direction Générale > Direction > Service > Secteur**.
- **Déduction automatique des responsables** : analyse des intitulés de postes pour identifier le directeur, le chef de service ou le chef d'équipe de chaque entité.
- **Signalement des postes vacants** : repérage visuel des services sans encadrant désigné pour anticiper les recrutements et les transferts de délégations de signature.

---

## 6. Annuaire des encadrants et référents municipaux

- Registre à jour de l'ensemble des cadres municipaux (DG, Directeurs, Chefs de services, Responsables de régies).
- Consolidation des coordonnées de contact directes : téléphone fixe, numéro de mobile professionnel (synchronisé depuis le module Mobilité/Télécom) et boîte e-mail.
- Permet à la DSI et à la Direction Générale d'adresser des communications ciblées lors des crises ou des pannes majeures.

---

## 7. Parcours d'onboarding des nouveaux arrivants

Le module structure l'accueil des nouveaux collaborateurs :
- **Détection anticipée des recrutements** : remontée des contrats enregistrés par la DRH avec date d'effet future.
- **Checklist d'intégration informatique** :
  - Création du compte Active Directory et de l'adresse e-mail.
  - Attribution des droits d'accès aux logiciels métiers (MagApp).
  - Préparation du PC portable et du smartphone de dotation.
  - Badge d'accès aux locaux et affectation téléphonique.

---

## 8. Suivi des agents contractuels et relances automatiques

Pour éviter qu'un agent contractuel se retrouve brutalement privé d'accès informatique faute d'anticipation de son renouvellement de contrat :

### 8.1 Traitement des échéances
- Suivi de la date de fin de contrat de l'ensemble des contractuels à durée déterminée.
- **Alerte préventive à 90 jours** : permet au manager de service de solliciter la DRH pour renouvellement.
- **Relance automatique à J-7 (`contract-renewal-auto`)** : un courriel d'alerte automatique est adressé au responsable du service 7 jours avant le terme pour confirmer la prolongation ou préparer la restitution du matériel informatique.

---

## 9. Interactions avec les autres modules du Hub

| Module | Nature de l'interconnexion |
|---|---|
| **Parc & Mobilité** (`/parc`) | Vérification de l'affectation du matériel et récupération des équipements lors des départs. |
| **Paramètres Ville** (`/admin/param-ville`) | Partage de l'arborescence des directions et des sites administratifs. |
| **Calendrier DSI** (`/calendrier-dsi`) | Récupération des matricules agents pour synchronisation des congés Demabs. |
| **Tickets & Support** (`/tickets`) | Qualification immédiate de l'interlocuteur (direction, service, responsable hiérarchique). |

---

## 10. Règles de conformité RGPD et bonnes pratiques

- ⚠️ **Droit à l'oubli et désactivation** : Tout compte AD associé à un agent ayant quitté la collectivité doit être désactivé dans les **48 heures** suivant la date de départ effective enregistrée dans Oracle RH.
- 💡 **Matricule obligatoire** : Exigez systématiquement le matricule RH officiel lors de toute demande de création de compte pour garantir la traçabilité de bout en bout.
- 💡 **Nettoyage périodique des licences** : Lancez une vérification mensuelle des comptes inactifs pour libérer les licences Microsoft 365 et optimiser les coûts logiciels de la Ville.
