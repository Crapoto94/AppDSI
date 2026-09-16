# Changelog

Toutes les évolutions notables du projet AppDSI sont documentées ici.

## [1.2.0] - 2026-09-16

### Nouveau module — Parapheur électronique (`/parapheur`)

Signature de documents PDF par circuit séquentiel ou parallèle, 100 % interne au Hub DSI.

**Création d'un parapheur**
- Dépôt de PDF **à signer** + **annexes** (consultables par le signataire, non signées), avec aperçu miniature et comptage des pages.
- Choix des signataires (annuaire RH Studio) et, pour chacun, du mode de signature : **simple**, **vérifiée par SMS** ou **sécurisée (certificat P12)**.
- Position de signature par défaut sur la **dernière page**, ajustable dans un éditeur.
- **Titre / fonction** du signataire pré-rempli depuis le référentiel RH (`POSTE_L`), modifiable et activable.

**Signature (lien e-mail, identité vérifiée via l'annuaire)**
- **Lecture obligatoire** : le signataire doit faire défiler chaque document jusqu'à sa dernière page avant de pouvoir signer.
- Zone de dessin **tactile** (souris, Android/iOS, macOS) ; signature mémorisable.
- **Mention libre manuscrite** (« Avis favorable ») : saisie, taille réglable et **positionnement par le signataire**.
- **Simple** : compte Active Directory. **SMS** : code à 6 chiffres envoyé au portable (validité 10 min). **Sécurisé** : certificat X.509 personnel → signature cryptographique **PAdES**.
- **Délégation de date à date** : un agent désigné signe à la place du signataire (sauf P12), avec la mention « signé X par délégation de Y ».

**Après signature**
- Apposition des signatures, du nom, de la fonction et de la mention dans le PDF, avec **code QR de vérification sur toutes les pages**.
- **Sceau PAdES de fin de circuit** (autorité de certification interne) garantissant l'intégrité.
- **Page publique de vérification** (sans authentification) via le QR, et **dossier de preuves** téléchargeable (ZIP : rapport PDF, empreintes SHA-256, certificats, journal d'audit, documents signés).
- **Vérification du sceau par DSIHUB** (intégrité + chaîne de l'AC interne) ; certificats techniques par signature pour les modes simple/SMS.

**Administration**
- `/admin/parapheur-certificats` : certificats P12 (vérifiés après usage), journal des signatures (dont le **numéro SMS utilisé**), contrôle de sécurité (empreintes, PAdES), **URL publique** du QR, activation du **sceau**, gestion de l'**AC interne**.
- Relances automatiques, gestion des délégations, recherche/filtres (état, signataire, date, texte libre).

**Visionneuse PDF unifiée**
- Zoom, bandeau de signature type Acrobat (signataires, dates, délégation, certificat, mention) ; rendu **pdf.js** sur mobile et Safari (zones raster/scans supportées via les décodeurs wasm).

**Déploiement DMZ (`parapheur-dmz/`)**
- Conteneur autonome servant la page publique de vérification, avec proxy nginx restreint au seul point d'entrée `/api/parapheur/verify/` (le reste de l'API interne n'est jamais exposé).

## [1.0.1] - 2026-09-04

### Corrections
- **Tickets** : le bouton « Reprendre » d'un ticket « En attente » ne remettait pas le ticket en statut « En cours ». Il appelait uniquement l'endpoint d'affectation (`/assign`), qui ne change le statut automatiquement que depuis « Nouveau » ou « Attribué ». Le changement de statut est maintenant déclenché directement dans ce cas. ([frontend/src/pages/Tickets/TicketDetail.tsx](frontend/src/pages/Tickets/TicketDetail.tsx))
- **Tickets** : en mode édition d'un ticket, le nom du demandeur apparaissait deux fois — une seconde fois avec son email juste en dessous du champ, comme s'il fallait le resélectionner. Le champ étant pré-rempli avec le demandeur actuel, la recherche automatique se déclenchait dès l'ouverture du mode édition et réaffichait le même résultat. Cette recherche initiale est désormais ignorée tant que l'utilisateur n'a pas modifié le champ.

## [0.3.0] - antérieur
Historique non documenté dans ce fichier (voir `git log`).
