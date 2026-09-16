# Guide opérationnel — Module Calendrier DSI (`/calendrier-dsi`)

> Documentation organisationnelle et opérationnelle à l'usage des **agents, techniciens de permanence, encadrants et responsables de pôles DSI**.
> Ce guide détaille l'agenda partagé de la DSI : suivi des présences, télétravail, permanences de hotline, chantiers de déploiement, fenêtres de maintenance applicative, cumul mensuel de télétravail et diffusion automatique du calendrier quotidien.

---

## Sommaire

1. [Rôle du calendrier opérationnel](#1-rôle-du-calendrier-opérationnel)
2. [Vues du calendrier et filtres thématiques (`/calendrier-dsi`)](#2-vues-du-calendrier-et-filtres-thématiques-calendrier-dsi)
3. [Typologie des événements et codes couleurs](#3-typologie-des-événements-et-codes-couleurs)
4. [Gestion de la hotline et des permanences techniques](#4-gestion-de-la-hotline-et-des-permanences-techniques)
5. [Télétravail, absences et synchronisation RH (Demabs)](#5-télétravail-absences-et-synchronisation-rh-demabs)
6. [Graphique de cumul de télétravail mensuel](#6-graphique-de-cumul-de-télétravail-mensuel)
7. [Gestion des agents DSI et paramétrages (`/calendrier-dsi/agents`)](#7-gestion-des-agents-dsi-et-paramétrages-calendrier-dsiagents)
8. [Automatisation du courriel « Calendrier DSI du jour »](#8-automatisation-du-courriel-calendrier-dsi-du-jour)
9. [Interactions avec les autres modules du Hub](#9-interactions-avec-les-autres-modules-du-hub)
10. [Bonnes pratiques d'organisation pour l'équipe](#10-bonnes-pratiques-dorganisation-pour-léquipe)

---

## 1. Rôle du calendrier opérationnel

Le module Calendrier DSI n'est pas un agenda personnel standard : c'est la **tour de contrôle opérationnelle de la direction**. Il consolide en une vue unique toutes les informations nécessaires à la continuité de service informatique de la collectivité :
- Qui est présent physiquement au bureau pour accueillir les usagers et intervenir dans les services ?
- Qui est en télétravail aujourd'hui ?
- Qui assure la permanence téléphonique de la hotline ce matin et cet après-midi ?
- Quelles opérations techniques à risque (coupures réseau, maintenances logicielles, déploiements d'envergure) sont planifiées ?

---

## 2. Vues du calendrier et filtres thématiques (`/calendrier-dsi`)

L'interface offre une grande fluidité de consultation :

### 2.1 Modes d'affichage
- **Vue Semaine ouvrée (5 jours)** : vue par défaut du lundi au vendredi, découpée par tranches matin / après-midi.
- **Vue 7 jours** : inclut le week-end (essentielle pour les astreintes et les maintenances lourdes planifiées le samedi/dimanche).
- **Vue Mois** : vision macroscopique facilitant l'anticipation des congés scolaires et des ponts.

### 2.2 Filtres rapides
Des boutons d'activation/désactivation permettent d'isoler en un clic une catégorie d'événements (ex. masquer les absences pour ne voir que les déploiements et la hotline).

---

## 3. Typologie des événements et codes couleurs

Chaque activité est immédiatement identifiable grâce à son code couleur harmonisé :

| Catégorie | Couleur | Signification et règles d'usage |
|---|---|---|
| **Absence** | 🔴 Rouge / Rose | Congés annuels, RTT, récupération, formation, maladie. Indique que l'agent est injoignable. |
| **Télétravail** | 🟣 Violet | Travail à distance (domicile). L'agent est joignable par Teams, messagerie et téléphone pro. |
| **Hotline** | 🟡 Jaune / Ambre | Permanence de support téléphonique et guichet Helpdesk attribuée à un technicien. |
| **Déplacement** | 🔵 Bleu clair | Intervention technique sur site distant (écoles, gymnases, mairies annexes, CTM). |
| **Déploiement** | 🟢 Vert émeraude | Livraison, installation massive de postes, remplacement de copieurs, câblage. |
| **Maintenance** | 🟠 Orange | Fenêtre d'intervention sur un serveur, coupure réseau programmée ou mise à jour MagApp. |
| **Réunion** | ⚪ Bleu ardoise | Comités de pilotage, réunions d'équipe DSI, commissions municipales. |

---

## 4. Gestion de la hotline et des permanences techniques

Pour garantir que la ligne du support téléphonique de la collectivité est toujours couverte :

### 4.1 Répartition matin / après-midi
- Chaque journée est découpée en deux vacations distinctes : **Matin (8h30 - 12h30)** et **Après-midi (13h30 - 17h30)**.
- Le nom du technicien de permanence est affiché en évidence avec le numéro abrégé du poste hotline.

### 4.2 Semaines paires / impaires et permutations
- La grille par défaut alterne automatiquement les techniciens selon la parité de la semaine civile (semaines paires vs impaires).
- **Permutations ponctuelles (*Overrides*)** : en cas d'absence imprévue ou d'échange de créneau entre collègues, un gestionnaire peut modifier la permanence d'une demi-journée spécifique sans dérégler la matrice récurrente annuelle.

---

## 5. Télétravail, absences et synchronisation RH (Demabs)

Le calendrier évite toute double saisie fastidieuse :

- **Télétravail récurrent (Jours fixes)** : les agents ayant un forfait de télétravail fixe (ex. tous les mardis et jeudis) voient leurs créneaux reconduits automatiquement chaque semaine.
- **Synchronisation Demabs (RH)** : les demandes de congés et RTT validées dans le progiciel RH communal sont importées automatiquement.
- **Distinction des statuts** :
  - ⏳ *En attente de visa* : affiché avec liseré hachuré indiquant une absence prévisionnelle non encore validée par le chef de service.
  - ✅ *Validé* : absence officielle confirmée.

---

## 6. Graphique de cumul de télétravail mensuel

Le module intègre un outil de contrôle de conformité avec l'accord-cadre municipal de télétravail :

- **Histogramme interactif** : affiche le nombre de jours télétravaillés par mois pour chaque agent.
- **Alerte de dépassement** : mise en évidence visuelle si un agent dépasse le plafond réglementaire autorisé de jours de télétravail par mois ou par semaine.
- Export possible pour le bilan social et le dialogue de gestion avec la DRH.

---

## 7. Gestion des agents DSI et paramétrages (`/calendrier-dsi/agents`)

Cette page d'administration répertorie les collaborateurs de la direction :

- **Fiche agent** : nom, prénom, identifiant AD, adresse e-mail, service DSI d'appartenance, matricule RH (clé de liaison avec Demabs).
- **Configuration individuelle** :
  - Définition des jours fixes de télétravail hebdomadaires.
  - Saisie des absences permanentes (ex. temps partiel à 80% le mercredi).
  - Éligibilité à la rotation de la hotline (oui/non).

---

## 8. Automatisation du courriel « Calendrier DSI du jour »

Chaque matin à **8h00**, le système expédie automatiquement un courriel de synthèse à toute l'équipe DSI :

- **Objet dynamique** : `[DSI] Calendrier du jour - Mardi 16 Septembre 2026`.
- **Contenu structuré** :
  - 📞 **Hotline du jour** : nom des techniciens du matin et de l'après-midi.
  - 🏠 **Agents en télétravail** aujourd'hui.
  - 🌴 **Agents absents** (congés, formations).
  - 🔧 **Maintenances et chantiers prévus** sur la journée avec heures d'impact éventuel.
- Permet à chacun de prendre connaissance de la composition de l'équipe dès son arrivée.

---

## 9. Interactions avec les autres modules du Hub

| Module | Nature de la synchronisation |
|---|---|
| **Magasin d'applications** (`/admin/magapp`) | Les fenêtres de maintenance planifiées sur les logiciels métiers apparaissent directement sur le calendrier DSI. |
| **Active Directory / RH** (`/rh`) | Référentiel des utilisateurs et synchronisation des congés Demabs. |
| **Tableau de bord DSI** (`/dsi-dashboard`) | Widget affichant la permanence hotline en direct sur l'écran d'accueil du kiosque. |
| **Automatisation e-mail** (`/admin/email-automation`) | Moteur d'envoi du briefing matinal quotidien. |

---

## 10. Bonnes pratiques d'organisation pour l'équipe

- 💡 **Permutations de hotline** : Tout échange de permanence doit être validé avec le collègue concerné et répercuté sur le calendrier la veille au plus tard.
- 💡 **Déplacements longs** : Indiquez toujours le site de destination et un numéro de portable joignable lors des interventions extérieures supérieures à une demi-journée.
- ⚠️ **Maintenances critiques** : Toute intervention sur des serveurs de production en journée doit faire l'objet d'un accord préalable du chef de pôle et être inscrite au calendrier au moins 48 heures à l'avance.
