# Guide — Tableau de bord Statistiques des Tickets (`/tickets/stats`)

> Documentation fonctionnelle du **tableau de bord statistique** du helpdesk (« Statistiques du helpdesk »).
> À l'usage des **techniciens, superviseurs et administrateurs** : à quoi sert chaque indicateur et comment le lire.

---

## 1. À quoi sert cet écran

`/tickets/stats` est le **tableau de bord de pilotage** du support : volumes, délais, charge des techniciens, respect des SLA, tendances. Il sert à :

- mesurer l'activité (combien de tickets, créés/résolus, à quel rythme) ;
- repérer les **points de tension** (backlog qui grossit, SLA violés, surcharge d'un technicien) ;
- alimenter le **reporting** (revues de service, bilans).

L'écran est en **lecture seule** : il n'agit pas sur les tickets, il les analyse.

---

## 2. Les filtres (en haut de page)

### 2.1 La période
Quatre modes :

| Mode | Effet |
|---|---|
| **Tout** | Tous les tickets, sans borne de date. |
| **Année** | Tickets de l'année sélectionnée. |
| **Mois** | Tickets du mois sélectionné. |
| **Période** | Fenêtre **glissante** : Aujourd'hui · 7 derniers jours · 30 derniers jours · 90 derniers jours. |

### 2.2 Le groupe assigné
Permet de restreindre l'analyse à un **groupe** (équipe) précis — ou « 👥 Tous les groupes ».

### 2.3 Le principe de comparaison
Quand un filtre (période et/ou groupe) est actif, les indicateurs affichent **deux valeurs** :

> **valeur filtrée**  `/ valeur globale (en gris)`

La valeur grise est le **référentiel global** (tous les tickets, hors filtre). Cela permet de situer la période/le groupe par rapport à l'ensemble (ex. « 12 ouverts sur cette semaine / 87 ouverts au total »).

---

## 3. Les indicateurs clés (cartes du haut)

Six cartes synthétiques, chacune comparée au global :

| Carte | Ce qu'elle mesure | Lecture |
|---|---|---|
| **Ouverts** | Tickets non terminés (sous-titre : nombre « en cours »). | Le stock de travail à traiter. |
| **Critiques** | Tickets ouverts de **priorité 5**. | L'urgence à surveiller en priorité. |
| **Résolus / jour (moy.)** | Moyenne quotidienne de tickets résolus. | La **capacité de traitement** de l'équipe. |
| **VIP ouverts** | Tickets ouverts d'usagers **VIP** (élus / directions). | Les dossiers sensibles en cours. |
| **SLA violés** | Tickets ayant dépassé un engagement de délai. | Le respect des engagements de service. |
| **Résolution moy.** | Durée moyenne de résolution (**temps ouvré**, voir §6). | La rapidité de traitement. |

---

## 4. Les graphiques et tableaux

### 4.1 Tendance (créés / résolus / backlog)
Graphique combiné sur la période :
- **histogramme / aire** = tickets **créés** ;
- **ligne verte** = tickets **résolus** (par jour ou par mois selon la granularité) ;
- **ligne orange (axe de droite)** = tickets **ouverts (backlog)** ;
- un **fond grisé** peut figurer la période de comparaison.

**Lecture :** si la ligne verte (résolus) reste sous l'histogramme (créés) durablement, le **backlog s'accumule**.

### 4.2 Répartition par statut
Camembert de la distribution des tickets par **statut** (Nouveau, En cours, En attente, Résolu, Clos…). Vue de l'état global du flux.

### 4.3 Par type
Camembert **Incident vs Demande** (et autres types). Indique la nature de la charge.

### 4.4 Priorités (ouverts)
Barres horizontales du nombre de tickets **ouverts par priorité**. Repère la proportion d'urgences.

### 4.5 Statut SLA
Camembert de l'état des **engagements de délai** (dans les temps / à risque / dépassés).

### 4.6 Catégories les plus sollicitées
Top 10 des **catégories** générant le plus de tickets. Aide à identifier les sujets récurrents (et les chantiers de fond à lancer).

### 4.7 Charge par technicien (ouverts)
Tableau **Technicien · Tickets · Charge** : le nombre de tickets ouverts par technicien, avec une barre de charge. Sert à **équilibrer** la répartition du travail.

### 4.8 Répartition par groupe assigné
Barres du volume par **groupe/équipe**. *Indicateur global* (tous les tickets ouverts, indépendant du filtre de période).

### 4.9 Âge du backlog
Barres de la **répartition des tickets ouverts par tranche d'ancienneté**. Met en évidence les tickets qui **traînent**.

### 4.10 Création par heure
Aire de la **distribution horaire** des créations de tickets. Aide à dimensionner les **plages de présence** du support.

### 4.11 Temps de résolution (30 derniers jours)
Courbe du **temps ouvré moyen** de résolution jour par jour. Suit l'évolution de la **réactivité** dans le temps.

### 4.12 Top demandeurs
Tableau **Demandeur · Tickets** : les usagers qui sollicitent le plus le support (court). Une version étendue **Top 15 demandeurs** existe plus bas.

### 4.13 Activité hebdomadaire
Vue de l'activité agrégée par **semaine**.

### 4.14 Réouvertures (30 jours)
Compteur des **tickets rouverts** sur 30 jours. Un nombre élevé signale des **résolutions incomplètes** (qualité à surveiller).

### 4.15 Vue d'ensemble
Tableau **récapitulatif** chiffré (totaux clés : ouverts, résolus, SLA violés…), pratique pour une lecture rapide ou un copier-coller en bilan.

### 4.16 Créations hebdomadaires (90 jours)
Aire des **volumes créés par semaine** sur 90 jours : la tendance de fond de la demande.

### 4.17 Top 15 demandeurs (détaillé)
Tableau **Demandeur · Total · Ouverts · Résol. moy.** : qui sollicite le plus, et avec quel temps de résolution moyen.

### 4.18 Logiciels les plus demandés
Top 12 des **logiciels / applications** concernés par les tickets. Révèle les outils les plus problématiques (cibles de formation ou de remédiation).

### 4.19 Performance des techniciens
Tableau **Technicien · Tickets · … · Temps moy.** : volume traité et **temps moyen de résolution** par technicien. Outil d'animation d'équipe (à manier avec discernement : le contexte des tickets diffère).

---

## 5. Comment lire le tableau de bord (exemples)

- **Le backlog grossit ?** → §4.1 (résolus < créés) + §4.9 (tickets anciens) + §4.7 (surcharge ?).
- **Des engagements non tenus ?** → KPI « SLA violés » + §4.5 (Statut SLA).
- **Où porter l'effort de fond ?** → §4.6 (catégories) + §4.18 (logiciels) : les sujets récurrents méritent une procédure, un article de connaissance ou une correction.
- **Qualité du support ?** → §4.14 (réouvertures) + §4.11 (temps de résolution).
- **Dimensionner l'équipe ?** → §4.10 (heures de pointe) + §4.16 (tendance de la demande).

---

## 6. Notions clés

- **Backlog** : ensemble des tickets **ouverts** (non terminés) à un instant donné.
- **Temps ouvré** : délai entre la création et la résolution, **hors périodes « En attente »**, exprimé en jours/heures. C'est une mesure **juste** du temps de traitement réel (on ne compte pas l'attente d'une réponse du demandeur). Les barres grises accompagnant certaines courbes indiquent le **nombre de tickets résolus** servant à calculer la moyenne (pour relativiser un point isolé).
- **SLA violé** : ticket ayant dépassé un engagement de délai (première réponse ou résolution). Le SLA est **suspendu** pendant l'état « En attente ».
- **Comparaison globale** : la valeur grise « / N » est le total tous tickets, indépendant du filtre — un repère de proportion.
- **VIP** : usagers prioritaires (élus, directions) définis dans l'administration.

---

*Pour le traitement des tickets, voir le **Guide technicien** (`GUIDE-TECHNICIEN-TICKETS.md`). Pour le paramétrage, voir le **Guide administrateur** (`GUIDE-ADMIN-TICKETS.md`).*
