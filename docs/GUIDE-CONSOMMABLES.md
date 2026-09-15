# Guide opérationnel — Module Consommables (`/consommables`)

> Documentation fonctionnelle à l'usage des **agents demandeurs, techniciens support et gestionnaires budgétaires** de la collectivité.
> Ce guide décrit le portail de commande de consommables d'impression (toners, tambours, cartouches), le cycle de validation, les commandes groupées fournisseurs et le suivi budgétaire.

---

## Sommaire

1. [Accès et profils utilisateurs](#1-accès-et-profils-utilisateurs)
2. [Passer une commande de consommables (Parcours agent)](#2-passer-une-commande-de-consommables-parcours-agent)
3. [Gestion du panier et récapitulatif](#3-gestion-du-panier-et-récapitulatif)
4. [Cycle de vie d'une demande de consommables](#4-cycle-de-vie-dune-demande-de-consommables)
5. [Espace Gestionnaire / Administration des demandes](#5-espace-gestionnaire--administration-des-demandes)
6. [Notifications et modèles d'e-mails](#6-notifications-et-modèles-de-mails)
7. [Gestion du catalogue et des images](#7-gestion-du-catalogue-et-des-images)
8. [Suivi budgétaire et statistiques](#8-suivi-budgétaire-et-statistiques)
9. [Interactions avec les autres modules](#9-interactions-avec-les-autres-modules)
10. [Bonnes pratiques et questions fréquentes](#10-bonnes-pratiques-et-questions-fréquentes)

---

## 1. Accès et profils utilisateurs

### 1.1 Points d'accès
Le module est accessible via :
- La tuile **Consommables** du DSI Hub (`/consommables`).
- Le lien direct transmis par e-mail lors de la confirmation d'une demande.

### 1.2 Profils et autorisations

| Profil | Périmètre et droits |
|---|---|
| **Agent / Demandeur** (Tout agent connecté) | Consultation du catalogue, constitution d'un panier, soumission de demandes pour son service ou son école, suivi de l'avancement de ses demandes. |
| **Gestionnaire Consommables** (Rôle Admin ou droit spécifique `/consommables`) | Accès à la file de validation, modification des quantités, approbation/rejet, passage en commande fournisseur, archivage, récapitulatif budgétaire, gestion du catalogue et des visuels. |

---

## 2. Passer une commande de consommables (Parcours agent)

Le formulaire guidé permet de commander facilement les références adaptées à son parc d'imprimantes.

### Étape 1 : Informations générales du demandeur
- **Identification** : préremplie automatiquement avec le compte connecté (nom, prénom, e-mail).
- **Rattachement administratif** : sélection de la Direction et du Service (issus du référentiel RH / organigramme) ou sélection de l'École.
- **Référent de livraison et contact téléphonique** : permet au technicien ou au livreur de contacter directement la personne présente sur place.

### Étape 2 : Choix de la technologie et de l'imprimante
- Sélection de la catégorie : *Laser Monochrome*, *Laser Couleur*, *Jet d'encre*, *Traceur grand format*, ou *Pièces de maintenance (bacs, tambours, kits de fusion)*.
- Choix du modèle d'imprimante ou de copieur cible (ex. HP LaserJet Enterprise, Canon imageRUNNER, Brother).

### Étape 3 : Sélection des articles
- Affichage des articles compatibles avec visuel couleur du consommable (cartouche noire, cyan, magenta, jaune).
- Affichage des codes fabricants officiels et des références de commande marché.
- Choix des quantités souhaitées avec contrôle de cohérence pour éviter les surstocks en bureau.

### Étape 4 : Récapitulatif et validation
- Vérification globale des articles, quantités et adresse de livraison.
- Saisie éventuelle d'un commentaire (ex. *bâtiment B, 2e étage, bureau 204*).
- Clic sur **Valider la demande**.

---

## 3. Gestion du panier et récapitulatif

- Le panier est **persistant** dans le navigateur (localStorage) : vous pouvez naviguer dans le catalogue ou quitter la page sans perdre les articles en cours de sélection.
- Un badge numérique sur l'icône du panier indique le nombre total d'articles sélectionnés.
- Possibilité d'ajuster les quantités ou de supprimer une ligne avant envoi définitif.

---

## 4. Cycle de vie d'une demande de consommables

Toute commande suit un flux d'états rigoureux garantissant la traçabilité des dépenses :

```
[Nouvelle demande]
       │
       ▼
   1. À VALIDER (pending) ──────────> [Rejetée] (notification avec motif)
       │
       ▼ (Validation gestionnaire DSI)
   2. VALIDÉE (approved)
       │
       ▼ (Commande groupée passée chez le fournisseur)
   3. COMMANDÉE (ordered)
       │
       ▼ (Livraison effectuée et distribuée)
   4. ARCHIVÉE (archived / delivered)
```

---

## 5. Espace Gestionnaire / Administration des demandes

Les gestionnaires disposent d'un tableau de bord à onglets pour traiter les flux au quotidien :

### 5.1 Onglet « À valider »
- Liste des demandes en attente de décision de la DSI.
- Affichage du demandeur, de son service, de la date de saisie et de la liste des consommables demandés.
- **Actions du gestionnaire** :
  - *Ajuster les quantités* : si une demande est excessive (ex. 5 toners noirs demandés pour un mois), le gestionnaire peut réduire à 1 ou 2 avant validation.
  - *Valider* : déclenche la notification d'acceptation au demandeur et bascule la demande vers les commandes à passer.
  - *Refuser* : saisie obligatoire d'un motif explicatif (ex. *imprimante obsolète en cours de remplacement*, *stock déjà disponible à la DSI*).

### 5.2 Onglet « À commander »
- Regroupe l'ensemble des lignes approuvées.
- Permet d'exporter la liste globale pour passage de bon de commande auprès du titulaire du marché (ex. Lyreco, Inapa, Canon).
- Action **Marquer comme commandée** : associe le numéro de bon de commande ou d'accusé de réception fournisseur.

### 5.3 Onglet « Commandées »
- Suivi des commandes en attente de livraison physique.
- Dès réception des colis à la DSI et livraison sur site, clic sur **Archiver / Livré**.

### 5.4 Onglet « Archivées »
- Historique complet des commandes passées, interrogeable par date, service ou référence de consommable.

---

## 6. Notifications et modèles d'e-mails

Le module émet des e-mails automatiques à chaque étape clé grâce au moteur de templates du Hub :

1. **Confirmation de réception** (`consumable_confirmation`) : envoyé au demandeur dès soumission de son panier avec le récapitulatif de ses choix.
2. **Notification de validation** (`consumable_validated`) : informe l'agent que sa demande est approuvée et va être commandée.
3. **Information de commande passée** (`consumable_ordered`) : prévient le demandeur que le matériel a été commandé au fournisseur et précise les délais indicatifs.
4. **Modification ou refus** (`consumable_modified`) : informe le demandeur de toute modification de quantité ou de tout motif de rejet.

---

## 7. Gestion du catalogue et des images

### 7.1 Importation et mise à jour du catalogue
- **Import Excel** (`/api/consumable/import`) : permet d'intégrer ou de mettre à jour d'un coup le catalogue depuis le bordereau de prix unitaire (BPU) du marché (`BONDECOMMANDE.xlsx`).
- **Création unitaire** : ajout direct d'une nouvelle référence d'imprimante ou d'un nouveau consommable.
- **Sécurité anti-suppression** : un article ayant déjà fait l'objet d'une commande passée ne peut être supprimé pour préserver l'historique comptable.

### 7.2 Gestionnaire d'images (`DesignationImagesManager`)
- Permet d'associer un visuel clair à chaque référence (photo du packaging constructeur ou de la cartouche).
- Facilite le repérage visuel pour les agents non techniciens.

---

## 8. Suivi budgétaire et statistiques

L'onglet **Récapitulatif budgétaire** fournit des métriques indispensables au dialogue de gestion :

- **Indicateurs financiers** :
  - Dépenses totales consommables engagées sur l'année civile en cours.
  - Répartition mensuelle des montants TTC commandés.
  - Montant moyen par commande.
- **Top consommations** :
  - Classement des directions et services les plus consommateurs.
  - Top 10 des références les plus commandées (analyse pour négociation de tarifs volumiques lors du renouvellement de marché).
- **Badge Accueil** : le nombre de commandes en attente de validation alimente le badge d'alerte sur la tuile du Hub.

---

## 9. Interactions avec les autres modules

| Module | Rôle dans l'écosystème |
|---|---|
| **Copieurs** (`/copieurs`) | Distinction claire : les consommables des copieurs multifonctions sous contrat de maintenance sont gérés automatiquement via les relevés de compteurs ; le module Consommables gère les imprimantes autonomes de proximité et les traceurs. |
| **Budget & Finances** (`/budget`) | Rapprochement des commandes groupées avec les lignes budgétaires d'achat de fournitures. |
| **RH / Organigramme** (`/rh`) | Alimentation de la liste déroulante des directions, services et sites de livraison. |
| **Messagerie & Templates** (`/admin/mail`) | Personnalisation des textes d'e-mails et suivi des logs d'envoi. |

---

## 10. Bonnes pratiques et questions fréquentes

- 💡 **Regroupement des commandes** : Il est recommandé de commander par pack complet (Noir + Couleurs) lorsque les niveaux d'encre descendent en dessous de 15% plutôt que de passer une commande unitaire par toner.
- 💡 **Cartouches usagées** : Les emballages des nouveaux consommables doivent être réutilisés pour y déposer les cartouches vides afin qu'elles soient reprises par la filière de recyclage municipale.
- ❓ *Pourquoi ma référence n'apparaît pas dans la liste ?*
  Si votre imprimante est récente ou n'a jamais été répertoriée, contactez l'administrateur du support via un ticket d'assistance pour faire référencer le modèle dans le catalogue.
