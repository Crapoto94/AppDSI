# Guide opérationnel — Module Notes & Doctrines (`/doctrines`)

> Documentation organisationnelle et méthodologique à l'usage des **ingénieurs, techniciens, chefs de projets et administrateurs de la DSI**.
> Ce guide détaille la base de connaissances et de gouvernance interne : publication des doctrines d'architecture, chartes de sécurité, notes de service techniques et modes opératoires standardisés de la direction.

---

## Sommaire

1. [Objet et philosophie des doctrines DSI](#1-objet-et-philosophie-des-doctrines-dsi)
2. [Accès et consultation des doctrines (`/doctrines`)](#2-accès-et-consultation-des-doctrines-doctrines)
3. [Moteur de recherche plein texte](#3-moteur-de-recherche-plein-texte)
4. [Rédaction et mise en page enrichie (Éditeur WYSIWYG)](#4-rédaction-et-mise-en-page-enrichie-éditeur-wysiwyg)
5. [Catégorisation et taxonomie des notes](#5-catégorisation-et-taxonomie-des-notes)
6. [Cycle de vie, mises à jour et historisation](#6-cycle-de-vie-mises-à-jour-et-historisation)
7. [Interactions avec les autres modules du Hub](#7-interactions-avec-les-autres-modules-du-hub)
8. [Guide de style et bonnes pratiques de formalisation](#8-guide-de-style-et-bonnes-pratiques-de-formalisation)

---

## 1. Objet et philosophie des doctrines DSI

Le module Notes & Doctrines est la **mémoire technique et organisationnelle** de la DSI. Il vise à formaliser les règles du jeu, les choix d'architecture et les standards opérationnels pour éviter l'éparpillement de l'information dans des documents Word isolés sur des disques réseaux.

### 1.1 Qu'est-ce qu'une « Doctrine » ?
Une doctrine est une prise de position technique ou méthodologique claire qui s'impose aux équipes de la DSI et aux prestataires externes :
- *Exemples* : « Standard de virtualisation des serveurs », « Politique de nommage des équipements réseau », « Règle de rétention des sauvegardes », « Politique d'attribution des équipements mobiles », « Procédure de déploiement des correctifs de sécurité ».

---

## 2. Accès et consultation des doctrines (`/doctrines`)

### 2.1 Navigation
- Accessible d'un clic depuis le menu principal ou la tuile **Notes & doctrines** du Hub.
- Présentation sous forme de cartes synthétiques affichant :
  - Le titre clair de la doctrine.
  - La catégorie thématique (badge coloré).
  - La date d'effet ou de dernière validation.
  - L'auteur (nom et prénom de l'agent ayant rédigé la note).
  - Un extrait du contenu.

### 2.2 Lecture d'une note
Un clic sur une carte ouvre la note en pleine largeur avec mise en page structurée (titres, paragraphes, listes à puces, tableaux, blocs de code, liens hypertextes).

---

## 3. Moteur de recherche plein texte

Un champ de recherche instantané en haut de page filtre en temps réel les cartes affichées :
- La recherche s'exécute simultanément sur le **titre**, le **corps complet du texte** (y compris le contenu HTML) et la **catégorie**.
- Permet à un technicien sur le terrain de trouver en quelques secondes le standard ou la consigne applicable à une situation donnée (ex. en tapant *« VLAN »*, *« mot de passe »*, *« master »* ou *« rétention »*).

---

## 4. Rédaction et mise en page enrichie (Éditeur WYSIWYG)

L'ajout ou la modification d'une doctrine s'effectue via un éditeur visuel puissant (Quill) :

- **Titre concis et explicite** (ex. *« Doctrine DSI-012 : Politique de gestion des habilitations administrateurs »*).
- **Date de la doctrine** : date officielle de prise d'effet.
- **Catégorie** : choix parmi les catégories existantes ou saisie d'une nouvelle catégorie libre.
- **Barre d'outils de formatage** :
  - Niveaux de titres (Titre 1, Titre 2).
  - Gras, italique, souligné, barré.
  - Listes à puces et listes numérotées.
  - Blocs de citations et encadrés d'avertissement.
  - Blocs de code préformatés pour les commandes PowerShell / Bash.
  - Tableaux et liens cliquables.

---

## 5. Catégorisation et taxonomie des notes

Pour garantir une bonne lisibilité du référentiel, il est recommandé de respecter les catégories standards suivantes :

| Catégorie | Périmètre couvert |
|---|---|
| **Architecture SI** | Principes d'urbanisation du système d'information, choix de socles technologiques, hébergement. |
| **Sécurité & SSI** | Politiques de mots de passe, segmentation réseau, gestion des comptes à privilèges, chiffrement, RGPD. |
| **Infrastructures & Réseaux** | Adressage IP, plan de nommage des switchs, règles de brassage, gestion du Wi-Fi communal. |
| **Poste de travail & Proximité** | Masters Windows, socle d'applications bureautiques, gestion des droits locaux, politique d'écrans. |
| **Procédures d'exploitation** | Tâches de maintenance récurrentes, vérification des sauvegardes, procédures d'escalade d'astreinte. |
| **Gouvernance & Méthodes** | Organisation des comités, gestion de projet, processus d'achat informatique. |

---

## 6. Cycle de vie, mises à jour et historisation

Toute doctrine est un document vivant :

1. **Publication initiale** : rédigée par un expert technique ou un chef de projet, relue et validée par le responsable de service.
2. **Révision périodique** : modification directe du texte lors de l'évolution des outils ou des normes réglementaires. La date de dernière modification et l'auteur de la mise à jour sont conservés.
3. **Archivage / Dépréciation** : si une doctrine devient obsolète suite au remplacement d'une technologie, elle peut être supprimée ou annotée avec mention de la nouvelle doctrine de substitution.

---

## 7. Interactions avec les autres modules du Hub

- **Portefeuille Projets** (`/portefeuille-projets`) : tout nouveau projet doit citer et respecter les doctrines en vigueur dès la phase d'étude d'architecture.
- **Tickets & Support** (`/tickets`) : les techniciens peuvent lier une doctrine dans la solution documentée d'un ticket pour justifier une règle auprès d'un usager.
- **Administration** : référence documentaire lors de l'accueil et de l'onboarding des nouveaux agents DSI.

---

## 8. Guide de style et bonnes pratiques de formalisation

- 💡 **Structure recommandée** :
  1. *Contexte & Objectif* (pourquoi cette règle existe).
  2. *Périmètre d'application* (qui et quoi est concerné).
  3. *Règle impérative* (ce qui doit être fait / ce qui est strictement interdit).
  4. *Procédure opérationnelle* (comment l'appliquer pas à pas).
  5. *Dérogations éventuelles* (qui peut autoriser une exception et comment la documenter).
- 💡 **Clarté et concision** : Privilégiez des phrases courtes, des listes d'actions ordonnées et des captures d'écran d'illustration.
- ⚠️ **Règles applicables** : Une doctrine publiée engage l'ensemble de la DSI. Veillez à la faire valider par le Directeur des Systèmes d'Information avant diffusion.
