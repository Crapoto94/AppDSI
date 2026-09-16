# Guide opérationnel — Module MagApp (`/admin/magapp`)

> Documentation fonctionnelle et d'administration à l'usage des **administrateurs du système d'information, chefs de projets applicatifs et référents métiers**.
> Ce guide détaille la gestion du Magasin d'applications de la collectivité : catalogue des logiciels métiers, documentation usager, annonces de maintenance planifiée, suivi de fréquentation et modération de la boîte à idées.

---

## Sommaire

1. [Rôle du Magasin d'applications (MagApp)](#1-rôle-du-magasin-dapplications-magapp)
2. [Écosystème à double interface (Portail Agent vs Administration)](#2-écosystème-à-double-interface-portail-agent-vs-administration)
3. [Gestion du catalogue des applications métiers](#3-gestion-du-catalogue-des-applications-métiers)
4. [Catégories thématiques et attribution des chefs de projets DSI](#4-catégories-thématiques-et-attribution-des-chefs-de-projets-dsi)
5. [Base documentaire usager (Guides PDF, Liens, Vidéos)](#5-base-documentaire-usager-guides-pdf-liens-vidéos)
6. [Gestion des maintenances planifiées et alertes usagers](#6-gestion-des-maintenances-planifiées-et-alertes-usagers)
7. [Droits d'accès et visibilité par groupes Active Directory](#7-droits-daccès-et-visibilité-par-groupes-active-directory)
8. [Statistiques d'utilisation, favoris et clics](#8-statistiques-dutilisation-favoris-et-clics)
9. [Boîte à idées et boîte à suggestions des agents](#9-boîte-à-idées-et-boîte-à-suggestions-des-agents)
10. [Interactions avec les autres modules du Hub DSI](#10-interactions-avec-les-autres-modules-du-hub-dsi)
11. [Recommandations pour la valorisation du catalogue](#11-recommandations-pour-la-valorisation-du-catalogue)

---

## 1. Rôle du Magasin d'applications (MagApp)

Le Magasin d'applications (MagApp) est le **portail d'accès unique des agents municipaux à tous leurs outils de travail numériques**. Il élimine l'éparpillement des raccourcis sur le bureau Windows et offre une vitrine claire des progiciels métiers de la Ville (Comptabilité, Paie/RH, État Civil, Enfance/Scolaire, Urbanisme, Services Techniques, Police Municipale, etc.).

---

## 2. Écosystème à double interface (Portail Agent vs Administration)

L'architecture MagApp repose sur deux composants complémentaires :
1. **Le portail agent simplifié (`magapp-frontend`)** : interface épurée et conviviale où chaque agent consulte ses applications autorisées, lance ses logiciels d'un clic, met ses outils favoris en avant, consulte les guides d'utilisation et soumet des idées.
2. **L'administration MagApp (`/admin/magapp`)** : console réservée aux chefs de projets DSI et administrateurs pour piloter le catalogue, paramétrer les URL, planifier les coupures et modérer les propositions des agents.

---

## 3. Gestion du catalogue des applications métiers

Depuis l'écran d'administration `/admin/magapp` :

### 3.1 Création et paramétrage d'une fiche application
- **Nom du logiciel** (ex. *Civil Net RH, Sedit Finances, Concerto Enfance, Oxalis État Civil, Marco Marchés*).
- **URL de production** : lien web sécurisé (HTTPS) ouvrant l'application.
- **URL de test / préproduction** : lien vers l'environnement de recette réservé aux équipes DSI et aux référents métiers.
- **Icône dynamique** : sélection d'une icône explicite parmi la bibliothèque Lucide Icons.
- **Description claire** : explication en deux phrases de la finalité de l'outil pour les agents nouvellement recrutés.
- **Chef de projet DSI référent** : nom de l'ingénieur ou technicien responsable du bon fonctionnement du logiciel.

---

## 4. Catégories thématiques et attribution des chefs de projets DSI

Les logiciels sont regroupés par grands domaines d'activité :
- *Ressources Humaines & Paie*
- *Finances, Comptabilité & Marchés Publics*
- *Citoyenneté, Élections & État Civil*
- *Famille, Petite Enfance & Éducation*
- *Aménagement, Urbanisme & Foncier*
- *Services Techniques & Propreté*
- *Police Municipale & Sécurité*
- *Bureautique & Outils transverses*

---

## 5. Base documentaire usager (Guides PDF, Liens, Vidéos)

Pour chaque application, les chefs de projets peuvent enrichir un espace d'aide intégré :
- **Guides méthodologiques et notices pas à pas (PDF)** téléchargeables d'un clic.
- **Tutoriels vidéo** (liens YouTube ou flux vidéo internes).
- **Liens vers la documentation officielle de l'éditeur**.
- Réduit considérablement le nombre de tickets d'assistance de premier niveau.

---

## 6. Gestion des maintenances planifiées et alertes usagers

Lorsqu'une mise à jour logicielle ou une maintenance sur les serveurs de bases de données est programmée :

### 6.1 Publication d'une maintenance
- **Dates et horaires de la coupure** (début et fin prévisionnelle).
- **Message d'information à l'usager** (ex. *« L'application Concerto sera indisponible le jeudi 18 septembre de 12h30 à 14h00 pour déploiement de la version 2026.3 »*).
- **Conséquences opérationnelles** : pastille d'avertissement jaune ou rouge sur la tuile du logiciel sur le portail agent, empêchant les saisies à risque pendant les opérations techniques.
- **Pièce jointe technique** : notes de version de l'éditeur ou fiche d'impact.

---

## 7. Droits d'accès et visibilité par groupes Active Directory

Toutes les applications ne sont pas destinées à tous les agents :
- Possibilité d'associer un ou plusieurs **groupes de sécurité Active Directory** à une fiche application.
- Un agent ne voit sur son portail MagApp que les logiciels correspondant à son métier et à ses habilitations.
- Option « DSI Only » pour les outils de supervision réservés aux informaticiens.

---

## 8. Statistiques d'utilisation, favoris et clics

L'administration fournit des indicateurs objectifs de fréquentation :
- **Nombre de clics et fréquence de lancement** de chaque logiciel.
- **Timeline chronologique d'utilisation** : repérage des pics d'activité journaliers ou mensuels.
- **Palmarès des favoris** : applications les plus souvent épinglées par les collaborateurs.
- Permet de mesurer l'adoption réelle d'un nouvel outil après son déploiement.

---

## 9. Boîte à idées et boîte à suggestions des agents

MagApp intègre un espace collaboratif de recueil d'idées :
- Les agents municipaux peuvent suggérer des améliorations ergonomiques, des automatisations ou de nouvelles fonctionnalités pour leurs outils.
- **Console de modération DSI** :
  - Statuts d'instruction : *Nouvelle idée*, *En étude*, *Retenue*, *Rejetée (avec motif)*, *Déployée*.
  - Les propositions retenues peuvent être basculées directement vers le Backlog ou le Portefeuille Projets.

---

## 10. Interactions avec les autres modules du Hub DSI

| Module en lien | Nature de l'échange |
|---|---|
| **Tickets & Support** (`/tickets`) | Rapprochement des incidents par application et affichage des tickets récents sur la fiche logicielle. |
| **Contrats** (`/contrats`) | Rapprochement direct entre l'application et son marché de maintenance/licence. |
| **Calendrier DSI** (`/calendrier-dsi`) | Les maintenances planifiées dans MagApp s'affichent automatiquement sur l'agenda de l'équipe DSI. |
| **Active Directory** (`/admin/ad`) | Résolution des identités usagers et filtrage des visibilités par groupe de sécurité. |

---

## 11. Recommandations pour la valorisation du catalogue

- 💡 **Clarté des intitulés** : Privilégiez des titres orientés usage (ex. *« Concerto - Gestion Scolaire & Cantine »* plutôt que le seul sigle éditeur).
- 💡 **Anticipation des maintenances** : Publiez les avis de maintenance au moins **72 heures à l'avance** pour permettre aux services d'adapter leur planning d'accueil du public.
- 💡 **Valorisation des nouveautés** : Mettez à jour le badge de version lors de chaque livraison majeure pour inciter les agents à consulter les notes d'évolution.
