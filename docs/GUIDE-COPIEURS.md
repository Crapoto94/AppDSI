# Guide opérationnel — Module Copieurs & Impression (`/copieurs`)

> Documentation fonctionnelle à l'usage des **gestionnaires de parc, techniciens support, équipes de proximité et responsables budgétaires**.
> Ce guide décrit la gestion complète du parc de copieurs multifonctions (MFP) de la Ville et des écoles : relevés de compteurs manuels et SNMP, facturation, suivi des pannes SAV, visites terrain et indicateurs KPI.

---

## Sommaire

1. [Accès et périmètre du module](#1-accès-et-périmètre-du-module)
2. [Vue d'ensemble et fiche détaillée d'un copieur](#2-vue-densemble-et-fiche-détaillée-dun-copieur)
3. [Relevés de compteurs et calcul des coûts](#3-relevés-de-compteurs-et-calcul-des-coûts)
4. [Supervision réseau et collecte automatique SNMP](#4-supervision-réseau-et-collecte-automatique-snmp)
5. [Suivi des interventions SAV et maintenance](#5-suivi-des-interventions-sav-et-maintenance)
6. [Visites terrain et reportages photos](#6-visites-terrain-et-reportages-photos)
7. [Cartographie géographique des copieurs](#7-cartographie-géographique-des-copieurs)
8. [Indicateurs de performance et analyse budgétaire (`/copieurs/kpi`)](#8-indicateurs-de-performance-et-analyse-budgétaire-copieurskpi)
9. [Imports Excel et synchronisations (PaperCut, KPAX)](#9-imports-excel-et-synchronisations-papercut-kpax)
10. [Interactions avec les autres briques du Hub](#10-interactions-avec-les-autres-briques-du-hub)
11. [Guide de dépannage et anomalies fréquentes](#11-guide-de-dépannage-et-anomalies-fréquentes)

---

## 1. Accès et périmètre du module

### 1.1 Points d'accès
- **Gestion du parc & relevés** : `/copieurs`
- **Tableau de bord KPI & Coûts** : `/copieurs/kpi`

### 1.2 Périmètre matériel
Le module couvre l'intégralité des systèmes multifonctions d'impression de la collectivité :
- Copieurs des services municipaux (Hôtel de Ville, centres techniques, mairies de quartier, médiathèques, CCAS).
- Copieurs pédagogiques et administratifs des groupes scolaires (écoles maternelles et élémentaires).

---

## 2. Vue d'ensemble et fiche détaillée d'un copieur

L'écran principal liste tous les équipements avec leurs statuts opérationnels :

### 2.1 Éléments d'une fiche copieur
- **Identification technique** : Marque, Modèle (ex. *Canon imageRUNNER ADVANCE DX C3830i*), Numéro de série constructeur, Numéro d'inventaire municipal.
- **Réseau & connectivité** : Adresse IP fixe, Nom DNS, Adresse MAC, état du dernier ping réseau.
- **Localisation précise** : Site, Bâtiment, Étage, Numéro de bureau ou salle des maîtres, rattachement au code bien du référentiel territorial.
- **Paramètres contractuels** : Date d'installation, date d'échéance de location, code compteur associé et grille tarifaire applicable.
- **Historique complet** : journal chronologique des déménagements, changements d'IP, relevés et pannes.

---

## 3. Relevés de compteurs et calcul des coûts

Le suivi rigoureux des compteurs est la clé du contrôle des factures du titulaire du marché :

### 3.1 Métriques relevées
- **Compteur Noir & Blanc** (pages A4/A3 équivalent).
- **Compteur Couleur** (pages A4/A3 équivalent).
- **Compteur Total / Scans**.

### 3.2 Calcul automatique de la facturation
1. Pour chaque trimestre, le système calcule le **delta de pages produites** :
   $$\text{Delta} = \text{Compteur Fin de période} - \text{Compteur Début de période}$$
2. Le coût facturé est déterminé par l'application automatique du tarif conventionnel en vigueur :
   $$\text{Coût HT} = (\text{Delta NB} \times \text{Tarif NB}) + (\text{Delta Couleur} \times \text{Tarif Couleur})$$
3. Les tarifs sont historisés avec dates d'application, garantissant la justesse des calculs rétroactifs lors d'avenants tarifaires.

---

## 4. Supervision réseau et collecte automatique SNMP

Pour éviter la fastidieuse tournée manuelle de relevé des compteurs, le module intègre un moteur de collecte SNMP natif :

### 4.1 Collecte à la demande et planifiée
- **Test unitaire (Ping / Walk SNMP)** : depuis la fiche du copieur, un clic permet d'interroger la machine en direct pour vérifier sa joignabilité et lire ses MIBs standards (RFC 1213 / Printer MIB).
- **Collecte globale en masse** : lancement asynchrone d'une scrutation de l'ensemble du parc avec barre de progression en direct (nombre de machines interrogées avec succès, hors ligne ou en erreur).
- **Planification automatique (Cron)** : scrutation automatique hebdomadaire ou mensuelle en heures creuses.

### 4.2 Détection d'anomalies SNMP
- Alerte immédiate si une machine répond avec un compteur inférieur au trimestre précédent (cas rare de changement de carte mère ou de réinitialisation constructeur).

---

## 5. Suivi des interventions SAV et maintenance

Le module assure la liaison directe avec le prestataire de maintenance :

- **Collecteur d'e-mails SAV (Graph O365)** : surveillance automatique de la boîte partagée dédiée aux échanges avec le mainteneur. Les notifications d'ouverture d'incident, de passage de technicien et de clôture sont automatiquement rattachées au copieur concerné grâce au numéro de série présent dans l'objet ou le corps du message.
- **Journal des pannes** : date de signalement, nature de la panne (bourrage récurrent, code erreur constructeur, problème de four, alimentation papier), technicien intervenu, pièces remplacées.
- **Historique de fiabilité** : permet d'identifier les machines instables nécessitant un échange standard sous garantie de bon fonctionnement.

---

## 6. Visites terrain et reportages photos

Lors des interventions des techniciens de proximité ou des audits préalables au déploiement d'un nouveau marché :

- **Rapport de visite** : saisie des observations sur l'état physique, la propreté, la ventilation et l'accessibilité de la machine.
- **Album photo intégré (jusqu'à 10 clichés par visite)** :
  - Photo du copieur dans son environnement.
  - Photo de la prise réseau murale et de l'alimentation électrique.
  - Photo de l'étiquette constructeur et de l'écran affichant les compteurs physiques.
- Stockage optimisé et compression automatique des images pour consultation rapide.

---

## 7. Cartographie géographique des copieurs

Grâce au géocodage automatique des adresses municipales :

- **Carte interactive Leaflet** : affichage de l'ensemble des copieurs sur le plan de la ville avec délimitation du territoire communal.
- **Marqueurs dynamiques** :
  - Vert : copieur connecté et joignable.
  - Rouge : copieur hors ligne ou injoignable lors du dernier ping.
  - Orange : copieur avec alerte SAV ou compteur manquant.
- Un clic sur un marqueur ouvre une fiche synthétique avec lien direct vers la page détaillée.

---

## 8. Indicateurs de performance et analyse budgétaire (`/copieurs/kpi`)

La page `/copieurs/kpi` offre aux directeurs et contrôleurs de gestion une analyse d'aide à la décision :

### 8.1 Tableaux de bord financiers
- **Volume global d'impressions** sur 12 mois glissants et comparaison N-1.
- **Montant total des consommations** facturées par trimestre et projection d'atterrissage annuel.
- **Ratio Noir & Blanc vs Couleur** : suivi de la politique de sobriété d'impression (objectif de réduction des coûts de la couleur).
- **Ventilation par Direction et Pôle** : refacturation interne ou suivi analytique des dépenses par service.

### 8.2 Top machines et alertes d'usage
- **Top 10 des copieurs les plus sollicités** : détection des machines en surcharge nécessitant un modèle à plus haute vélocité (pages/minute).
- **Top 10 des machines sous-utilisées** : identification des copieurs surdimensionnés pouvant être mutualisés ou redéployés.
- **Top croissance / décroissance** : suivi des évolutions de comportement des services.
- **Compteurs décroissants ou manquants** : tableau d'anomalies pour contrôle avant mise en paiement des factures du mainteneur.

---

## 9. Imports Excel et synchronisations (PaperCut, KPAX)

Le module assure la continuité avec les outils de supervision existants :

- **Import du parc initial** : reprise de masse depuis les fichiers de déploiement des marchés précédents.
- **Import KPAX / PaperCut** : réconciliation avec les données de traçabilité des impressions usagers et de gestion des badges d'accès.
- **Export consolidé** : génération de rapports Excel prêts pour le contrôle de gestion et les bilans annuels de mandat.

---

## 10. Interactions avec les autres briques du Hub

| Module | Objet de l'interaction |
|---|---|
| **Contrats** (`/contrats`) | Rapprochement avec le marché cadre de location/maintenance des copieurs (SLA, dates de fin de bail). |
| **Paramètres Ville** (`/admin/param-ville`) | Partage du référentiel des bâtiments municipaux et des écoles pour la localisation. |
| **Consommables** (`/consommables`) | Frontière claire : les toners des copieurs sous contrat sont livrés au forfait par le mainteneur ; les imprimantes bureautiques sont gérées via le module Consommables. |
| **Tableau de bord DSI** (`/dsi-dashboard`) | Widgets de suivi du volume mensuel de pages et des copieurs hors ligne. |
| **Messagerie & O365** (`/admin/o365-mail`) | Collecte automatisée des e-mails du service après-vente constructeur. |

---

## 11. Guide de dépannage et anomalies fréquentes

- ⚠️ **Copieur injoignable en SNMP** : Vérifiez que l'adresse IP de la machine n'a pas changé suite à un renouvellement DHCP et que la communauté SNMP (`public` ou spécifique) est correctement configurée sur le boîtier réseau de la machine.
- 💡 **Remplacement de machine** : Lors de l'arrivée d'un nouveau copieur en remplacement d'un ancien, créez la nouvelle fiche avec son numéro de série et archivez l'ancienne fiche en saisissant son compteur final de reprise pour solder les comptes.
- 💡 **Contrôle avant validation de facture** : Comparez toujours le total de pages facturé par le prestataire avec la somme des deltas calculée par le module pour repérer d'éventuelles facturations indues sur machines résiliées.
