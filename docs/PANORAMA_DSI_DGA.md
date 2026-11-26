# Panorama de la DSI — note d'accueil pour Jean-François Lorès (DGST et transitions)

24/11/2026

La DSI traite environ 350 demandes par mois avec un support très sollicité, a connu une vingtaine d'incidents réseau et infrastructure en deux mois, et prépare 2027 sous contrainte budgétaire (cybersécurité, numérique responsable, dématérialisation, applications développées en interne).

## Les sujets du moment

Huit sujets ressortent des réunions de direction, des tickets, des fils Teams Crise et Général, des projets et des contrats. Ils sont classés selon les priorités déclarées.

| # | Sujet | Où on en est | Arbitrage à attendre du DGA |
| --- | --- | --- | --- |
| 1 | Résilience réseau et infrastructure | Internet et VPN coupés les 5, 17 et 20/11 ; panne globale le 30/09 ; NAS Syno05 hors service début octobre ; disque Oracle02 saturé. Les projets de fond (boucle optique, sauvegardes, DMZ) sont encore au stade « idée ». | Plan de résilience chiffré et priorisé en 2027 |
| 2 | Cybersécurité et conformité | Analyse de risques EBIOS RM / NIS2 en cours avec le SIIB ; sécurisation AD et O365 ; 172 postes hors de l'outil HarfangLab ; Windows 2012 à traiter avant fin janvier 2027. | Périmètre et financement des mesures retenues au budget 2027 |
| 3 | Numérique responsable | 107 propositions collectées ; feuille de route validée le 19/11 ; actions à partir de 2027 ; 3 h par mois pour chaque contact des directions. | Portage politique et moyens ; arbitrage sobriété contre résilience |
| 4 | Vibecoding, IA et applications maison | Une quarantaine d'applications dans C:/dev, réunion hebdomadaire, charte IA en attente d'arbitrage. | Statut de ces applications, hébergement, maintenance et charte IA |
| 5 | Budget 2027 et contrats | 162 contrats : 1,22 M€ en 2026, 1,52 M€ prévus en 2027 (+25 %). L'incertitude État pèse 3 à 5 M€ sur la Ville. | Enveloppe 2027 et renégociations |
| 6 | Dématérialisation et projets métiers | Signature électronique, interopérabilité par API, Espace Démarches Citoyen, GECOS (CMPP), Ocealia Planning, AirsDélib, Elise V5 vers V6. | Ordre de passage des chantiers |
| 7 | Santé du portefeuille projets | 58 projets sur 95 restent à l'état « idée », 8 n'ont pas de chef de projet. | Règle de qualification et de priorisation |
| 8 | Support et charge des équipes | Environ 2 000 tickets en 6 mois ; 361 encore ouverts, dont 86 de plus de 90 jours. | Renforts et traitement du stock |

Deux grands projets de la Ville ont un volet numérique à anticiper : le futur Centre Technique Municipal (réseaux et bâtiment connecté, acquisition foncière envisagée fin 2027) et l'Espace Démarches Citoyen.

## Résilience réseau et infrastructure

Les incidents des deux derniers mois ont une origine commune : énergie des baies, liens et boucle optique, stockage. Les projets qui traitent ces causes ne sont pas encore lancés.

| Date | Incident (fil Teams Crise) | Effet |
| --- | --- | --- |
| 20/11 | Plus d'internet, VPN hors service | DSI et télétravail |
| 17/11 | Plus de réseau pour la DSI | DSI |
| 13/11 | Panne mondiale de la messagerie Outlook (Microsoft) | Toute la collectivité |
| 06/11 | Plus d'internet dans les écoles ; lecteur réseau X: en erreur | Écoles, agents |
| 05/11 | Coupure réseau, VPN actif mais sans Outlook, Teams ni internet | Télétravailleurs |
| 26/10 | Panne du switch de boucle à Joliot | Plusieurs sites hors service |
| 20/10 | Ouverture de session lente (plus de 10 minutes) | Postes et lecteurs réseau |
| 07/10 | DSIHub hors service | Accueils bloqués pour Synbird |
| 05/10 | Panne de courant dans la baie de l'école Henri Barbusse ; disque /home d'Oracle02 plein à 100 % | Internet et téléphonie de l'école ; application RH menacée |
| 01/10 | NAS Syno05 hors service (remise en service estimée à 7 jours) ; lecteur W: indisponible | Achats, Marchés publics, Affaires civiles |
| 30/09 | Internet global coupé (ligne opérateur, coupure de courant à Robespierre), VPN touché ; AirsDélib et iParapheur en panne | Écoles, services |

