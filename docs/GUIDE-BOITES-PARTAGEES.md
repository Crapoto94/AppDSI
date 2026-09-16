# Guide opérationnel — Module Boîtes Mail Partagées (`/boites-partagees`)

> Documentation d'administration et de gouvernance à l'usage des **administrateurs de messagerie, référents applicatifs, techniciens support et encadrants**.
> Ce guide détaille l'inventaire, le cycle de vie et l'arbitrage des boîtes aux lettres partagées, listes de diffusion et listes de sécurité de la collectivité : synchronisation des membres depuis l'Active Directory et Microsoft 365, suivi des boîtes provisoires et comptage des messages non lus en temps réel.

---

## Sommaire

1. [Enjeux de gouvernance de la messagerie collaborative](#1-enjeux-de-gouvernance-de-la-messagerie-collaborative)
2. [Vue d'ensemble et typologie des objets (`/boites-partagees`)](#2-vue-densemble-et-typologie-des-objets-boites-partagees)
3. [Cycle de vie d'une boîte partagée et arbitrage managérial](#3-cycle-de-vie-dune-boîte-partagée-et-arbitrage-managérial)
4. [Gestion des boîtes provisoires et dates d'expiration](#4-gestion-des-boîtes-provisoires-et-dates-dexpiration)
5. [Résolution des membres (Active Directory vs Microsoft 365 Graph)](#5-résolution-des-membres-active-directory-vs-microsoft-365-graph)
6. [Supervision de la volumétrie et des e-mails non lus](#6-supervision-de-la-volumétrie-et-des-e-mails-non-lus)
7. [Création et modification d'une fiche de boîte](#7-création-et-modification-dune-fiche-de-boîte)
8. [Interactions avec les autres modules du Hub DSI](#8-interactions-avec-les-autres-modules-du-hub-dsi)
9. [Bonnes pratiques d'hygiène et de sécurité de messagerie](#9-bonnes-pratiques-dhygiène-et-de-sécurité-de-messagerie)

---

## 1. Enjeux de gouvernance de la messagerie collaborative

Sans gouvernance rigoureuse, le serveur de messagerie accumule des centaines de boîtes partagées et listes de diffusion obsolètes : anciens projets terminés, agents ayant quitté la collectivité toujours destinataires de courriels sensibles, absence de responsable identifié.

Le module Boîtes Partagées garantit la **sécurité, la traçabilité et la transparence des adresses collectives** d'Exchange et de Microsoft 365.

---

## 2. Vue d'ensemble et typologie des objets (`/boites-partagees`)

La page principale recense l'ensemble des adresses génériques selon trois types normalisés :

| Type d'objet | Badge | Usage principal et fonctionnement |
|---|---|---|
| **Boîte partagée** (*Shared Mailbox*) | 🟢 Vert | Boîte aux lettres sans licence propre accessible par délégation à plusieurs agents (ex. `accueil.mairie@ville.fr`, `urbanisme@ville.fr`). |
| **Liste de diffusion** (*Distribution List*) | 🔵 Bleu | Adresse collective qui redistribue chaque message entrant dans la boîte personnelle de tous ses membres (ex. `tous.agents@ville.fr`, `directeurs@ville.fr`). |
| **Liste de sécurité** (*Security Group*) | 🟠 Orange | Groupe Active Directory utilisé à la fois pour diffuser des e-mails et pour attribuer des droits d'accès sur des dossiers réseaux partagés. |

### 2.1 Types d'usage
- **Usage Externe** : l'adresse est publiée sur le site Internet municipal ou destinée à recevoir des courriels d'usagers et de prestataires extérieurs.
- **Usage Interne** : l'adresse est réservée aux échanges stricts entre services municipaux.

---

## 3. Cycle de vie d'une boîte partagée et arbitrage managérial

Pour éviter la création anarchique de boîtes aux lettres, toute demande fait l'objet d'une instruction formalisée :
- **Demandeur et justification** : nom de l'agent demandeur et motif de création (ex. *création d'un nouveau service Guichet Unique*).
- **Ticket support lié** : numéro du ticket de demande initial dans `/tickets`.
- **Arbitrage DSI** :
  - `Positif` : validation de la création sur le tenant O365 / serveur Exchange.
  - `Négatif` : refus motivé (ex. *redondance avec une liste existante*).
- **Responsable désigné obligatoire** : toute boîte partagée doit avoir un agent titulaire désigné, garant de la gestion des accès et de la pertinence de la boîte.

---

## 4. Gestion des boîtes provisoires et dates d'expiration

Une cause fréquente de prolifération est la création de boîtes liées à des événements temporaires (ex. *élections municipales, festival d'été, commission d'enquête publique*) :
- **Case à cocher « Provisoire »** : permet de définir une **Date de fin de validité**.
- **Alerte d'échéance** : signalement visuel dès que la date limite est franchie pour inviter l'administrateur à archiver ou supprimer la boîte après confirmation du responsable.

---

## 5. Résolution des membres (Active Directory vs Microsoft 365 Graph)

L'un des atouts majeurs du module est sa double sonde de contrôle d'appartenance :

### 5.1 Synchronisation AD on-premise
- Le système interroge l'annuaire local pour lister les membres effectifs d'une liste de diffusion ou les délégués disposant du droit *Send-As* ou *FullAccess*.

### 5.2 Repli et audit Microsoft 365 Cloud (Graph API)
Lorsque l'annuaire local ne renvoie aucun membre (ou pour les boîtes créées directement dans le cloud) :
- ☁️ **Confirmée dans O365** : la boîte existe bien dans le cloud mais ses membres ne sont pas managés on-premise.
- 🔒 **Erreur de permission Graph** : alerte l'administrateur si une autorisation manque sur l'application Azure.
- ❌ **Non trouvée** : alerte critique signalant une boîte déclarée mais inexistante sur le serveur de messagerie.

---

## 6. Supervision de la volumétrie et des e-mails non lus

Le module intègre un indicateur de santé opérationnelle :
- **Nombre total de messages dans la boîte de réception (Inbox)** : détection des boîtes saturées approchant du quota de 50 Go.
- **Nombre de messages non lus (`mail_unread_count`)** : alerte immédiate si une boîte de service public accumule des dizaines d'e-mails d'usagers sans réponse.
- **Horodatage de dernière synchronisation** : garantit la fraîcheur de l'indicateur.

---

## 7. Création et modification d'une fiche de boîte

Depuis le bouton **« Nouvelle boîte partagée »** :
1. Saisie du **Nom d'affichage** et de l'**Adresse e-mail complète** (avec domaine `@ville.fr`).
2. Sélection du **Type** et de l'**Usage** (Interne / Externe).
3. Sélection du **Responsable** via recherche AD assistée par le badge de présence RH.
4. Saisie de la justification et sélection de l'éventuelle date de fin si provisoire.
5. Marquage des options techniques : *Boîte DSI*, *Boîte système / technique*.

---

## 8. Interactions avec les autres modules du Hub DSI

| Module en interaction | Objet de la synchronisation |
|---|---|
| **Tickets & Support** (`/tickets`) | Rapprochement des tickets de demandes de création ou de modification de droits. |
| **Active Directory & RH** (`/rh`) | Résolution des identités des membres et vérification du statut actif des délégués. |
| **Messagerie & O365** (`/admin/o365-mail`) | Connecteur Microsoft Graph assurant la lecture des métadonnées de boîtes et des compteurs. |
| **Actions rapides** (`/fast`) | Consultation mobile rapide de la liste des boîtes partagées d'un service. |

---

## 9. Bonnes pratiques d'hygiène et de sécurité de messagerie

- 💡 **Revue annuelle des membres** : Chaque année en septembre, adressez la liste des membres délégués au responsable de chaque boîte partagée pour radiation des agents ayant changé de service.
- 💡 **Pas de mot de passe partagé** : Ne communiquez jamais un identifiant et un mot de passe commun ; privilégiez toujours la délégation de droits nominative (*FullAccess* / *SendAs*) via l'Active Directory.
- ⚠️ **Suppression de boîte provisoire** : À l'échéance d'une boîte temporaire, effectuez une sauvegarde PST ou un archivage des courriels avant suppression définitive de l'adresse.
