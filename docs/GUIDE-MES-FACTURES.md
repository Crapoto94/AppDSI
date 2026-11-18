# Mes factures (MagApp)

**Mes factures** vous montre les factures de la Ville que **vous avez le droit de voir dans SEDIT**, avec leur **service fait**, leur **mandatement** et leur **DGP** (délai global de paiement). Vous pouvez aussi **lancer ou faire le service fait**, et **partager votre vue** avec un collègue. La fonction est en **BETA**.

## Qui voit quoi ?

- Les factures affichées sont celles des **services (et budgets) pour lesquels votre compte SEDIT a un accès** en consultation ou en modification. Vous retrouvez donc exactement ce que vous voyez dans SEDIT.
- Si un collègue vous a **partagé ses factures**, vous voyez aussi les siennes (colonne « Accès » et filtre de périmètre). Cet accès suit **ses droits SEDIT en direct** : s'ils changent, les vôtres changent.
- La tuile n'apparaît que si vous avez un compte SEDIT actif ou un accès partagé.

## Lire l'écran

**Le résumé (en haut)**

| Indicateur | Ce qu'il dit |
|---|---|
| **Factures** | Nombre de factures de l'exercice dans votre périmètre |
| **DGP moyen (payées)** | Délai moyen réception → paiement, avec la **tendance** : flèche et écart en jours entre les 30 derniers jours et les 30 jours précédents, et mini-courbe hebdomadaire. ↘ vert = le délai baisse (bien), ↗ rouge = il augmente |
| **Payées dans les 30 j** | Part des factures payées dans le délai légal de 30 jours |
| **En cours de paiement** | Factures pas encore payées (DGP provisoire), dont celles déjà au-delà de 30 jours |
| **Service fait à traiter** | Factures non rejetées dont le service fait n'est pas encore validé |

**Le tableau** : n° SEDIT, n° fournisseur, libellé, date de réception, tiers, montant TTC, service, DGP, service fait, actions. Recherchez par numéro, fournisseur, libellé ou tiers ; filtrez par exercice, par état du service fait et, si vous avez plusieurs accès, par périmètre.

**Le DGP d'une facture**

- **Payée** : DGP **définitif** = jours entre la réception et le paiement.
- **Pas encore payée** (même mandatée) : DGP **provisoire**, marqué d'une astérisque `*` = jours écoulés depuis la réception.
- **Rejetée** (✕) : le délai s'arrête à la **date de rejet** (réception → rejet).
- Couleurs : vert jusqu'à 20 j, orange jusqu'à 30 j, **rouge au-delà de 30 j**.

**Le mandatement** : passez la souris sur la pastille **Mandatée** pour voir le type de mandat, l'objet, le n° de pièce et de bordereau, les dates d'émission, de transmission et de paiement, et le montant.

## Le service fait

Deux façons de traiter une facture, sur les factures de vos services **où vous avez un droit de modification SEDIT** (un accès partagé ne donne jamais ce droit). Les boutons n'apparaissent pas si le service fait est déjà validé, si la facture est rejetée ou mandatée, ou si un circuit est déjà en cours.

### 1. « Lancer SF » : validation par un vérificateur

À utiliser quand **quelqu'un d'autre** doit attester que la prestation a bien été réalisée.

1. Cliquez sur **Lancer SF**, puis **cherchez le vérificateur** : seuls les agents de **votre direction** sont proposés.
2. Validez : le vérificateur reçoit un **e-mail avec un lien** (valable 30 jours, ouvert sur le domaine MagApp). Les pièces jointes de la facture dans SEDIT lui sont mises à disposition.
3. Sur la page du lien, le vérificateur choisit une décision :
   - **Valider** ;
   - **Valider avec réserves** (commentaire obligatoire) ;
   - **Ne pas valider** (motif obligatoire) ;
   - **Ne me concerne pas** : retourne la demande ;
   - **Transférer** à un autre agent ;
   - **Mettre en pause** (motif obligatoire).
   Quand il valide, c'est **lui qui saisit la date de service fait**.
4. À la validation, le **service fait est enregistré dans SEDIT** et la facture passe à l'étape suivante du circuit (préliquidation par les finances). Un procès-verbal scellé est joint à la facture dans SEDIT.

Pendant ce temps, la facture porte l'icône **⏳ « En circuit »** avec le nom du vérificateur ; survolez-la pour voir depuis quand.

### 2. « Faire SF » : déclaration directe

À utiliser quand **vous attestez vous-même** le service fait.

1. Cliquez sur **Faire SF**, indiquez la **date de service fait**.
2. Ajoutez un **commentaire** ou **joignez une pièce justificative** (l'un des deux suffit).
3. Validez : le service fait est enregistré dans SEDIT immédiatement, avec un procès-verbal scellé contenant votre déclaration et vos pièces.

### Annuler un circuit

Tant que le vérificateur n'a pas décidé, le bouton **Annuler le circuit** (à côté de l'icône ⏳) est proposé au **demandeur** et à tout agent ayant le droit de modification sur le service de la facture. Indiquez un motif (facultatif) : le lien devient inutilisable et, si l'annulation est faite par un autre que le demandeur, celui-ci est prévenu par mail. Vous pouvez ensuite **relancer** un nouveau circuit ou faire le service fait vous-même.

### Cas particuliers

- **« Un workflow est déjà en cours »** : un circuit existe déjà pour cette facture ; annulez-le d'abord si besoin.
- **Vérificateur introuvable** : la recherche est limitée à votre direction ; il doit avoir une adresse e-mail de la Ville.
- **Le vérificateur indique « Lien invalide ou expiré »** : le lien a plus de 30 jours ou le circuit a été annulé / déjà clôturé. Annulez et relancez un circuit.
- **Facture d'un contrat télécom** : elle suit son propre parcours dans le module Télécom ; le service fait ne peut pas être lancé ici.
- **Pas de boutons SF** : vous n'avez pas le droit de **modification** sur le service de cette facture (consultation seule, ou accès partagé).

## Partager mes factures

Le bouton **Partager mes factures** donne à un autre agent **exactement votre vue** :

- l'agent choisi voit les mêmes factures que vous, **en direct** : si vos droits SEDIT évoluent, les siens aussi ;
- il est en **consultation seule** (pas de service fait) et ne peut pas repartager ;
- vous retirez l'accès quand vous voulez, et il peut aussi le décliner ;
- seul un agent ayant ses propres droits SEDIT peut partager.

Si un accès partagé ne donne plus de factures (droits du donneur modifiés ou compte désactivé), un bandeau vous le signale.
