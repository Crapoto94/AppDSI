# Guide opérationnel — Module Parc Informatique & Mobilité (`/parc`)

> Documentation technique, patrimoniale et logistique à l'usage des **gestionnaires de parc, techniciens de proximité, administrateurs système et responsables financiers**.
> Ce guide détaille l'inventaire complet du parc informatique et mobile : postes fixes, portables, écrans, smartphones, tablettes, campagnes de déploiement, réconciliation Active Directory, contrôle de la valeur comptable et impression d'étiquettes d'inventaire.

---

## Sommaire

1. [Enjeux et architecture du référentiel matériel](#1-enjeux-et-architecture-du-référentiel-matériel)
2. [Vue d'ensemble et Dashboard patrimonial (`/parc`)](#2-vue-densemble-et-dashboard-patrimonial-parc)
3. [Recherche, filtres avancés et liste du matériel](#3-recherche-filtres-avancés-et-liste-du-matériel)
4. [Pyramide des âges et plan de renouvellement](#4-pyramide-des-âges-et-plan-de-renouvellement)
5. [Contrôle de la qualité des données et fraîcheur Active Directory](#5-contrôle-de-la-qualité-des-données-et-fraîcheur-active-directory)
6. [Vue Usagers et affectation du matériel](#6-vue-usagers-et-affectation-du-matériel)
7. [Vue Stock et réserves de proximité](#7-vue-stock-et-réserves-de-proximité)
8. [Chantiers et campagnes de déploiements](#8-chantiers-et-campagnes-de-déploiements)
9. [Mobilité : Flotte de smartphones et tablettes](#9-mobilité--flotte-de-smartphones-et-tablettes)
10. [Lignes mobiles et réconciliation des cartes SIM](#10-lignes-mobiles-et-réconciliation-des-cartes-sim)
11. [Génération et impression d'étiquettes d'inventaire](#11-génération-et-impression-détiquettes-dinventaire)
12. [Interactions avec les autres modules du Hub](#12-interactions-avec-les-autres-modules-du-hub)
13. [Bonnes pratiques d'inventaire et de gestion de cycle de vie](#13-bonnes-pratiques-dinventaire-et-de-gestion-de-cycle-de-vie)

---

## 1. Enjeux et architecture du référentiel matériel

Le module Parc Informatique est la **source de vérité matérielle** de la DSI. Il fusionne les données issues du gestionnaire d'inventaire historique GLPI 10 avec les informations d'activité réelles de l'Active Directory, de l'organigramme RH et des factures d'achat.

### 1.1 Double source commutable
- **Mode Hub (recommandé)** : interroge la base locale synchronisée et enrichie (`hub_parc.items`) pour des temps de réponse instantanés.
- **Mode Live GLPI 10** : interroge en direct l'API REST de GLPI pour un contrôle immédiat après une saisie.

---

## 2. Vue d'ensemble et Dashboard patrimonial (`/parc`)

L'onglet **Dashboard** offre une vue d'ensemble managériale sur le parc :

### 2.1 Indicateurs financiers et volumétriques
- **Nombre total d'équipements recensés** (ordinateurs de bureau, portables, moniteurs, imprimantes réseau, tablettes, téléphones).
- **Valeur brute totale du parc (€)** calculée à partir des infocoms et prix d'achat réels.
- **Taux d'affectation** : proportion de machines en service chez les utilisateurs vs machines en stock de réserve.
- **Ratio Écrans / Postes** : indicateur de confort ergonomique (suivi de la généralisation du double-écran).

---

## 3. Recherche, filtres avancés et liste du matériel

L'onglet **Liste** permet d'isoler n'importe quel équipement en quelques secondes :

### 3.1 Filtres multicritères
- Par **Type de matériel** (Ordinateurs, Moniteurs, Imprimantes, Périphériques, Téléphones/Tablettes).
- Par **Statut** (*En service, En stock, En réparation, Au rebut, Volé, Prêté*).
- Par **Fabricant et Modèle** (Dell OptiPlex, Lenovo ThinkPad, HP EliteBook, Apple iPad, Samsung Galaxy).
- Par **Localisation géographique** (Site municipal, Bâtiment, Étage, Bureau).
- Par **Direction et Service utilisateur**.
- Par **Système d'exploitation** (Windows 10, Windows 11, macOS, Android, iOS).

---

## 4. Pyramide des âges et plan de renouvellement

La gestion proactive du parc évite l'obsolescence massive :
- **Histogramme de la pyramide des âges** : répartition des postes par année de mise en service (ex. < 2 ans, 3-4 ans, 5 ans et plus).
- **Alerte Machines ≥ 5 ans** : liste rouge des ordinateurs ayant dépassé la durée d'amortissement comptable de 5 ans, prioritaires pour le renouvellement du prochain budget.
- Permet de justifier les demandes budgétaires d'investissement lors des rencontres budgétaires.

---

## 5. Contrôle de la qualité des données et fraîcheur Active Directory

L'onglet **AD** croise l'inventaire physique avec les connexions réelles au réseau :

- **Pastilles de fraîcheur de contact** :
  - 🟢 *Moins de 30 jours* : poste actif et connecté récemment.
  - 🟡 *Entre 30 et 90 jours* : poste peu utilisé (congé long, télétravail prolongé ou réserve oubliée).
  - 🔴 *Plus de 90 jours* : poste potentiellement fantôme, débranché ou hors service sans avoir été déclaré au rebut.
- **Détection des anomalies d'inventaire** :
  - Ordinateurs présents dans l'AD mais absents de l'inventaire matériel.
  - Numéros de série en doublon dans la base.
  - Postes sans utilisateur ou sans localisation renseignée.

---

## 6. Vue Usagers et affectation du matériel

L'onglet **Usagers** propose un parcours orienté collaborateur :
- Recherche par nom d'agent pour afficher sa **fiche d'équipement complète** : PC portable attribué, écrans, station d'accueil, smartphone professionnel et ligne mobile.
- Permet de préparer efficacement les départs ou mobilités internes en connaissant exactement le matériel à récupérer.

---

## 7. Vue Stock et réserves de proximité

L'onglet **Stock** isole l'ensemble du matériel disponible pour déploiement immédiat :
- Matériels neufs en carton en attente de masterisation.
- Matériels reconditionnés de retour de prêt prêts pour dépannage express.

---

## 8. Chantiers et campagnes de déploiements

L'onglet **Déploiements** pilote les vagues de renouvellement massif (ex. remplacement des 300 PC des écoles ou déploiement de Windows 11) :
- Suivi du nombre de postes installés par jour et par technicien.
- Détection des conflits de numéros de série et validation des fiches de mise en service.

---

## 9. Mobilité : Flotte de smartphones et tablettes

Le sous-module Mobilité (`MobiliteView`) assure la gestion spécifique des terminaux mobiles :

### 9.1 Cycle d'attribution en 2 phases
1. **Phase 1 (Attribution administrative)** : choix du type de mise à disposition (*Dotation définitive, Prêt temporaire, Cession*), sélection de l'agent et du numéro de ligne mobile associé.
2. **Phase 2 (Remise physique et signature)** : l'usager signe électroniquement la convention de remise sur écran tactile ou dépose une décharge scannée.
3. **Restitution** : enregistrement des retours rapides ou formalisés avec inspection de l'état de l'écran et des accessoires.

---

## 10. Lignes mobiles et réconciliation des cartes SIM

L'onglet **Lignes mobiles** croise le fichier des abonnements SFR avec le matériel :
- Détection des désalignements :
  - *Ligne sans appareil* : forfait actif sans smartphone déclaré.
  - *IMEI divergent* : la carte SIM est insérée dans un appareil différent de celui enregistré.
  - *Titulaire divergent* : discordance entre le nom sur la facture opérateur et l'agent réel.

---

## 11. Génération et impression d'étiquettes d'inventaire

L'onglet **Étiquette** (`EtiquetteView`) permet d'éditer des étiquettes code-barres résistantes à coller sur les équipements :
- **Mise en page normalisée** : Logo officiel de la Ville, Type de matériel, Numéro de série constructeur et **Code-barres / QR Code d'inventaire**.
- Impression sur imprimante thermique d'étiquettes ou planches prédécoupées standard (A4).

---

## 12. Interactions avec les autres modules du Hub

| Module | Nature de la synchronisation |
|---|---|
| **Tickets & Support** (`/tickets`) | Affichage automatique des équipements attribués au demandeur sur la fiche d'un ticket. |
| **Stocks** (`/stocks`) | Les réceptions de matériel alimentent le catalogue du parc ; les sorties créent les liens usagers. |
| **Vols & Pertes** (`/vols`) | Déclaration directe d'un vol depuis la fiche de l'équipement concerné. |
| **Télécom** (`/telecom`) | Rapprochement des coûts de flotte avec les smartphones physiques. |

---

## 13. Bonnes pratiques d'inventaire et de gestion de cycle de vie

- 💡 **Étiquetage à l'arrivée** : Ne sortez jamais un ordinateur de l'atelier technique sans avoir préalablement collé son étiquette d'inventaire et vérifié sa remontée dans l'AD.
- 💡 **Mise au rebut propre** : Tout matériel réformé doit faire l'objet d'un effacement sécurisé des disques durs (norme NIST 800-88) et d'un passage au statut `Rebut` pour mise à jour de l'actif comptable.
- ⚠️ **Délai de rotation des stocks** : Veillez à ce qu'un matériel neuf ne reste pas plus de **30 jours en stock** sans être déployé afin de ne pas perdre le bénéfice de la garantie constructeur.
