# Le service fait : processus complet

Le **service fait** est l'attestation que la prestation ou la fourniture facturée a bien été réalisée. Il est **enregistré dans SEDIT** : sans lui, la facture ne peut pas passer à l'étape suivante (préliquidation par les services financiers, puis mandatement et paiement).

Il se traite depuis **MagApp › Mes outils › Mes factures** (pour les agents des directions) et depuis la page **Factures** du DSI Hub (pour la DSI et les finances).

## Qui peut faire quoi ?

| Rôle | Ce qu'il peut faire |
|---|---|
| **Agent avec droit de modification SEDIT** sur le service de la facture | Lancer un circuit de validation, ou déclarer lui-même le service fait ; annuler un circuit en cours |
| **Vérificateur** désigné | Valider, valider avec réserves, refuser, retourner, transférer ou mettre en pause |
| **Directeur** de la direction | Être informé de l'issue, ou viser après le vérificateur |
| **Agent en consultation seule** (droit d'interrogation, accès partagé) | Voir la facture et son état ; aucun bouton d'action |

## Les deux façons de traiter une facture

### A. Circuit de validation (« Lancer SF »)

À utiliser quand **une autre personne** doit attester que la prestation est réalisée.

1. **Lancer** : choisissez le **vérificateur** (agents de **votre direction** uniquement). Option : directeur **informé** ou **avec visa**.
2. **Mail au vérificateur** : il reçoit un lien. Depuis MagApp, le lien mène à MagApp (adresse paramétrée par l'administrateur) et **ne contient aucun jeton** : le vérificateur **s'identifie dans MagApp** (connexion si son appareil n'a pas de session), puis est redirigé vers la validation. Seul le vérificateur désigné peut l'ouvrir.
3. **Décision du vérificateur** (il consulte la facture et ses pièces SEDIT) :
   - **Valider** ;
   - **Valider avec réserves** : commentaire obligatoire ;
   - **Ne pas valider** : motif obligatoire ;
   - **Ne me concerne pas** : la demande est retournée ;
   - **Transférer** à un autre agent ;
   - **Mettre en pause** : motif obligatoire.
   À la validation, **le vérificateur saisit la date de service fait**.
4. **Enregistrement dans SEDIT** : le service fait est validé, la facture passe à l'étape de préliquidation et un **procès-verbal scellé** est joint à la facture dans SEDIT.
5. **Visa du directeur** (si choisi) : après le vérificateur, le directeur reçoit à son tour un lien. L'enregistrement dans SEDIT n'a lieu qu'après son visa, et le procès-verbal porte les deux signatures.

### B. Déclaration directe (« Faire SF »)

À utiliser quand **vous attestez vous-même** le service fait : indiquez la **date**, puis un **commentaire** ou une **pièce justificative** (l'un des deux suffit). Le service fait est enregistré immédiatement dans SEDIT, avec un procès-verbal scellé.

### Plusieurs factures d'un coup

Cochez des factures **d'un même fournisseur** : une barre propose **Lancer par lot** ou **Faire par lot**. Les mêmes paramètres s'appliquent à chaque facture, traitées une par une ; un récapitulatif liste les réussites et les refus.

## Suivi, rappels, annulation

- Une facture dont le circuit est en cours porte la pastille **⏳ En circuit** avec le nom du vérificateur.
- Le **demandeur est prévenu par mail** de chaque décision.
- Un vérificateur qui ne répond pas reçoit un **rappel automatique** (jours ouvrés, 9 h) après 3 jours, puis tous les 3 jours, **3 rappels maximum**.
- Tant que personne n'a décidé, le demandeur (ou tout agent ayant le droit de modification) peut **annuler le circuit** (icône ⊘) avec un motif facultatif, puis relancer ou faire le service fait lui-même.

## États d'un circuit

| État | Signification |
|---|---|
| En attente | Demande envoyée, le vérificateur n'a pas encore répondu |
| Transféré | Le vérificateur a confié la demande à un autre agent |
| En pause | Mise en attente avec un motif |
| En attente de visa | Le vérificateur a validé ; le directeur doit viser |
| Validé | Service fait enregistré dans SEDIT |
| Non validé | Refusé par le vérificateur : la facture reste à traiter |
| Ne me concerne pas | Retourné : relancez avec le bon vérificateur |
| Annulé | Circuit annulé par le demandeur |

## Cas particuliers et questions fréquentes

- **Pas de boutons Lancer / Faire** : vous n'avez pas le droit de **modification** SEDIT sur le service de la facture, ou le service fait est déjà validé, ou la facture est rejetée / mandatée, ou un circuit est déjà en cours.
- **« Un workflow est déjà en cours »** : un circuit existe pour cette facture ; annulez-le d'abord si besoin.
- **Le vérificateur ne peut pas ouvrir la demande** : « destinée à un autre agent » (ce n'est pas lui le vérificateur désigné) ou « déjà validée / refusée / annulée ». Un lien dont l'échéance est passée est renouvelé automatiquement pour le vérificateur identifié.
- **Facture d'un contrat télécom** : elle suit son parcours dans le module Télécom.
- **Les mails** partent avec le gabarit de la Ville quand le circuit est lancé depuis MagApp, et avec celui de la DSI quand il est lancé depuis le DSI Hub.
- **Une aide plus détaillée** de l'écran des factures est disponible depuis le bouton d'aide de **Mes factures** (MagApp) et de la page **Factures** (DSI Hub).
