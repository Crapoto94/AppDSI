# Guide opérationnel — Module Réseau Ville (`/reseau`)

> Documentation technique et cartographique à l'usage des **ingénieurs réseaux, techniciens d'infrastructures, administrateurs système et prestataires télécom**.
> Ce guide détaille la cartographie SIG du réseau inter-sites municipal : liaisons fibre optique, liens WAN/opérateurs, faisceaux laser, fourreaux de voirie, stacks IRF, commutateurs, matrice des VLANs et superposition des plans cadastraux DXF.

---

## Sommaire

1. [Périmètre et architecture du réseau municipal](#1-périmètre-et-architecture-du-réseau-municipal)
2. [Vues principales : Carte SIG, Synoptique et Topologie (`/reseau`)](#2-vues-principales-carte-sig-synoptique-et-topologie-reseau)
3. [Cartographie SIG et calques superposables](#3-cartographie-sig-et-calques-superposables)
4. [Importation et affichage des plans cadastraux DXF](#4-importation-et-affichage-des-plans-cadastraux-dxf)
5. [Gestion des liaisons inter-sites et opérateurs](#5-gestion-des-liaisons-inter-sites-et-opérateurs)
6. [Commutateurs, baies et Stacks IRF](#6-commutateurs-baies-et-stacks-irf)
7. [Matrice des VLANs et plan d'adressage IP](#7-matrice-des-vlans-et-plan-dadressage-ip)
8. [Liaisons de fibre optique (Liaisons FO) et tiroirs optiques](#8-liaisons-de-fibre-optique-liaisons-fo-et-tiroirs-optiques)
9. [Liaisons entre commutateurs (Liens Switchs)](#9-liaisons-entre-commutateurs-liens-switchs)
10. [Indicateurs statistiques et résilience du réseau](#10-indicateurs-statistiques-et-résilience-du-réseau)
11. [Synchronisation avec l'API Infra externe](#11-synchronisation-avec-lapi-infra-externe)
12. [Bonnes pratiques d'exploitation et de câblage](#12-bonnes-pratiques-dexploitation-et-de-câblage)

---

## 1. Périmètre et architecture du réseau municipal

Le module Réseau modélise la colonne vertébrale des télécommunications de la collectivité, reliant plus d'une cinquantaine de bâtiments municipaux (Hôtel de Ville, mairies annexes, groupes scolaires, centres techniques, crèches, médiathèques, postes de police municipale, caméras de vidéoprotection urbaine).

### 1.1 Types de médias physiques supportés
- **Fibre optique Ville (Fibre noire)** : réseau de câbles de fibre optique propriété de la collectivité tirés dans les fourreaux communaux.
- **Liens opérateurs (WAN / VPN MPLS)** : liaisons managées fournies par des opérateurs tiers (Linkt, Moji, SFR, Orange).
- **Liaisons hertziennes / Faisceaux Laser** : liaisons aériennes directes point-à-point sans fil.
- **Accès xDSL / 4G de secours**.

---

## 2. Vues principales : Carte SIG, Synoptique et Topologie (`/reseau`)

L'interface propose trois angles de visualisation complémentaires :

1. **Carte SIG (Leaflet)** : vue géographique montrant le tracé réel des fibres sous la chaussée, la position des chambres de tirage et les bâtiments connectés.
2. **Synoptique** : schéma d'ensemble structuré du réseau découpé en Coeur de réseau (Core), Distribution (Aggregation) et Accès (Access).
3. **Topologie (Graphe logique)** : représentation nodale interactive mettant en valeur les anneaux de redondance, les liens principaux et les liens de secours.

---

## 3. Cartographie SIG et calques superposables

La carte Leaflet permet d'activer ou désactiver des calques indépendants :
- **Sites municipaux** : pastilles localisant chaque bâtiment municipal avec code bien du référentiel territorial.
- **Liens physiques** : lignes de couleur reliant les sites :
  - Bleu continu : Fibre optique active en production (`PROD`).
  - Vert pointillé : Lien de secours / backup (`BACKUP`).
  - Rouge : Liaison coupée ou incident technique (`HS`).
- **Fourreaux municipaux** : cheminement sous voirie des canalisations souterraines réservées aux câbles de la Ville.
- **Chambres de tirage** : regards d'accès technique sur la voie publique.
- **Dessin interactif en 2 clics** : les administrateurs peuvent tracer une nouvelle liaison directement en cliquant sur le site de départ puis sur le site d'arrivée.

---

## 4. Importation et affichage des plans cadastraux DXF

Pour une précision chirurgicale du sous-sol :
- **Module d'import DXF** : permet de charger les fichiers de plans de géomètres (fichiers AutoCAD `.dxf`).
- **Gestion des calques DXF** : sélection des couches à afficher (réseau d'éclairage public, voirie, tracé des réseaux concessionnaires Enedis/GRDF/eau).
- **Personnalisation des styles** : choix des couleurs, épaisseurs de traits et niveaux d'opacité.

---

## 5. Gestion des liaisons inter-sites et opérateurs

L'onglet **Liens** récapitule les caractéristiques techniques de chaque artère :
- **Site A (Origine) et Site B (Extrémité)**.
- **Type de lien** : `FIBRE`, `WAN`, `OPERATEUR`, `LASER`.
- **Opérateur titulaire** : `LINKT`, `MOJI`, `RED`, `SFR`, `VILLE (Régie)`.
- **Capacité / Débit** : ex. *1 Gbps*, *10 Gbps*, *100 Mbps*.
- **Flux véhiculés** : indicateurs booléens *Données (Data)* et *Voix sur IP (ToIP)*.
- **Attributs de haute disponibilité** : *Liaison en anneau*, *Redondance active*.

---

## 6. Commutateurs, baies et Stacks IRF

L'onglet **Équipements** et l'onglet **IRF** modélisent les actifs réseau :

### 6.1 Matériel actif
- Commutateurs de coeur de réseau, switchs de distribution et switchs PoE d'accès usagers (marques HPE, Aruba, Cisco, H3C).
- Adresses IP de management, adresses MAC, numéros de série et versions de firmware.
- Emplacement physique : Baie informatique, Numéro d'unité de rack (U).

### 6.2 Stacks IRF (Intelligent Resilient Framework)
- Modélisation des grappes de commutateurs virtualisés fonctionnant comme un châssis unique.
- Rôles des membres (Master, Standby), priorité de bascule et liaisons d'interconnexion IRF (*stack links*).

---

## 7. Matrice des VLANs et plan d'adressage IP

L'onglet **VLANs** centralise la politique de segmentation et d'étanchéité du réseau municipal :

| ID VLAN | Nom du VLAN | Sous-réseau IP / Masque | Passerelle | Usage métier |
|---|---|---|---|---|
| **VLAN 10** | `ADMIN_SRV` | `10.10.0.0/24` | `10.10.0.254` | Serveurs de production, hyperviseurs, SAN |
| **VLAN 20** | `BUR_HOTEL_VILLE` | `10.20.0.0/23` | `10.20.1.254` | Postes de travail des agents de la Mairie |
| **VLAN 30** | `TOIP_VOIX` | `10.30.0.0/23` | `10.30.1.254` | Téléphones IP, serveurs de communications |
| **VLAN 40** | `ECOLES_PEDA` | `10.40.0.0/22` | `10.40.3.254` | Écoles maternelles et élémentaires (élèves/profs) |
| **VLAN 50** | `VIDEO_PROTECTION`| `10.50.0.0/22` | `10.50.3.254` | Caméras de voirie et serveurs du CSU |
| **VLAN 90** | `WIFI_INVITE` | `172.16.0.0/22` | `172.16.3.254` | Accès public Internet visiteurs étanche |
| **VLAN 99** | `MGMT_SWITCHS` | `10.99.0.0/24` | `10.99.0.254` | Administration des commutateurs et PDU |

---

## 8. Liaisons de fibre optique (Liaisons FO) et tiroirs optiques

L'onglet **Liaisons FO** cartographie le câblage passif :
- **Identification des tiroirs de brassage** dans chaque baie de brassage.
- **Nombre de brins** : câbles de 6, 12, 24 ou 48 brins.
- **Type de fibre** : Monomode (OS2 - longue distance inter-sites) ou Multimode (OM3/OM4 - liaisons courtes intra-bâtiment).
- **Affectation des brins** : suivi brin par brin (Actif en prod, En réserve, Défectueux).

---

## 9. Liaisons entre commutateurs (Liens Switchs)

L'onglet **Liens-Switchs** détaille le maillage filaire physique :
- Port source (ex. *Switch-Coeur-01 port TenGigabitEthernet 1/0/49*).
- Port destination (ex. *Switch-Ecole-Jaures port GigabitEthernet 1/0/28*).
- Type de connecteur (SFP+ 10G LC, RJ45 Gigabit) et agrégation de liens (LACP / Trunk 802.1Q).

---

## 10. Indicateurs statistiques et résilience du réseau

L'onglet **Stats** produit les métriques de fiabilité pour la direction :
- Nombre total de liaisons actives et taux de redondance global (% de sites bénéficiant d'un double raccordement).
- Nombre de switchs surveillés et répartition par statut de santé.
- Répartition de la bande passante globale par opérateur.

---

## 11. Synchronisation avec l'API Infra externe

Le module s'interface en direct avec les outils de supervision réseau :
- Endpoint de synchronisation automatique : mise à jour des statuts opérationnels des liens depuis les API de monitoring réseau.
- Détection immédiate des coupures de fibre et mise à jour de la couleur du tracé sur la carte Leaflet.

---

## 12. Bonnes pratiques d'exploitation et de câblage

- 💡 **Étiquetage normalisé** : Tout cordon de brassage inter-baie doit comporter une étiquette aux deux extrémités mentionnant le numéro du port distant.
- 💡 **Sauvegarde des configurations** : Toute modification de VLAN sur un switch doit être validée par un `write memory` et sauvegardée sur le serveur TFTP/Git d'archivage.
- ⚠️ **Travaux de voirie** : Avant tout terrassement sur le domaine public, consultez le tracé des fourreaux dans le module pour émettre les avis de Déclaration de Travaux (DT/DICT).
