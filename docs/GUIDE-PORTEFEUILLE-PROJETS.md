# Guide opérationnel — Portefeuille Projets (`/portefeuille-projets`)

> Documentation méthodologique et fonctionnelle à l'usage des **chefs de projets DSI, responsables de pôles, PMO (Project Management Office) et directeurs**.
> Ce guide détaille la gouvernance complète du portefeuille de projets numériques : cadrage, matrice de scoring, cycle de vie par étapes, planning Gantt avec dépendances, gestion documentaire, revues périodiques et audit chronologique.

---

## Sommaire

1. [Gouvernance et rôle du PMO](#1-gouvernance-et-rôle-du-pmo)
2. [Vue d'ensemble du portefeuille (`/portefeuille-projets`)](#2-vue-densemble-du-portefeuille-portefeuille-projets)
3. [Cycle de vie d'un projet et jalons de validation](#3-cycle-de-vie-dun-projet-et-jalons-de-validation)
4. [Fiche projet détaillée et ses 10 volets (`/projets/:id`)](#4-fiche-projet-détaillée-et-ses-10-volets-projetsid)
5. [Matrice de scoring et priorisation sur 100](#5-matrice-de-scoring-et-priorisation-sur-100)
6. [Planning Gantt, jalons et gestion des dépendances](#6-planning-gantt-jalons-et-gestion-des-dépendances)
7. [Checklist documentaire et conformité par phase](#7-checklist-documentaire-et-conformité-par-phase)
8. [Revues de projets périodiques (`/revue-de-projets`)](#8-revues-de-projets-périodiques-revue-de-projets)
9. [Planning général consolidé (`/planning-general`)](#9-planning-général-consolidé-planning-general)
10. [Journal d'audit global (`/projets-log`)](#10-journal-daudit-global-projets-log)
11. [Interactions avec les autres modules du Hub](#11-interactions-avec-les-autres-modules-du-hub)
12. [Guide des bonnes pratiques de chefferie de projet](#12-guide-des-bonnes-pratiques-de-chefferie-de-projet)

---

## 1. Gouvernance et rôle du PMO

Le module Portefeuille Projets structure les investissements numériques de la collectivité pour garantir le respect des délais, des budgets et de la conformité réglementaire (RGPD, RGS, accessibilité).

### 1.1 Rôles et habilitations
- **Chef de projet** : pilote opérationnel responsable de la tenue de la fiche projet, du planning, des tâches, des comptes-rendus et des livrables.
- **PMO (Project Management Office)** : rôle transversal doté de droits étendus pour auditer le portefeuille, animer les revues de projets, arbitrer les priorités et configurer la grille de scoring.
- **Direction / Commanditaire** : vision globale, validation des passages d'étapes stratégiques et consultation des météos projets.
- **Équipe projet / Métier** : consultation, réalisation des tâches assignées, dépôt de documents de recette.

---

## 2. Vue d'ensemble du portefeuille (`/portefeuille-projets`)

La page d'accueil offre un tableau de bord stratégique :

### 2.1 Indicateurs clés de pilotage
- **Nombre total de projets actifs** et répartition par état d'avancement.
- **Score moyen de criticité** du portefeuille.
- **Alertes de retard** : signalement visuel immédiat (⚠️) des projets ayant des tâches ou des jalons dépassés.
- **Alertes de complétude documentaire** : projets bloqués faute de livrable obligatoire.

### 2.2 Filtres et vues
- Filtres par Service pilote (Infrastructures, Systèmes d'information, SIG, Télécom, Numérique éducatif).
- Filtre par Niveau d'envergure (Niveau 1 : Stratégique Ville, Niveau 2 : Projet Pôle, Niveau 3 : Projet de proximité).
- Filtre par Priorité (Urgente, Haute, Moyenne, Basse) et Météo (☀️ Beau fixe, ⛅ Quelques aléas, 🌧️ Projet en difficulté, ⚡ Risque critique).

---

## 3. Cycle de vie d'un projet et jalons de validation

Chaque projet franchit obligatoirement des étapes jalonnées :

```
[Idée / Opportunité]
       │
       ▼
 1. DEMANDE INITIALE ──> Expression des besoins & objectifs
       │
       ▼
 2. ÉTUDE DSI ─────────> Faisabilité technique, budget, architecture
       │
       ▼
 3. ARBITRAGE ─────────> Décision Direction Générale & PMO
       │
       ▼
 4. PLANIFICATION ─────> Découpage WBS, jalons, affectation des ressources
       │
       ▼
 5. EN COURS ──────────> Réalisation, développements, intégration
       │
       ▼
 6. EN RECETTE ────────> Tests métiers, validation d'aptitude
       │
       ▼
 7. EN CLÔTURE ────────> Bilan de fin de projet, retour d'expérience (RETEX)
       │
       ▼
 8. CLÔTURÉ ───────────> Passage en maintenance et exploitation courante
```

> **Contrôle de transition** : Le passage à l'étape suivante n'est déverrouillé que si la checklist documentaire de la phase courante est satisfaite et qu'un commentaire de transition est saisi.

---

## 4. Fiche projet détaillée et ses 10 volets (`/projets/:id`)

Chaque projet dispose d'un espace de travail complet découpé en 10 onglets :

1. **Général** : code unique (ex. `PRJ-2026-014`), titre, objectifs stratégiques, description, budget prévisionnel, météo et barre d'avancement globale.
2. **Acteurs & Rôles** : matrice RACI désignant le Chef de projet, le Commanditaire, le Référent métier, le DPO et les membres de l'équipe.
3. **Planning & Gantt** : planning temporel avec barres horizontales, jalons et dépendances.
4. **Documents** : espace GED versionné classant les livrables par typologie.
5. **Réunions** : calendrier des comités de pilotage (COPIL) et comités techniques (COTEC) avec comptes-rendus.
6. **Revues** : historique des passages en revues de portefeuille avec appréciations du PMO.
7. **Tâches & Actions** : tableau kanban ou liste des tâches de travail associées aux collaborateurs.
8. **Scoring** : calcul dynamique de la valeur stratégique du projet sur 100 points.
9. **Indicateurs** : suivi des KPI métiers (taux d'adoption, gain de productivité, nombre d'usagers formés).
10. **Journal** : fil d'audit chronologique infalsifiable traçant chaque modification, commentaire ou passage d'étape.

---

## 5. Matrice de scoring et priorisation sur 100

Pour objectiver les arbitrages budgétaires, le PMO configure 10 critères d'évaluation pondérés :

- **Alignement stratégique Ville** (poids 15%) : conformité aux priorités du mandat municipal.
- **Gain usager / Modernisation du service public** (poids 15%).
- **Criticité / Urgence réglementaire** (poids 15%) : conformité légale obligatoire à date fixe.
- **Sécurité et conformité RGPD** (poids 10%).
- **Faisabilité technique et maturité** (poids 10%).
- **Impact budgétaire (coût total de possession TCO)** (poids 10%).
- **Disponibilité des ressources DSI et métiers** (poids 10%).
- **Maîtrise des risques et complexité** (poids 5%).
- **Sobriété numérique et impact environnemental** (poids 5%).
- **Pérennité de la solution** (poids 5%).

> **Score consolidé** : un projet obtenant une note ≥ 70 est hautement prioritaire ; entre 40 et 69 il est standard ; en dessous de 40 son opportunité doit être réévaluée.

---

## 6. Planning Gantt, jalons et gestion des dépendances

Le Gantt interactif modélise l'enchaînement logique des activités :

- **Groupes de tâches colorés** : par lot de travail (Cadrage, Déploiement infra, Paramétrage, Formations).
- **Jalons (*Milestones*)** : représentés par des losanges marquant les dates clés (ex. *« Signature du marché »*, *« Mise en préproduction »*, *« Lancement officiel »*).
- **Gestion des dépendances (Liens Fin-à-Début)** : interdiction de démarrer la phase de recette si le déploiement technique n'est pas validé. En cas de décalage d'une tâche parente, les tâches dépendantes sont automatiquement recalculées.

---

## 7. Checklist documentaire et conformité par phase

Pour professionnaliser la gestion de projet, chaque étape impose des livrables types :

| Phase | Documents obligatoires exigés |
|---|---|
| **Demande initiale** | Fiche d'expression de besoins, Note de cadrage sommaire |
| **Étude DSI** | Cahier des charges / CCTP, Analyse d'impact sur la sécurité (AIPD/RGPD), Devis ou chiffrage financier |
| **Arbitrage** | Fiche d'arbitrage validée par la Direction Générale |
| **Planification** | Plan de management de projet (PMP), Grille WBS des tâches, Matrice des risques |
| **En recette** | Cahier de tests de recette, Procès-verbal de recette provisoire (PVRP) signé |
| **Clôture** | Procès-verbal de recette définitive (PVRD), Bilan de projet / RETEX |

---

## 8. Revues de projets périodiques (`/revue-de-projets`)

L'outil d'animation des revues permet au PMO et à la Direction d'examiner collectivement les projets :

- **Ordre du jour automatisé** : sélection des projets à passer en revue (ex. projets en météo pluvieuse ou ayant franchi un jalon majeur).
- **Saisie en séance** : commentaires du PMO, ajustement de la météo, révision des échéances.
- **Génération de tâches de revue** : les décisions prises en séance se traduisent directement par des tâches assignées aux chefs de projets.
- **Diffusion automatique du relevé de revue** par e-mail à tous les participants.

---

## 9. Planning général consolidé (`/planning-general`)

Le planning général consolide sur une même frise chronologique l'ensemble des projets du portefeuille :
- Détection des goulots d'étranglement (périodes d'encombrement où trop de projets prévoient leur mise en production simultanément).
- Visualisation de la charge de travail globale de l'équipe DSI sur les 12 prochains mois.

---

## 10. Journal d'audit global (`/projets-log`)

- Historique chronologique unifié de tous les événements survenus sur l'ensemble des projets.
- Filtres par type d'événement (création, transition d'étape, dépôt de document, alerte retard, modification de jalon).
- Garantie de traçabilité totale pour les comités d'audit.

---

## 11. Interactions avec les autres modules du Hub

| Module | Objet de la passerelle |
|---|---|
| **Rencontres Budgétaires** (`/rencontres-budgetaires`) | Les demandes budgétaires validées sont promues en projets en 1 clic. |
| **Mes Tâches** (`/mes-taches`) | Les tâches assignées dans les projets alimentent la boîte personnelle de l'agent. |
| **Transcript Manager** (`/transcriptmanager`) | Les comptes-rendus de comités de projet transcrits par IA alimentent les actions du projet. |
| **Mes Réunions** (`/mes-reunions`) | Rattachement des ordres du jour et des comités de pilotage au projet correspondant. |
| **Tableau de bord DSI** (`/dsi-dashboard`) | Donut des statuts de projets et indicateurs d'avancement pour la Direction Générale. |

---

## 12. Guide des bonnes pratiques de chefferie de projet

- 💡 **Météo sincère** : La météo n'est pas un jugement de valeur mais un signal d'alerte. Une météo dégradée permet de débloquer des arbitrages managériaux avant qu'il ne soit trop tard.
- 💡 **Mise à jour hebdomadaire** : Actualisez vos tâches et vos jalons chaque semaine avant la revue de projet.
- ⚠️ **Livrables de recette** : Ne validez jamais une étape « Clôturé » sans avoir téléversé le procès-verbal de recette formellement signé par le directeur métier commanditaire.
