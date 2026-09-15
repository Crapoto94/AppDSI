# Guide opérationnel — Module Stocks (`/stocks`)

> Documentation fonctionnelle et opérationnelle à l'usage des **techniciens, gestionnaires de magasins et administrateurs** de la DSI.
> Ce guide détaille la gestion multi-magasins du matériel informatique, le suivi des entrées/sorties avec signature électronique, la gestion des numéros de série et des prêts, ainsi que la configuration des modèles de bons de livraison.

---

## Sommaire

1. [Accès, magasins et rôles](#1-accès-magasins-et-rôles)
2. [Vue d'ensemble du Dashboard](#2-vue-densemble-du-dashboard)
3. [Réception de matériel (Entrées en stock)](#3-réception-de-matériel-entrées-en-stock)
4. [Saisie et suivi des numéros de série](#4-saisie-et-suivi-des-numéros-de-série)
5. [Sortie de matériel et signature du Bon de Livraison (BL)](#5-sortie-de-matériel-et-signature-du-bon-de-livraison-bl)
6. [Gestion des prêts de matériel](#6-gestion-des-prêts-de-matériel)
7. [Mouvements manuels, transferts et ajustements d'inventaire](#7-mouvements-manuels-transferts-et-ajustements-dinventaire)
8. [Prévisions de consommation et alertes de rupture](#8-prévisions-de-consommation-et-alertes-de-rupture)
9. [Administration du module (`/stocks/admin`)](#9-administration-du-module-stocksadmin)
10. [Interactions avec les autres modules du Hub DSI](#10-interactions-avec-les-autres-modules-du-hub-dsi)
11. [Bonnes pratiques et astuces de dépannage](#11-bonnes-pratiques-et-astuces-de-dépannage)

---

## 1. Accès, magasins et rôles

### 1.1 Points d'accès
Le module est accessible depuis :
- Le menu de navigation principal et la tuile **Gestion des stocks** (`/stocks`).
- Les sous-pages dédiées :
  - Réception : `/stocks/reception`
  - Saisie de séries : `/stocks/series`
  - Sortie et signature : `/stocks/sortie`
  - Gestion des prêts : `/stocks/prets` (ou `/prets`)
  - Administration du module : `/stocks/admin`

### 1.2 Organisation multi-magasins
Le matériel n'est pas stocké en vrac : il est partitionné par **Magasins** étanches (ex. *DSI Informatique*, *DSI Mobilité*, *Stock Écoles*, *Réserve Réseau*). Chaque magasin dispose de ses propres emplacements physiques, de ses seuils d'alerte et de sa liste de membres autorisés.

### 1.3 Rôles au sein d'un magasin
L'accès et les actions possibles sont régis par le rôle de l'agent dans le magasin sélectionné :

| Rôle | Consultation | Mouvements (Entrées/Sorties/Prêts) | Administration du magasin |
|---|---|---|---|
| **Viewer** (Consultant) | ✅ Niveaux de stock, historique des mouvements, prévisions | ❌ Aucune action d'écriture | ❌ |
| **Operator** (Opérateur) | ✅ Niveaux, mouvements, alertes | ✅ Réceptions, sorties avec BL, prêts, ajustements | ❌ |
| **Manager** (Responsable) | ✅ Accès complet | ✅ Tous mouvements et dérogations | ✅ Gestion des membres, emplacements, modèles BL |
| **Admin global DSI** | ✅ Accès total sur tous les magasins | ✅ Tous mouvements | ✅ Création/suppression de magasins |

---

## 2. Vue d'ensemble du Dashboard

Le tableau de bord principal (`/stocks`) permet de piloter l'état du magasin en temps réel :

1. **Sélecteur de magasin** : bascule instantanée entre les différents dépôts dont vous êtes membre.
2. **Onglets Stock normal vs Stock prêt** :
   - *Stock normal* : matériel neuf ou reconditionné destiné au déploiement définitif.
   - *Stock prêt* : parc tampon réservé aux prêts temporaires aux agents ou directions.
3. **Bannière d'alerte Seuil bas** : liste rouge des références dont la quantité disponible est inférieure ou égale au seuil minimum paramétré.
4. **Tableau des articles en stock** : référence catalogue GLPI/Parc, désignation, emplacement dans le magasin, quantité en stock, seuil mini, statut de disponibilité.
5. **Derniers mouvements** : journal des 20 dernières transactions (Entrée, Sortie, Prêt, Retour, Ajustement, Transfert) avec horodatage, quantité et opérateur.
6. **Boutons d'action rapide** : *Réceptionner*, *Faire une sortie*, *Gérer les prêts*, *Ajustement*, *Paramètres* (si manager).

---

## 3. Réception de matériel (Entrées en stock)

L'écran de réception (`/stocks/reception`) formalise l'arrivée physique de commandes ou de réapprovisionnements.

### 3.1 Déroulement d'une réception
1. **Sélection du magasin d'arrivée** : définir où les cartons sont entreposés.
2. **Identification de l'article** :
   - *Par scan code-barres* : utilisation de la caméra intégrée (smartphone/tablette) ou d'une douchette laser USB. Le système interroge le code EAN/UPC (lookup instantané avec cache local 24h).
   - *Par recherche catalogue* : recherche textuelle sur le catalogue du Parc informatique (`hub_parc.items`).
3. **Rattachement budgétaire (optionnel)** : possibilité de lier la livraison à un bon de commande SEDIT issu du module Budget pour assurer la chaîne comptable du service fait.
4. **Quantité et emplacement** : saisie du nombre d'unités reçues et sélection de l'étagère/armoire de destination.
5. **Articles sérialisés** : si l'équipement nécessite un suivi unitaire (ordinateurs, écrans, téléphones), bascule automatique ou manuelle vers la saisie des numéros de série.
6. **Validation** : l'enregistrement incrémente le stock et consigne un mouvement de type `in`.

---

## 4. Saisie et suivi des numéros de série

La page `/stocks/series` permet de tracer chaque unité physique par son numéro de série constructeur (S/N) ou son code IMEI.

- **Modes de saisie** :
  - *Scan unitaire rapide* : bip successif à la douchette.
  - *Saisie en masse* : copier-coller d'une liste de numéros de série provenant d'un bordereau de livraison fournisseur (séparateur saut de ligne ou virgule).
  - *Génération automatique* : pour les accessoires ne disposant pas de numéro constructeur mais nécessitant un code interne DSI.
- **États d'un numéro de série** :
  - `en_stock` : disponible en magasin.
  - `reserve` : bloqué dans une préparation de sortie ou de prêt.
  - `sorti` : livré à un usager définitif.
  - `en_pret` : actuellement prêté avec convention active.
  - `rebut` : déclassé ou défectueux.
- **Historique unitaire** : un clic sur un numéro de série affiche sa généalogie complète : date de réception, bon de livraison associé, usager attributaire, tickets éventuels.

---

## 5. Sortie de matériel et signature du Bon de Livraison (BL)

Le module de sortie (`/stocks/sortie`) encadre la remise de matériel aux agents avec preuve de remise dématérialisée et opposable.

### 5.1 Workflow pas à pas
1. **Choix du bénéficiaire** : recherche de l'agent dans l'annuaire Active Directory / RH. Le badge de présence temps réel (RH Studio) confirme si l'agent est actuellement présent.
2. **Sélection des articles et numéros de série** : choix des équipements remis. Les numéros de série sélectionnés passent automatiquement en statut réservé puis sorti.
3. **Génération du Bon de Livraison PDF** :
   - Le système applique le modèle de BL actif du magasin (logo Ville, mentions légales, tableau des articles et numéros de série).
4. **Signature électronique tactile** :
   - L'agent signe directement sur l'écran (tablette, smartphone ou souris d'ordinateur).
   - L'horodatage, l'adresse IP et le nom du signataire sont incrustés dans le document.
5. **Finalisation et archivage** :
   - Le PDF signé est généré et stocké dans le service unifié de stockage (`/storage`) et archivé dans la GED transverse (`hub_docs`).
   - Le stock du magasin est décrémenté, le mouvement `out` est consigné.
   - Le matériel est automatiquement associé à la fiche de l'usager dans le module Parc / Mobilité.

---

## 6. Gestion des prêts de matériel

Les pages `/stocks/prets` et `/prets` gèrent la mise à disposition temporaire d'équipements (ordinateurs portables de secours, vidéoprojecteurs, clés 4G, adaptateurs).

### 6.1 Processus d'un prêt
1. **Création du prêt** : sélection de l'emprunteur, des articles issus du *Stock Prêt*, et fixation d'une **date d'échéance de retour**.
2. **Signature de la convention de prêt** : signature électronique tactile de l'agent s'engageant à restituer le matériel en bon état à la date convenue.
3. **Surveillance et alertes** :
   - Les prêts actifs sont listés avec indicateur visuel : vert (en cours), orange (échéance sous 48h), rouge clignotant (en retard).
   - Le demandeur reçoit un rappel automatique par mail à l'approche du terme.
4. **Retour de prêt** :
   - Contrôle du matériel et de ses accessoires (câble, housse, chargeur).
   - Possibilité de signaler une casse ou un dysfonctionnement (création d'un ticket incident ou passage en stock de maintenance).
   - Validation du retour : réintégration automatique dans le stock prêt (mouvement `loan_return`).

---

## 7. Mouvements manuels, transferts et ajustements d'inventaire

Depuis le bouton **Ajustement** du Dashboard :
- **Transfert inter-magasins** : déplacer N unités du magasin A vers le magasin B sans quitter le système (génère un `transfer` sortant de A et entrant dans B).
- **Ajustement d'inventaire** : rectification de stock suite à comptage physique (inventaire annuel ou tournant). Une justification textuelle est obligatoire (ex. *perte, casse en atelier, régularisation inventaire 2026*).
- **Consignation d'audit** : chaque modification manuelle est signée avec le nom de l'opérateur et horodatée dans la table d'audit `hub_stocks.movements`.

---

## 8. Prévisions de consommation et alertes de rupture

Le moteur de prévision calcule la vélocité des sorties sur les 30, 60 et 90 derniers jours pour chaque article critique.

- **Indicateurs calculés** :
  - *Consommation moyenne journalière* (unités/jour).
  - *Jours restants avant rupture* estimés à charge constante.
  - *Niveau de sévérité* :
    - 🟢 `OK` : stock supérieur à 30 jours de consommation.
    - 🟡 `Warning` : stock entre 15 et 30 jours.
    - 🟠 `Critical` : stock inférieur à 15 jours (réapprovisionnement urgent recommandé).
    - 🔴 `Rupture` : stock nul, sorties bloquées.
- **Lien avec les commandes** : permet d'anticiper les commandes groupées dans le module Consommables ou Budget.

---

## 9. Administration du module (`/stocks/admin`)

Réservé aux Managers de magasin et aux Administrateurs globaux :

1. **Magasins** : création, renommage, activation/désactivation, sélection du magasin par défaut.
2. **Membres et habilitations** : attribution des profils *Viewer*, *Operator*, *Manager* par agent pour chaque magasin.
3. **Emplacements** : découpage physique du stockage (Bâtiment, Pièce, Armoire, Rayonnage, Bac).
4. **Designer de modèles de Bons de Livraison (BL)** :
   - Import d'un fond de page PDF aux couleurs de la collectivité.
   - Outil visuel interactif permettant de glisser-déposer les zones dynamiques : logo, cadre destinataire, tableau des articles, zone de signature tactile, mentions CNIL et conditions de prêt.

---

## 10. Interactions avec les autres modules du Hub DSI

| Module en interaction | Nature de l'échange |
|---|---|
| **Parc informatique** (`/parc`) | Partage du référentiel des matériels (`hub_parc.items`) et mise à jour de l'affectation usager lors d'une sortie. |
| **Mobilité** (`/parc` > Mobilité) | Le magasin dédié *DSI-MOB* alimente les dotations smartphones/tablettes et récupère les signatures. |
| **Tickets & Support** (`/tickets`) | Rapprochement des sorties de matériel sur un ticket d'incident ou de demande de nouvel arrivant. |
| **Budget & Finances** (`/budget`) | Rapprochement des bons de commande fournisseur lors des réceptions de matériel. |
| **GED & Documents** (`/documents`) | Archivage pérenne des bons de livraison et conventions de prêt signés. |
| **Active Directory & RH** | Recherche des agents bénéficiaires et affichage de la présence temps réel. |

---

## 11. Bonnes pratiques et astuces de dépannage

- 💡 **Douchette code-barres** : Configurez votre lecteur code-barres en mode *Clavier Français (AZERTY)* avec suffixe *Entrée (CR/LF)* pour un enchaînement fluide des scans.
- 💡 **Inventaire tournant** : Effectuez un contrôle hebdomadaire des alertes seuil bas plutôt qu'un unique inventaire annuel lourd.
- ⚠️ **Séries orphelines** : Si un numéro de série est scanné lors d'une sortie mais n'apparaît pas en stock, vérifiez qu'il n'a pas été réceptionné dans un autre magasin ou qu'il n'est pas encore en statut *en_pret*.
- 📱 **Signature sur mobile** : En intervention sur site, ouvrez la page `/stocks/sortie` sur smartphone ou tablette pour faire signer l'usager au pied du bureau.
