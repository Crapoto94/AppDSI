# Guide opérationnel — Module Mes Tâches (`/mes-taches`)

> Documentation organisationnelle et de productivité à l'usage de **tous les collaborateurs, chefs de projets et managers de la DSI**.
> Ce guide détaille la boîte de réception unifiée des tâches : agrégation multi-sources (projets, réunions, transcripts IA, tickets, tâches personnelles), synchronisation bidirectionnelle avec Microsoft To Do, gestion des priorités et alertes quotidiennes par e-mail.

---

## Sommaire

1. [Concept de la boîte de réception unifiée](#1-concept-de-la-boîte-de-réception-unifiée)
2. [Vue d'ensemble et organisation de l'interface (`/mes-taches`)](#2-vue-densemble-et-organisation-de-linterface-mes-taches)
3. [Les 8 sources de tâches agrégées](#3-les-8-sources-de-tâches-agrégées)
4. [Cycle de vie d'une tâche et synchronisation en cascade](#4-cycle-de-vie-dune-tâche-et-synchronisation-en-cascade)
5. [Tâches d'équipe : prise en charge et refus motivé](#5-tâches-déquipe-prise-en-charge-et-refus-motivé)
6. [Synchronisation avec Microsoft To Do](#6-synchronisation-avec-microsoft-to-do)
7. [Gestion des alertes et rappels quotidiens par e-mail](#7-gestion-des-alertes-et-rappels-quotidiens-par-e-mail)
8. [Vue « Tâches que j'ai affectées »](#8-vue-tâches-que-jai-affectées)
9. [Filtres avancés, priorités et favoris](#9-filtres-avancés-priorités-et-favoris)
10. [Interactions avec les autres modules du Hub](#10-interactions-avec-les-autres-modules-du-hub)
11. [Méthodes de travail et conseils de productivité](#11-méthodes-de-travail-et-conseils-de-productivité)

---

## 1. Concept de la boîte de réception unifiée

Dans une direction informatique, les sollicitations proviennent d'une multitude de canaux : décisions prises en comités de pilotage, engagements oraux en réunions Teams, tickets d'assistance, jalons de projets ou to-do lists personnelles.

Le module Mes Tâches résout le problème de l'éparpillement en créant un **point focal unique** :
- Toutes vos actions à mener sont centralisées dans une seule interface.
- La mise à jour du statut d'une tâche ici se répercute instantanément dans le module source sans double saisie.

---

## 2. Vue d'ensemble et organisation de l'interface (`/mes-taches`)

Le tableau de bord propose une vue synthétique de votre charge de travail :

### 2.1 Cartes de pilotage et compteurs
- 🔴 **En retard** : tâches dont la date d'échéance est dépassée (triées en priorité absolue en haut de liste).
- 🔵 **En cours** : actions démarrées et actuellement en cours de traitement.
- ⚪ **À faire** : tâches planifiées en attente de prise en charge.
- 🟢 **Terminées aujourd'hui** : actions soldées dans la journée (gratification et historique).

### 2.2 Graphe d'historique KPI
Un graphique d'évolution illustre la tendance de votre volume de tâches au cours des dernières semaines (flux entrant vs flux traité).

---

## 3. Les 8 sources de tâches agrégées

Le moteur backend regroupe en temps réel (via une requête `UNION ALL` haute performance) les tâches issues de 8 origines :

1. **Tâches personnelles (`hub.user_tasks`)** : créées directement par vous pour organiser votre journée.
2. **Portefeuille Projets (`projets.projet_taches`)** : actions assignées dans le cadre d'un projet suivi par la DSI.
3. **Transcript Manager (`transcript.tasks`)** : engagements détectés automatiquement par l'IA lors des réunions Teams et validés par un agent.
4. **Rencontres Budgétaires (`rencontres_suivi`)** : actions de suivi issues des arbitrages budgétaires des directions.
5. **Revues de Projets (`revue_taches`)** : décisions prises en séance plénière de portefeuille par le PMO.
6. **Mes Réunions (`liste_taches`)** : points d'action rédigés en conclusion d'une réunion de travail.
7. **Tickets & Support** : tickets affectés à vos groupes de compétences nécessitant une intervention.
8. **Microsoft To Do** : tâches importées depuis votre compte personnel Office 365.

---

## 4. Cycle de vie d'une tâche et synchronisation en cascade

Le cycle d'une tâche est simple et universel :

```
[À faire] ────> [En cours] ────> [Terminée]
```

### 4.1 Répercussion bidirectionnelle
Lorsque vous cochez une tâche comme **Terminée** dans *Mes Tâches* :
- Si la tâche provient d'un **Projet**, la barre d'avancement du projet augmente automatiquement et la tâche passe au vert dans le Gantt.
- Si elle provient d'une **Réunion budgétaire**, le suivi de la demande est mis à jour.
- Si elle est synchronisée avec **Microsoft To Do**, elle est cochée comme faite sur votre smartphone et dans Outlook.

---

## 5. Tâches d'équipe : prise en charge et refus motivé

Lorsqu'une tâche est attribuée à un groupe ou pôle sans destinataire unique :
- **Bouton « Prendre en charge »** : l'agent s'attribue la tâche nominativement, retirant l'ambiguïté pour ses collègues.
- **Bouton « Refuser »** : si la tâche n'entre pas dans le périmètre du collaborateur, celui-ci peut la rejeter avec un commentaire explicatif obligatoire pour réassignation par le manager.

---

## 6. Synchronisation avec Microsoft To Do

Pour les collaborateurs nomades utilisant l'application mobile Microsoft To Do :
- **Liaison OAuth / Graph API** : activation d'un clic dans les préférences du module.
- Les tâches du Hub DSI sont répliquées dans une liste dédiée *« Hub DSI »* sur Microsoft To Do.
- Toute action effectuée sur smartphone (cochage, modification de date) se synchronise en retour sur le Hub.

---

## 7. Gestion des alertes et rappels quotidiens par e-mail

Deux options de notification personnalisables permettent de ne rien oublier :
- 🔔 **Avertissement immédiat à l'affectation** : envoi d'un courriel dès qu'un collègue ou un chef de projet vous assigne une nouvelle tâche.
- 📋 **Briefing matinal de 8h00** : récapitulatif quotidien de vos tâches prioritaires pour la journée et des éventuels retards. Un bouton **« Tester »** permet de visualiser le rendu immédiat du mail.

---

## 8. Vue « Tâches que j'ai affectées »

Un onglet dédié permet aux managers et chefs de projets de piloter les délégations :
- Liste de l'ensemble des tâches que vous avez créées et déléguées à d'autres agents.
- Visualisation immédiate de l'avancement : permet de savoir qui a commencé, qui a terminé et qui est en retard sans avoir à relancer oralement.

---

## 9. Filtres avancés, priorités et favoris

- **Étoile Favori (★)** : épinglez vos 3 à 5 tâches les plus stratégiques de la journée en haut de votre écran.
- **Niveaux de priorité** : *Urgente (rouge)*, *Haute (orange)*, *Normale (bleu)*, *Basse (gris)*.
- **Filtres par source** : possibilité d'afficher uniquement les tâches liées aux projets ou uniquement les actions issues des réunions.
- **Notes et pièces jointes** : chaque tâche peut comporter un carnet de notes riches et des fichiers joints d'accompagnement.

---

## 10. Interactions avec les autres modules du Hub

| Module lié | Nature du flux |
|---|---|
| **Portefeuille Projets** (`/portefeuille-projets`) | Alimentation continue des actions et répercussion de l'avancement. |
| **Transcript Manager** (`/transcriptmanager`) | Réception des engagements détectés par l'intelligence artificielle. |
| **Mes Réunions** (`/mes-reunions`) | Récupération des plans d'action de séances. |
| **Actions rapides** (`/fast`) | Création éclair d'une tâche personnelle depuis un smartphone. |
| **Tableau de bord DSI** (`/dsi-dashboard`) | Widget du nombre total de tâches en retard pour le suivi de direction. |

---

## 11. Méthodes de travail et conseils de productivité

- 💡 **Règle des 2 minutes** : Si une tâche prend moins de deux minutes, exécutez-la immédiatement plutôt que de la planifier.
- 💡 **Échéance systématique** : Attribuez toujours une date limite réaliste à vos tâches ; une tâche sans date n'est jamais priorisée par le moteur de tri.
- 💡 **Prise en charge active** : Passez vos tâches au statut *En cours* dès que vous commencez à travailler dessus pour informer vos collègues et votre hiérarchie.
