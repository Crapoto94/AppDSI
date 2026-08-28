# DSI Hub — Présentation commerciale

> **Document de vente** : synthèse des modules, fonctionnalités et interactions de la plateforme.
> Complète la documentation fonctionnelle détaillée (`docs/DOCUMENTATION-FONCTIONNELLE.md`).

---

## Le produit en une phrase

**« Un portail unique qui couvre toute la chaîne IT d'une collectivité — du ticket usager à la facture opérateur, du téléphone attribué au budget engagé — dans une seule plateforme web intégrée, automatisée et pensée pour le pilotage. »**

---

## Le problème que nous résolvons

| Sans DSI Hub | Avec DSI Hub |
|---|---|
| Une demi-douzaine d'outils hétérogènes (GLPI, Excel, boîtes mail, agendas, fichiers NAS…) | **Un seul point d'entrée**, une interface cohérente, un compte unique |
| Les demandes arrivent par mail, par téléphone, par bouche-à-oreille : rien n'est tracé | **Helpdesk multi-canal** : tout devient un ticket, avec SLA, priorités et historique |
| Les coûts télécom/copieurs/licences sont découverts a posteriori | **Rapprochements automatiques** : lignes dormantes, doublons de facturation et contrats à échéance remontés avant qu'ils ne coûtent cher |
| Chaque saisie est répétée dans plusieurs applications | **Données saisies une fois, partagées partout** : organigramme, sites, tiers, parc, tâches |
| La direction demande « où on en est ? » et il faut compiler à la main | **Tableau de bord direction** en widgets, consultable en continu (mode kiosque) et envoyé par e-mail chaque semaine |

---

## La plateforme en chiffres

- **7 univers fonctionnels**, plus de **40 modules intégrés**
- **4 canaux d'entrée** vers le helpdesk : e-mail O365, chat live web, chat école par lien SMS, formulaire web — plus une réponse publique possible **sans aucun compte**
- **~19 graphiques** de statistiques helpdesk, calculés en *temps ouvré* réel (calendriers SLA)
- **~35 widgets** composables pour le tableau de bord direction, rotatifs en mode kiosque
- **10 phases** de cycle de vie projet avec scoring pondéré sur 10 critères et contrôle documentaire
- **IA embarquée** : reformulation des messages, synthèse automatique des transcriptions de réunions, extraction des tâches décidées
- **Zéro licence tierce** pour le cœur : autonome depuis GLPI, s'ouvre aux systèmes existants (Oracle, Active Directory, Azure AD/Entra, Microsoft Graph, Outlook/Teams)

---

## Les 7 univers fonctionnels

### 1. Socle & portail — « une porte d'entrée pour tous »

