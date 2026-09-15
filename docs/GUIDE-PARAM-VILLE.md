# Guide opérationnel — Module Paramètres Ville (`/admin/param-ville`)

> Documentation administrative, territoriale et cartographique à l'usage des **administrateurs du système, géomaticiens, techniciens de proximité et secrétariats généraux**.
> Ce guide détaille le référentiel territorial et politique de la collectivité : identité municipale, annuaire des élus, arborescence du patrimoine bâti (sites, bâtiments, locaux), écoles communales et cartographie interactive.

---

## Sommaire

1. [Rôle de socle territorial pour l'application](#1-rôle-de-socle-territorial-pour-lapplication)
2. [Vue d'ensemble et onglets d'administration (`/admin/param-ville`)](#2-vue-densemble-et-onglets-dadministration-adminparam-ville)
3. [Configuration générale de la collectivité](#3-configuration-générale-de-la-collectivité)
4. [Annuaire des élus municipaux et délégations](#4-annuaire-des-élus-municipaux-et-délégations)
5. [Référentiel du patrimoine bâti et hiérarchie des codes biens](#5-référentiel-du-patrimoine-bâti-et-hiérarchie-des-codes-biens)
6. [Annuaire des groupes scolaires et collèges](#6-annuaire-des-groupes-scolaires-et-collèges)
7. [Cartographie interactive des sites municipaux (Leaflet)](#7-cartographie-interactive-des-sites-municipaux-leaflet)
8. [Géocodage automatique et repositionnement manuel](#8-géocodage-automatique-et-repositionnement-manuel)
9. [Imports Excel et synchronisations massives](#9-imports-excel-et-synchronisations-massives)
10. [Interactions avec les autres modules du Hub](#10-interactions-avec-les-autres-modules-du-hub)
11. [Règles de codification et bonnes pratiques](#11-règles-de-codification-et-bonnes-pratiques)

---

## 1. Rôle de socle territorial pour l'application

Le module Paramètres Ville est le **référentiel géographique et institutionnel transverse**. Chaque fois qu'un technicien localise un copieur, qu'un ticket d'assistance est ouvert pour une école, qu'une fibre optique est raccordée ou qu'une demande d'équipement est formulée pour un élu, l'application s'appuie sur les données administrées ici.

---

## 2. Vue d'ensemble et onglets d'administration (`/admin/param-ville`)

L'interface se structure en 7 onglets dédiés :
- **Général** : identité officielle de la Ville.
- **Élus** : registre des élus municipaux et de leurs délégations de mandat.
- **Patrimoine bâti** : inventaire hiérarchique des sites et locaux avec codes biens.
- **Écoles** : répertoire des établissements scolaires communaux.
- **Carte des sites** : géolocalisation Leaflet haute précision.
- **Organisation** : organigramme de l'administration municipale (vue miroir RH).
- **Encadrants** : coordonnées directes des cadres de la collectivité.

---

## 3. Configuration générale de la collectivité

- **Nom officiel de la collectivité** (ex. *Ville de Créteil*).
- **Code postal officiel** (ex. *94000*).
- Paramètres globaux réutilisés dans les en-têtes d'e-mails, les modèles de bons de livraison et les pieds de page des documents officiels générés par le Hub.

---

## 4. Annuaire des élus municipaux et délégations

L'onglet **Élus** centralise les interlocuteurs politiques :
- **Civilité, Nom et Prénom**.
- **Rôle au sein du Conseil Municipal** : *Maire, Adjoint au Maire, Conseiller municipal délégué, Conseiller municipal*.
- **Délégation thématique** (ex. *« Adjoint délégué aux Finances et à la Transition Numérique »*, *« Conseillère déléguée à la Petite Enfance »*).
- **Coordonnées de contact** : téléphone direct et adresse e-mail institutionnelle.
- **Dossier de suivi** : permet à la DSI d'identifier immédiatement les demandes émanant du Cabinet du Maire ou des Élus pour un traitement prioritaire.

---

## 5. Référentiel du patrimoine bâti et hiérarchie des codes biens

L'onglet **Patrimoine** gère l'ensemble des emprises immobilières municipales selon une nomenclature normalisée :

### 5.1 Structure arborescente des codes biens
Le système décompose le patrimoine en 4 niveaux d'imbrication logique :
1. **Site racine (`Sxxx`)** : l'emprise foncière globale (ex. `S012` - Centre Technique Municipal).
2. **Bâtiment (`SxxxBxx`)** : un corps de bâtiment spécifique au sein du site (ex. `S012B01` - Bâtiment Ateliers, `S012B02` - Bureaux Administratifs).
3. **Niveau / Étage (`...Nxx`)** : découpage vertical (ex. `S012B02N0` - Rez-de-chaussée, `S012B02N1` - 1er étage, `S012B02N-1` - Sous-sol).
4. **Local / Pièce (`...Lxx`)** : le bureau ou local technique précis (ex. `S012B02N1L04` - Bureau DSI Réseaux).

### 5.2 Modes de consultation
- **Vue Arborescence** : arbre dépliable permettant de descendre du site jusqu'au bureau.
- **Vue Liste filtrable** : tableau complet avec tri multicritère et recherche instantanée.
- **Statut d'activation** : un bâtiment démoli ou désaffecté est marqué inactif (apparaît barré) sans détruire l'historique des interventions passées.

---

## 6. Annuaire des groupes scolaires et collèges

L'onglet **Écoles** répertorie les établissements scolaires :
- Nom officiel de l'école (Maternelle ou Élémentaire).
- Adresse postale exacte.
- Nom et prénom du Directeur ou de la Directrice d'école.
- Coordonnées de contact (téléphone fixe de la direction, ligne directe de l'école, e-mail académique).
- Lien direct avec le module *Chat École* et le suivi des copieurs pédagogiques.

---

## 7. Cartographie interactive des sites municipaux (Leaflet)

L'onglet **Carte** projette l'ensemble des sites sur un fond OpenStreetMap :
- **Marqueurs par catégorie** : Administration, Écoles, Culture, Sport, Petite Enfance, Espaces Publics.
- **Fiche infobulle au clic** : affiche le nom, l'adresse, la liste des bâtiments rattachés et un lien vers les équipements du site.

---

## 8. Géocodage automatique et repositionnement manuel

- **Géocodage assisté** : lors de la saisie d'une adresse, le système interroge l'API nationale `api-adresse.data.gouv.fr` pour calculer automatiquement la latitude et la longitude exactes.
- **Ajustement manuel de précision** : les administrateurs peuvent glisser-déposer un marqueur directement sur la carte pour corriger son positionnement (essentiel pour les parcs, stades ou locaux techniques sans numéro de rue précis).

---

## 9. Imports Excel et synchronisations massives

- **Import du référentiel des bâtiments** : téléversement de la matrice `REFERENTIEL BATIMENTS.XLSX` de la Direction des Bâtiments Communaux pour mise à jour annuelle du patrimoine.
- **Import des élus** : mise à jour complète en un clic de la liste des élus suite aux élections municipales.

---

## 10. Interactions avec les autres modules du Hub

| Module lié | Exploitation des données de la Ville |
|---|---|
| **Réseau Ville** (`/reseau`) | Tracé des câbles de fibre optique reliant les codes biens des sites. |
| **Copieurs** (`/copieurs`) | Localisation géographique des machines sur la carte municipale. |
| **Tickets & Support** (`/tickets`) | Sélection du site lors de la création d'un ticket incident usager. |
| **Stocks** (`/stocks`) | Définition des emplacements physiques de stockage par bâtiment et pièce. |

---

## 11. Règles de codification et bonnes pratiques

- 💡 **Règle d'or du Code Bien** : Ne modifiez jamais le code bien d'un site existant (ex. `S005`), car il sert de clé primaire de liaison pour les tickets, le réseau et les copieurs.
- 💡 **Désactivation plutôt que suppression** : Si un site municipal est vendu ou fermé, passez son statut à `Inactif` pour préserver l'historique comptable et patrimonial.
- ⚠️ **Adresse précise pour le géocodage** : Renseignez toujours le nom de voie complet avec code postal pour éviter les ambiguïtés d'adresses homonymes.
