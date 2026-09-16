# Guide opérationnel — Module Mes Réunions (`/mes-reunions`)

> Documentation organisationnelle à l'usage des **agents, chefs de projets, cadres et intervenants de la DSI**.
> Ce guide détaille la gestion et le suivi des réunions de travail : préparation des ordres du jour, convocation des participants, consignation des pièces jointes, comptes-rendus, liaisons avec les projets et extraction des tâches d'action.

---

## Sommaire

1. [Objet du module Mes Réunions](#1-objet-du-module-mes-réunions)
2. [Accès et visibilité des séances (`/mes-reunions`)](#2-accès-et-visibilité-des-séances-mes-reunions)
3. [Création et planification d'une réunion](#3-création-et-planification-dune-réunion)
4. [Gestion des participants et présences](#4-gestion-des-participants-et-présences)
5. [Ordre du jour, compte-rendu et pièces jointes](#5-ordre-du-jour-compte-rendu-et-pièces-jointes)
6. [Liaison avec le Portefeuille Projets](#6-liaison-avec-le-portefeuille-projets)
7. [Liaison avec le Transcript Manager (IA Teams)](#7-liaison-avec-le-transcript-manager-ia-teams)
8. [Suivi des décisions et des tâches associées](#8-suivi-des-décisions-et-des-tâches-associées)
9. [Interactions avec les autres modules du Hub](#9-interactions-avec-les-autres-modules-du-hub)
10. [Bonnes pratiques pour des réunions efficaces](#10-bonnes-pratiques-pour-des-réunions-efficaces)

---

## 1. Objet du module Mes Réunions

Le module Mes Réunions centralise la mémoire collaborative des échanges de la DSI :
- Garder une trace formalisée des arbitrages pris en réunion d'équipe, comités de pilotage ou points techniques avec les prestataires.
- Éviter la perte d'informations suite aux réunions informelles.
- Transformer immédiatement les engagements oraux en tâches concrètes et mesurables.

---

## 2. Accès et visibilité des séances (`/mes-reunions`)

### 2.1 Points d'entrée
- Accessible depuis le menu principal ou la tuile **Réunions** (`/mes-reunions`).
- Accessible également depuis l'onglet Réunions d'une fiche projet dans `/projets/:id`.

### 2.2 Droits de consultation
- **Agents utilisateurs** : voient automatiquement toutes les réunions auxquelles ils sont conviés ou dont ils sont les organisateurs.
- **Super-administrateurs / Direction** : vision panoramique sur l'intégralité des réunions de la direction pour audit et suivi managérial.

---

## 3. Création et planification d'une réunion

Le bouton **« Nouvelle réunion »** ouvre la fenêtre de création simplifiée :
- **Titre explicite** (ex. *« COPIL Déploiement Portail Famille - Session #3 »*).
- **Date et heure de la séance**.
- **Lieu** : salle de réunion physique (ex. *Salle Turing - DSI*, *Bureau DG*) ou lien de visioconférence Teams.
- **Description / Contexte** : résumé synthétique de l'objet de la séance.
- **Statut** : `Planifiée`, `En cours`, `Terminée`, `Annulée`.

---

## 4. Gestion des participants et présences

- **Recherche connectée à l'annuaire Active Directory** : ajout facile des collaborateurs de la collectivité.
- **Participants externes** : saisie libre de l'e-mail et du nom des consultants, prestataires ou élus invités.
- **Pointage des présences** : statut *Présent*, *Excusé*, *Représenté par suppléant*.

---

## 5. Ordre du jour, compte-rendu et pièces jointes

La fiche détaillée (`ReunionDetailModal`) structure les échanges :
- **Ordre du jour structuré** : liste des points abordés préparés avant la séance.
- **Compte-rendu de séance** : synthèse rédigée des échanges et arbitrages intervenus.
- **Pièces jointes multiples** : dépôt de présentations PowerPoint, comptes-rendus financiers, devis comparatifs ou schémas techniques (fichiers sécurisés et indexés dans la GED).

---

## 6. Liaison avec le Portefeuille Projets

Si la réunion s'inscrit dans le cadre d'un projet suivi dans le Hub :
- Un menu déroulant permet de rattacher la séance au projet correspondant.
- La réunion apparaît alors automatiquement dans l'onglet **Réunions** de la fiche projet (`/projets/:id`), consolidant ainsi l'historique complet de gouvernance du projet.

---

## 7. Liaison avec le Transcript Manager (IA Teams)

Lorsqu'une réunion a été enregistrée et transcrite dans Microsoft Teams :
- Possibilité de lier d'un clic la fiche de réunion avec son transcript importé dans le module `/transcriptmanager`.
- Permet aux participants de relire le compte-rendu condensé tout en ayant accès à la retranscription exacte mot à mot et au résumé IA en cas de doute sur un engagement précis.

---

## 8. Suivi des décisions et des tâches associées

À l'issue de la réunion, l'organisateur saisit le plan d'action :
- **Qui fait quoi et pour quand ?** : saisie de chaque tâche avec libellé, destinataire et date d'échéance.
- **Alimentation automatique de « Mes Tâches »** : chaque action créée apparaît instantanément dans la boîte de réception personnelle de l'agent assigné (`/mes-taches`).
- Lors du changement d'état de la tâche par le collaborateur (*En cours*, *Terminé*), l'avancement est répercuté en temps réel sur la fiche de la réunion.

---

## 9. Interactions avec les autres modules du Hub

| Module | Nature du lien |
|---|---|
| **Portefeuille Projets** (`/portefeuille-projets`) | Historisation des comités de pilotage (COPIL) et comités techniques (COTEC). |
| **Transcript Manager** (`/transcriptmanager`) | Rapprochement avec la retranscription intégrale des échanges Teams et la synthèse IA. |
| **Mes Tâches** (`/mes-taches`) | Transmission directe des engagements d'action aux collaborateurs. |
| **GED & Documents** (`/documents`) | Conservation pérenne des comptes-rendus signés et des diaporamas. |

---

## 10. Bonnes pratiques pour des réunions efficaces

- 💡 **Diffusion préalable de l'ordre du jour** : Renseignez les points à aborder et joignez les documents de travail au moins 24 heures avant la tenue de la réunion.
- 💡 **Relevé de décisions immédiat** : Enregistrez les tâches et les décisions directement en séance pour un partage instantané sans travail de reprise ultérieur.
- ⚠️ **Neutralité des comptes-rendus** : Veillez à formuler les décisions de façon factuelle et mesurable (ex. *« Valider le devis X avant le 15/10 »* plutôt que *« Voir pour le devis »*).