La réunion de direction du 12/11 a décidé de mieux communiquer les incidents majeurs et de faire accompagner tout intervenant externe en salle serveur (lecteurs de badge en panne depuis plus d'une semaine).

**Projets de fond, à l'état actuel dans le portefeuille :**

- Remise en route de la boucle optique : « idée », échéance du 31/07/2026 dépassée.
- Gestion des sauvegardes : « idée », échéance du 31/07/2026 dépassée.
- Mise en œuvre d'une DMZ : « idée ».
- Obsolescence Windows 2012 : « idée », échéance au 31/01/2027.
- Radius / PacketFence (Wi-Fi sécurisé, 802.1X) : « demande initiale », échéance au 02/12/2026, plan présenté en réunion de direction le 05/11.

## Cybersécurité et conformité

La DSI mène plusieurs chantiers de sécurité en parallèle, portés par une équipe très réduite (deux personnes au groupe RSSI).

- **Analyse de risques EBIOS RM / NIS2** avec le SIIB : cadre validé en réunion, méthode en cinq ateliers. La DPO a demandé que ce travail complète les pratiques existantes plutôt que de les remplacer. Le financement des mesures de remédiation reste à obtenir.
- **Sécurisation AD et O365** : protocoles LM et NTLM désactivés, MFA en place, stratégie de mots de passe forts et chiffrement AES à poser par GPO, comptes de service et comptes de secours à cadrer, vulnérabilités critiques puis moyennes à prioriser.
- **Couverture des postes** : 172 postes présents dans l'AD mais absents de l'outil HarfangLab ; extraction et synchronisation décidées le 12/11.
- **Sensibilisation** : les campagnes d'hameçonnage montrent un taux de clic préoccupant, y compris au sein de la DSI ; risque deepfake voix et vidéo pointé en réunion de direction.
- **Veille et failles** : failles PHP (20/10, CVSS 9,2, clos), OpenSSH (05/11, CVSS 8,1, aucun actif exposé identifié), application Carte ADS signalée le 27/10.
- **Accès prestataires** : cadrage d'un bastion engagé le 06/09 ; migration de CART@DS en DMZ planifiée avec le prestataire.
- **Outils évalués** : Gatewatcher, Integrity 360 (ex Holiseum), Hucency (ex Avant de Cliquer) ont été présentés en septembre.

Une note budgétaire vers la Direction générale précise les lignes cyber retenues pour le BP 2027 ; elle est en relecture.

## Transitions : numérique responsable

La DSI pilote le programme Numérique Responsable (NR) de la collectivité et vient d'en valider la feuille de route, avec un démarrage des actions en 2027. La DSI est rattachée au pôle « Transitions », confirmé en réunion de direction du 05/11.

- **Programme NR** : passage de la phase 2 (ambition) à la phase 3 (action) en octobre ; 107 actions proposées par les directions, notées sur l'impact et l'effort ; feuille de route globale validée le 19/11.
- **Gouvernance** : le rôle de « référent » est remplacé par un « point de contact » par direction, à 3 h par mois.
- **Tension à arbitrer** : la sobriété numérique (moins d'équipements, de stockage) s'oppose parfois à la robustesse et à la résilience demandées par ailleurs (voir section réseau).
- **Actions déjà engagées** : projet de réemploi de postes informatiques pour les jeunes (étude DSI), guide du numérique (80 %), charte informatique, optimisation des lignes téléphoniques analogiques, partenariat avec des étudiants de l'ESIEA (projets « Économies d'énergie » et « Numérique responsable »).
- **Lien avec la transition écologique** : en réunion DGST du 16/11, la Direction des bâtiments juge l'outil métropolitain SAVI insuffisant pour piloter l'énergie ; un outil de suivi interne avec alertes et historique est souhaité. C'est un sujet où la DSI peut apporter une réponse (données, API, développement interne).
- **Gouvernance politique** de la stratégie bas carbone jugée confuse par les équipes (chevauchement entre élus : mobilités, énergie, déchets).

## Vibecoding, IA et applications maison

La DSI développe ses propres outils avec l'aide de l'IA depuis l'été : DSIHub est passé en version 1.0.0 en production le 03/09, une réunion hebdomadaire « vibecoding » a démarré le même mois et une formation d'initiation s'est tenue le 23/09. Le dossier C:/dev contient une cinquantaine de dossiers, dont 36 dépôts git. Le classement ci-dessous est fait d'après les noms et les derniers messages de commit, sans avoir ouvert chaque application.

| Famille | Applications | Dernière activité |
| --- | --- | --- |
| Socle et portails | AppDSI (DSIHub, MagApp, tickets, entretiens professionnels, réunions de service), InteractIvry (accès machine à l'API DSIHub), API-Nova (API par compte, administrateurs via AD), APM (agenda O365 via API), IApp (assistant IVRIA connecté en MCP) | 17 à 24/11 |
| Finances, RH, gestion | ODP (occupation du domaine public, titres de recette), locatif et GestionLocative (gestion locative sur ASTECH), TB_finance, Prepa-Budgetaire, mandat, sub et subexplorer (subventions), Studio-RH, SuiviConges, plan_formation | 16/09 à 21/11 |
| Services aux directions | delib (délibérations avec import assisté par IA), Stats_Elise (statistiques courrier), Observatoire (observatoire de la ville, données ouvertes), GRU, Agora | 10/06 à 26/10 |
| Sécurité, crise, GED | crise et gestioncrise, analyse-mail et dmarc, alfresco (GED en production dockerisée), esup-signature (signature électronique), astech-explorer | 07/08 à 29/09 |
| À clarifier (apparence personnelle) | AnnivVincent, AppliAnniv, Monstres, openlmnp, HA (domotique) | 28/06 à 12/11 |

**Règles déjà posées en réunion** : tout code produit sur le temps de travail appartient à la collectivité ; dépôt sur un Git interne ; fichier de spécifications commun (« manifeste ») et design system unique ; mutualisation des API (authentification AD, mail et SMS via DSIHub) ; liberté de l'outil et du modèle d'IA pour chaque développeur.

**Points de vigilance pour le DGA** :

- La charte IA est « en arbitrage » et la charte informatique « en étude DSI » : le cadre n'est pas encore écrit.
- Les applications critiques (DSIHub, ODP, gestion locative) reposent sur un nombre très réduit de personnes : documentation, sauvegardes et reprise de maintenance sont à organiser.
- Plusieurs applications traitent des données RH, financières ou de locataires : RGPD, hébergement et audit sécurité sont à formaliser.
- Le remplacement d'Agora et d'Opensub par des outils internes est proposé au portefeuille : il faut arbitrer entre achat, support éditeur et développement interne.

## Budget 2027 et contrats

Les contrats suivis dans le DSIHub représentent 1,22 M€ en 2026 et 1,52 M€ prévus en 2027. Le contexte est tendu : la Direction générale estime l'impact de l'incertitude sur le budget de l'État entre 3 et 5 M€ pour la Ville (DGST du 16/11).

| Service (code) | Contrats | Montant 2026 |
| --- | --- | --- |
| BF8 (applications et projets) | 109 | 608 k€ |
| BF1 (direction et pilotage) | 28 | 527 k€ |
| BF9 (support et déploiement) | 10 | 41 k€ |
| BF6 (systèmes et réseaux) | 15 | 41 k€ |

**Échéances des huit prochains mois** (prévision 2027 en k€) :

| Fin de contrat | Objet | Fournisseur | Prévision 2027 |
| --- | --- | --- | --- |
| 08/12/2026 | Dameware (11 licences) | Orsenna | 1,4 |
| 29/12/2026 | Gatekeeper | Query Informatique | 3,7 |
| 29/12/2026 | Consommation électrique GIPC | GIPC | non prévue |
| 30/12/2026 | Upview | Ipoview + CFI | 4,3 |
| 29/01/2027 | Licences bornes Wi-Fi | Xtreme Networks (via Sipperec) | 5,0 |
| 25/02/2027 | Support Oracle (ULA) | Oracle | 25,0 |
| 20/03/2027 et 26/04/2027 | Adelyce (atelier salarial, Mon Observatoire) | Adelyce | 17,1 |

**À vérifier avant le budget** : 76 des 162 contrats ont une date de fin déjà passée dans la base (reconduction tacite ou dates non mises à jour). Les contrats réseau et téléphonie (BF6) paraissent peu représentés au regard des enjeux : le suivi des abonnements opérateurs est peut-être tenu ailleurs (module Télécom).

## Portefeuille projets et activité du support

**Projets.** Le portefeuille compte 95 projets : 58 « idées », 7 « demandes initiales », 6 en étude DSI, 4 en planification, 7 en cours, 5 en recette, 4 en clôture, 1 en arbitrage, 1 en pause et 2 clôturés. Seuls une vingtaine avancent réellement ; les projets suivants sont les plus visibles.

| Projet | Statut | Avancement | Chef de projet | Remarque |
| --- | --- | --- | --- | --- |
| Gestion et facturation ODP | En cours | n.c. | M. Chevalier | Projet structurant, météo soleil |
| Business Objects | En cours | 80 % | E. Kron | Météo orage, fin prévue 06/2027 |
| Vidéoverbalisation | Planification | 20 % | E. Kron | Risque élevé, échéance du 01/09/2026 dépassée |
| RMAN (sauvegardes Oracle) | Planification | 50 % | E. Kron | Fin prévue 30/11/2026 |
| Synbird | En recette | 90 % | Y. Taraki | Utilisé par les accueils |
| GIR (boîtes à clés) | En recette | 90 % | N. Chemame | Plusieurs sous-projets associés |
| Service communal d'hygiène et de santé | En clôture | 90 % | Y. Taraki | Logiciel métier |
| Renouvellement des smartphones | Demande initiale | 20 % | Y. Taraki | Échéance du 02/11/2026 dépassée |
| Guide du numérique | En cours | 80 % | non affecté | Lien avec le numérique responsable |
| Charte IA ; charte informatique | Arbitrage ; étude DSI | 0 % ; 20 % | M. Masson ; L. Rigoulat | Cadre de l'usage de l'IA et du SI |

**Santé du portefeuille.** Les statuts et les dates ne sont plus tenus à jour (Synbird est en recette avec une fin prévue en 2024). Huit projets n'ont pas de chef de projet. Deux personnes détiennent plus de la moitié des projets, dont beaucoup d'« idées » jamais qualifiées (voir section Qui fait quoi).

**Support.** Entre juin et novembre, la DSI a reçu entre 240 et 390 tickets par mois, soit environ 2 000 sur la période (370 en novembre à ce jour). Le stock ouvert est de 361 tickets : 176 de moins de 30 jours, 99 de 30 à 90 jours, 86 de plus de 90 jours. Les motifs les plus fréquents sont le matériel (325), les logiciels (312), les comptes et permissions (283), les services de base (215), la téléphonie (173) et le réseau (161). 371 tickets (19 %) n'ont pas de catégorie. L'équipe Support et Déploiement traite 1 322 des affectations, soit environ 80 %.

Le DSIHub est le canal de demande privilégié depuis septembre : les demandes passent par le magasin d'applications et chaque action doit être documentée dans un ticket (rappel du 05/11).

## Qui fait quoi

Cette répartition croise les groupes du DSIHub, les affectations de tickets, les chefs de projet et les fils Teams. Les fonctions sont déduites de l'activité et les rattachements ont été validés le 24/11. Charge = tickets affectés de juin à novembre.

| Service | Responsable | Équipe et sujets portés | Charge tickets |
| --- | --- | --- | --- |
| Direction et pilotage (BF1) | M. Chevalier | Pilotage, PMO de la direction, DSIHub et applications internes. V. Fourbé (assistante de direction), I. Abbas et F. Brun (administratif, commandes). | 12 (M. Chevalier) |
| Sécurité (RSSI) | V. Fillaux | T. Contamine : veille, failles, EBIOS / NIS2, phishing, AD et O365. | 14 et 9 |
| Systèmes, réseaux, téléphonie (BF6, SIRS) | D. Gaultier (PMO BF6) | M. Brasseleur : systèmes, Oracle, stockage. P. Poilevet : réseau, boucle optique, DMZ, Radius, Ubiquity. Y. Cherif : téléphonie, Wi-Fi, écoles. M. Diakité, R. Sahraoui (sauvegardes), C. Speeckaert : systèmes. S. Abdiche : câblage. | 105 (Cherif), 29, 26, 18, 4, 4 |
| Support et déploiement (BF9) | F. Plichart | S. Fortas, S. Soeun, D. Atayi, H. Ahamada, M. Cavarretta, M. Badoud, F. Inthavisay : postes, comptes, matériel, déploiements, interventions sur site. | 209 (Plichart), 253, 225, 191, 176, 65, 50 |
| Écoles | R. Goudjil | C. Nemorin : informatique des écoles. | 1 |
| Bureau des projets et applications (BF8) | F. Bouatou (PMO BF8) | N. Chemame, Y. Taraki, C. Laffrat, E. Kron, A. Ferreira : chefs de projet et intégration des logiciels métier (Concerto, Elise, Sedit, Synbird, AirsDélib…). | 21 (Ferreira), 3 (Taraki), 0 pour les autres |
| Chargés de mission | L. Rigoulat ; M. Masson | L. Rigoulat : communication DSI, charte informatique, animation du numérique responsable. M. Masson : charte IA, publication des actes administratifs. | 4 (Rigoulat) |

**Points de fragilité** :

- **Support** : cinq techniciens traitent environ 74 % des tickets affectés, et le responsable du service en traite lui-même 209.
- **Bureau des projets** : N. Chemame porte 34 projets dont 2 actifs, C. Laffrat 11 dont aucun actif ; les projets réellement en cours reposent sur E. Kron, Y. Taraki et L. Rigoulat.
- **Cybersécurité** : deux personnes pour EBIOS / NIS2, la veille, la sensibilisation et les alertes.
- **Réseau et systèmes** : un petit noyau (M. Brasseleur, P. Poilevet, Y. Cherif) intervient sur la plupart des pannes de l'automne.
- **Applications maison** : la maintenance repose sur peu de personnes (voir section Vibecoding).
- **Encadrement** : une note de service du 25/09 annonce la prise de fonction de deux responsables de service ; leur identité n'apparaît pas dans mes sources.

## Chiffres clés de l'activité

Ces indicateurs viennent du DSIHub (base lue en lecture seule le 24/11/2026). Une version illustrée figure dans la présentation `PANORAMA_DSI_DGA.pptx`.

**Support et tickets**

| Indicateur | Valeur | Évolution |
| --- | --- | --- |
| Tickets créés de janvier à novembre | 3 680 en 2026 | 4 487 en 2025 (−19 %), 5 574 en 2024 : −34 % en deux ans |
| Tickets créés par année | 5 336 (2020), 6 697 (2021), 5 857 (2022), 6 227 (2023), 5 907 (2024), 4 780 (2025) | Baisse régulière depuis 2023 |
| Délai de résolution (6 mois) | Médiane 1,2 jour, moyenne 11,3 jours | Moyenne tirée par quelques tickets très anciens |
| Stock ouvert | 361 tickets : 176 de moins de 30 jours, 99 de 30 à 90 jours, 86 de plus de 90 jours | À purger |
| Canaux d'entrée (12 mois) | Collecteur de messagerie 40 %, mail 31 %, téléphone 12 %, DSIHub 9 %, magasin d'applications 5 % | Le mail domine |
| Volume historique | 39 009 tickets et 52 159 suivis en base | Données GLPI reprises |
| Satisfaction | 3 réponses seulement (4,67 sur 5) | Non significatif : aucune mesure fiable |

**Contrats**

| Indicateur | Valeur | Évolution |
| --- | --- | --- |
| Nombre de contrats | 162 (146 actifs, 16 archivés) | 34 contrats démarrés en 2025, 21 en 2024, 7 en 2026 |
| Montants annuels | 441 k€ (2022), 563 k€ (2023), 764 k€ (2024), 1 349 k€ (2025), 1 217 k€ (2026) | Multiplié par 2,8 en quatre ans |
| Prévisions | 1 524 k€ (2027), 1 592 k€ (2028) | +25 % en 2027 |
| Poids de Microsoft O365 | 290 k€ en 2026, soit 24 % du total | Premier contrat, devant CART@DS (77 k€) et Doctolib (65 k€) |
| Contrats par type | Maintenance 62, abonnement 38, licences 24 | Abonnements 254 k€, maintenance 210 k€ en 2026 |
| Échéances des contrats actifs | 33 en 2027, 26 en 2028, 16 en 2029 | 67 ont une date de fin déjà passée |

Une part de la hausse 2024-2025 vient de la saisie progressive des contrats dans le DSIHub (51 contrats sans année initiale) : la tendance est à confirmer avec la comptabilité.

**Parc, réseau et téléphonie**

| Indicateur | Valeur |
| --- | --- |
| Postes de travail | 1 564 dans l'AD (2 108 fiches dans l'inventaire historique) |
| Écrans, imprimantes, copieurs | 2 436 écrans, 440 imprimantes, 114 copieurs suivis |
| Lignes mobiles | 1 293 lignes, 1 324 appareils |
| Lignes fixes et accès internet | 322 (316 en service, 6 en résiliation) |
| Équipements réseau | 186 |
| Écoles et certificats | 28 écoles, 140 certificats |

**Données, applications et usages**

| Indicateur | Valeur |
| --- | --- |
| Base de données | 3,8 Go, 48 schémas applicatifs ; tickets 1,4 Go, GRU 0,6 Go (107 000 usagers), GLPI historique 0,2 Go |
| Catalogue MagApp | 115 applications, 302 demandes d'applications (119 en juin, 65 en octobre, 15 en novembre), près de 70 000 clics |
| IA interne | 949 appels en septembre 2026 |
| Messages envoyés par le DSIHub | 19 770 mails, 1 374 SMS |
| GED | 5 077 documents |
| Réunions transcrites | 87 au total, 25 en septembre, 14 en octobre, 12 en novembre |

## Forces et faiblesses par service

Lecture déduite des chiffres ci-dessus, des réunions et des fils Teams ; à discuter avec chaque responsable.

| Service | Forces | Faiblesses |
| --- | --- | --- |
| Support et déploiement (BF9) | Médiane de résolution d'un jour ; 1 130 tickets résolus en 6 mois ; doctrines écrites et canal DSIHub | 202 tickets ouverts ; 5 techniciens portent 74 % de la charge ; le responsable traite lui-même 209 tickets |
| Systèmes, réseaux, téléphonie (BF6) | Expertise réseau et systèmes réunie ; médiane d'un jour sur 163 tickets ; plan Wi-Fi sécurisé (Radius) préparé | Pannes répétées (boucle, énergie, stockage) ; boucle optique, sauvegardes et DMZ encore en « idée » ; trois agents sur la plupart des pannes |
| Projets et applications (BF8) | 109 contrats et logiciels métier suivis ; 9 projets en recette ou en clôture ; portefeuille recensé | 58 idées jamais qualifiées ; 34 projets sur un seul chef de projet ; statuts et dates non tenus à jour |
| Direction et pilotage (BF1) | Gouvernance en place (REDI, 16 doctrines) ; DSIHub 1.0.0 en production ; rattachement au pôle Transitions | Applications maison dépendantes de peu de personnes ; chartes IA et informatique non écrites ; responsables de service à identifier |
| Sécurité (RSSI) | Démarche EBIOS RM / NIS2 structurée ; NTLM désactivé, MFA en place ; veille active (failles PHP, OpenSSH) | Deux personnes seulement ; 172 postes hors de l'outil HarfangLab ; taux de clic phishing préoccupant ; Windows 2012 à traiter |
| Écoles | Équipe dédiée de 2 agents ; pannes suivies dans le fil Crise ; 28 écoles couvertes | Pannes de liens et d'énergie récurrentes ; 1 seul ticket affecté en 6 mois (traçabilité faible) ; dépendance aux appels directs |

## Décisions à demander au DGA, points à valider et limites

**Cinq arbitrages à proposer à M. Lorès :**

1. Un plan de résilience réseau et stockage chiffré, intégré au budget 2027 (boucle optique, sauvegardes, DMZ, Windows 2012, énergie des baies).
2. Le périmètre et le financement des mesures cyber issues d'EBIOS RM / NIS2.
3. Le portage et les moyens du programme numérique responsable, et la règle d'arbitrage entre sobriété et résilience.
4. Le cadre des applications développées en interne : charte IA, hébergement, maintenance, RGPD, et choix entre acheter et développer (Agora, Opensub).
5. Un renfort ou une réorganisation sur le support, le bureau des projets et la cybersécurité, avec le tri du portefeuille de 95 projets.

**À valider avec vous avant envoi :**

- Les rattachements du tableau Qui fait quoi sont validés (déduits des groupes de tickets, des projets et des fils Teams).
- Chargés de mission confirmés : L. Rigoulat et M. Masson. Reste à nommer : les deux responsables de service qui ont pris leurs fonctions le 25/09.
- Le classement des dossiers de C:/dev, en particulier ceux qui semblent personnels.
- Le ton sur les fragilités nominatives, que vous avez demandé complet.

**Limites de cette note :**

- Teams : seuls les 50 derniers messages des canaux Crise et Général de l'équipe DSI ont été lus ; les autres canaux (Sécurité, Projets, Management, Dossiers délicats) ne l'ont pas été.
- Réunions : les comptes rendus de direction, CODIR, DGST, ateliers NR et points cyber ont été lus en synthèse ; ils sont générés par IA et n'ont pas tous été relus.
- Base du DSIHub : données lues en lecture seule ; les statuts de projets, dates de contrats et catégories de tickets ne sont pas toujours à jour.
- Les montants sont ceux du DSIHub, non rapprochés de la comptabilité (Sedit).