Portail d'accueil en tuiles **personnalisables** (ordre, colonnes) avec **badges d'alerte vivants** (tickets, certificats à renouveler, contrats expirés, consommables en attente…). Authentification Active Directory / Azure AD / locale. Demandes d'accès auto-service validées par l'admin. Messagerie interne paramétrable, notes & doctrines, aide contextuelle Markdown **sur chaque page**, vitrine des nouveautés et boîte à idées intégrée. MagApp complète le dispositif avec un **portail applicatif grand public** (catalogue d'applications, favoris, maintenances, idées).

**Argument clé** : l'utilisateur ne se forme qu'une fois ; l'admin pilote tout (visibilité par module, messages système, aide rédactionnelle) sans toucher au code.

### 2. Support & Helpdesk — « aucune demande perdue »

Le cœur du produit :
- Tickets avec statuts, priorités, VIP, observateurs, pièces jointes (y compris images collées dans un mail), commentaires publics/privés, vues Table/Kanban/Inbox/Live ;
- **Collecteur O365** : la simple écriture à une boîte support crée le ticket, classe incident/demande par mots-clés, ajoute les personnes en copie comme observateurs ;
- **Relances automatiques** des demandeurs silencieux puis **clôture automatique** — la file reste propre sans effort humain ;
- **Chat live** (agents et écoles) : chaque conversation devient un ticket, prise en charge en temps réel, alerte SMS aux techniciens pour les écoles, transcript envoyé à l'usager ;
- **Réponse publique par lien sécurisé** dans chaque e-mail : l'usager répond sans jamais créer de compte ;
- Statistiques complètes : SLA violés, charge par technicien, heures de pointe, top demandeurs/logiciels, âge du backlog…

**Argument clé** : le helpdesk absorbe tous les canaux et s'auto-nettoie ; le superviseur mesure tout en temps ouvré.

### 3. Parc, mobilité & infrastructure — « savoir ce que l'on a, et ce que ça coûte »

- **Parc informatique** issu de GLPI 10, enrichi Active Directory : qualité des données notée, doublons fusionnables, pyramide des âges, machines à renouveler, étiquettes imprimables ;
- **Mobilité** : cycle de vie complet des téléphones/tablettes — entrée en stock par réception scannée, attribution en deux phases avec **signature électronique** et fiche PDF, retour formalisé, historique événementiel ;
- **Lignes mobiles SFR** importées et **réconciliées automatiquement** avec les appareils : ligne sans appareil, IMEI divergent, titulaire incohérent — chaque anomalie a son action recommandée ;
- **Copieurs** : relevés de compteurs par import Excel **ou collecte SNMP directe**, coûts recalculés par tarif daté, détection d'anomalies (compteur décroissant, machine sans relevé), carte géographique, interventions SAV importées depuis la boîte du mainteneur ;
- **Consommables** : commande guidée par les agents (panier persistant, catalogue illustré), validation/commande/archivage avec e-mails automatiques et récap budgétaire mensuel ;
- **Stocks** multi-magasins : seuils d'alerte, scan code-barres avec lookup EAN, bons de livraison PDF personnalisés **signés au doigt**, numéros de série, **prévision de rupture** en jours ;
- **Réseau** : cartographie inter-sites (liens fibre/WAN/laser, fourreaux, VLANs, équipements) en carte et topologie, superposition des plans DXF ;
- **Vols** : dossiers vol/perte/casse circonstanciés, pièces administratives, suivi jusqu'au remboursement, indicateur DPD.

**Argument clé** : du câble au forfait mobile, l'inventaire est unique, à jour et croisé avec la facturation.

### 4. Télécom & finances — « arrêter de payer pour rien »

- **Télécom** : factures opérateurs **rapprochées en direct** avec la comptabilité Oracle ; inventaire lignes fixes/internet pour accompagner la fin du cuivre ; coûts mobiles par import SFR ; mise en évidence immédiate des **lignes dormantes**, des **lignes résiliées encore facturées** et du **hors inventaire** ;
- **Suivi budgétaire** : exécution annuelle complète (voté, engagements, commandes, factures, paiements) par section/service/nature, règle M57, moteur de rubriques mappées configurable sans développement ;
- **Préparation budgétaire N+1** : proposition par service comparée au réalisé, reconductions de contrats projetées automatiquement ;
- **Rencontres budgétaires** : demandes arbitrées, réunions convoquées par e-mail avec invitation **Outlook/Teams**, compte-rendu diffusé, suivi des décisions ;
- **Contrats** : grille dense avec alertes expirés/échéances ≤ 90 jours, SLA, reconductions, liaison directe aux engagements SEDIT ;
- **Tiers** : référentiel fournisseurs Oracle consultable avec contacts et historique commandes/factures.

**Argument clé** : le module paie sa propre existence dès la première année, par la seule suppression des lignes dormantes et des renouvellements oubliés.

### 5. Projets & pilotage — « du besoin à la recette, sans perte de fil »

- **Portefeuille projets** : cycle en 10 phases contrôlé par étapes actives et **checklist documentaire obligatoire** ; scoring pondéré sur 10 critères (alignement stratégique, risque, coût…), « météo », favoris ;
- Rôles fins : chef de projet, commanditaire, DPO… et **PMO scopés** par service/secteur/direction ;
- Fiche projet : **Gantt** avec jalons, groupes et dépendances vérifiées automatiquement, documents versionnés, indicateurs, journal complet ;
- **Revue de projets** : sélection des dossiers, commentaire par projet, convocations e-mail, tâches générées ;
- **Planning général** (Gantt consolidé) et **journal global** : le pouls du portefeuille en un écran ;
- **Transcript Manager** : déposez la transcription Teams, obtenez **résumé IA et tâches extraites automatiquement**, rapprochement des locuteurs via l'AD ;
- **Mes tâches** : boîte unifiée qui **agrège toutes les sources** (projets, revues, réunions, transcripts, tickets, MS To Do) — cocher ici met à jour le module d'origine ; rappel quotidien 8 h et notification à l'affectation ;
- **Calendrier DSI** : absences, télétravail, hotline, maintenances et déploiements consolidés (RH Demabs + O365 + saisies), **e-mail du jour automatisé**, cumuls de télétravail.

**Argument clé** : la gouvernance projet tient dans l'outil — arbitrage, priorisation objectivée, traçabilité totale — et chacun ne suit ses tâches qu'à un seul endroit.

### 6. Référentiels & RH — « une source de vérité sur les personnes et les lieux »

- **RH** : référentiel agents synchronisé depuis Oracle, matching automatique avec Active Directory et Azure (licences incluses), organigramme avec responsables déduits et postes vacants, **onboarding des arrivants**, encadrants avec téléphones proposés depuis le parc mobile, **relances automatiques des renouvellements de contrats** des contractuels ;
- **Param Ville** : élus, patrimoine bâti hiérarchique, écoles, carte interactive géocodée — socle partagé par le réseau, les copieurs et les cartes métier ;
- **Certificats** : import PDF intelligent (lecture automatique du numéro, du produit et de la validité), alertes péremption, pilotage des renouvellements ;
- **Badge de présence** : partout où un agent est cité (demandeur, technicien, bénéficiaire…), l'app indique en temps réel s'il est **présent, parti (avec date), pas encore arrivé ou inconnu** — interrogeant RH Studio.

**Argument clé** : finis les annuaires périmés ; le contexte humain suit chaque dossier automatiquement.

### 7. Administration & intégrations — « robuste, ouvert, récupérable »

- Administration centralisée : comptes et habilitations, visibilité par module, explorateur SQL, organisation ;
- **Sauvegardes complètes programmables** (SQLite + PostgreSQL + fichiers) avec rétention, destination réseau et alerte si retard ;
- **Clés d'API** machine-to-machine hashées et scopées pour les intégrations ;
- **Imports Oracle automatisés** (RH et finances) planifiables jusqu'à toutes les 10 minutes ;
- Registre des **APIs externes** avec tests de connexion ;
- GLPI conservé en lecture/historique : **la plateforme est autonome** mais n'a rien perdu.

---

## La vraie force : les modules travaillent ensemble

Quelques flux croisés impossibles avec des outils séparés :

| Scénario | Enchaînement automatique |
|---|---|
| **Un maillot d'école écrit au support** | E-mail → collecteur O365 → ticket créé + observateurs + PJ inline réécrites → réponse du technicien par mail avec **lien public** → l'usager répond sans compte → SLA première réponse comptabilisé |
| **Un directeur d'école clique sur le SMS reçu** | Lien tokenisé → chat live authentifié sans compte → session notifiée en temps réel aux techniciens → ticket lié créé → classification imposée avant clôture → transcript + résumé envoyés |
| **Un téléphone arrive au DSI** | Réception stocks scannée → item sérialisé → attribution Mobilité phase 1/2 avec **signature PDF** → réconciliation avec la ligne SFR → si vol : dossier Vols pré-rempli depuis le parc, lié au ticket et archivé en GED |
| **Un contrat arrive à échéance** | Badge rouge sur le portail + alerte ≤ 90 j → engagement visible dans Finance → reconduction projetée dans la **préparation budgétaire N+1** → relance e-mail automatique |
| **Une réunion de revue a lieu** | Convocations e-mail → transcription déposée → **synthèse IA** → tâches extraites → elles apparaissent chez leurs responsables dans Mes tâches → rappel quotidien 8 h → avancement reflété dans le Gantt et le journal |
| **La direction veut une vision** | Tableau de bord en widgets (~35) alimenté par tous les modules, rotation kiosque sur écran, envoi e-mail hebdomadaire automatique |
| **Un toner est commandé** | Demande agent (organigramme pré-rempli) → badge en attente sur le portail admin → validation → e-mails automatiques à chaque étape → cumul budgétaire mensuel |

**En résumé** : une donnée saisie une fois irrigue le helpdesk, le parc, la finance, les projets et le tableau de bord — sans ressaisie ni export/import.

---

## Différenciateurs face aux solutions du marché

1. **Autonomie** : plus de dépendance à GLPI ni à un éditeur externe ; hébergement et données maîtrisés, conformes aux exigences d'une collectivité.
2. **Ouverture maîtrisée** : se connecte à l'existant (Oracle finances/RH, Active Directory, Azure AD, Microsoft Graph/O365) plutôt que de l'imposer.
3. **Automatisation omniprésente** : collecte des mails, relances, clôtures, imports planifiés, e-mails transactionnels, calendriers du jour, relances contractuelles — l'outil travaille la nuit.
4. **IA utile, pas gadget** : reformulation des messages usagers, synthèse de transcriptions, extraction structurée des tâches.
5. **Pilotage intégré** : KPI partout (badges de portail, vignettes helpdesk, widgets direction) et non dans des rapports à part.
6. **Expérience mobile-first** : actions rapides techniciens, réponse publique, chat école — tout se fait aussi depuis un smartphone.
7. **Adoption facilitée** : aide contextuelle sur chaque page, portail simplifié pour les agents, demandes d'accès en libre-service.
8. **Robustesse opérationnelle** : sauvegardes programmables vérifiées par watchdog, suppression logique (rien ne disparaît), clés d'API hashées, traçabilité/journaux systématiques.

---

## À qui s'adresse la plateforme

| Public | Ce qu'il y gagne |
|---|---|
| **Direction / DSI** | Vision consolidée temps réel, arbitrages objectivés (scoring projets), coûts télécom/copieurs sous contrôle |
| **Techniciens support** | File propre (relances/clôtures auto), contexte complet (matériel du demandeur, présence), actions rapides mobiles |
| **PMO / chefs de projet** | Workflow outillé, Gantt, revues, tâches unifiées, traçabilité |
| **Gestionnaires (stocks, mobilité, copieurs)** | Scan, signatures, seuils, prévisions de rupture — moins de papier, zéro ressaisie |
| **Agents métiers / écoles** | Un seul portail, commande de consommables en 5 clics, réponse au support sans compte |
| **Finances / achats** | Rapprochement factures, engagements liés aux contrats, préparation budgétaire assistée |

---

## Argumentaire flash (30 secondes)

> « Le DSI Hub remplace la pile GLPI + Excel + mails + agendas par **un portail unique** où chaque demande devient un ticket quel que soit le canal, où le matériel, les lignes et les contrats sont **réconciliés automatiquement** avec la facturation, où les projets suivent un **workflow outillé avec scoring**, et où la direction dispose d'un **tableau de bord vivant** alimenté par tous les modules. Les tâches répétitives — relances, imports, notifications, synthèses — sont **automatisées**, et l'IA prend en charge la reformulation et les comptes rendus. Une donnée saisie une fois sert partout. »

---

*Détails exhaustifs module par module : voir `docs/DOCUMENTATION-FONCTIONNELLE.md`. Guides helpdesk : `docs/GUIDE-*.md`.*
