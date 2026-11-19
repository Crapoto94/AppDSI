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

**Filtres rapides** : cliquez sur un indicateur ou sur une pastille sous la barre de recherche pour filtrer la liste : **À traiter (SF)** (service fait non validé), **Hors délai > 30 j** (DGP déjà au-delà de 30 jours, payées ou non), **En circuit** (service fait en cours de validation). Recliquez pour retirer le filtre. Un clic sur l'indicateur **DGP moyen** ouvre la courbe d'évolution hebdomadaire de votre périmètre.

**Comparaison avec la collectivité** : sous le DGP moyen, la ligne « Collectivité : X j » donne le DGP moyen de toute la Ville sur l'exercice et votre écart (vert = vous payez plus vite). Seul cet agrégat est affiché ; aucune facture d'un autre périmètre n'est visible. Il est recalculé chaque nuit.

**Alerte DGP** : si le DGP n'a pas pu être calculé pour tout votre périmètre, un bandeau orange l'indique au lieu d'un simple « — ».

**Le tableau** : n° SEDIT, n° fournisseur, libellé, date de réception, tiers, montant TTC, service, DGP, service fait, actions. Recherchez par numéro, fournisseur, libellé ou tiers ; filtrez par exercice, par **budget** (liste affichée si vous avez accès à plusieurs budgets : principal, annexes…), par état du service fait et, si vous avez plusieurs accès, par périmètre. Le budget choisi s'applique aussi au résumé, aux filtres rapides et à la courbe DGP.

**Le DGP d'une facture**

- **Payée** : DGP **définitif** = jours entre la réception et le paiement.
- **Pas encore payée** (même mandatée) : DGP **provisoire**, marqué d'une astérisque `*` = jours écoulés depuis la réception.
- **Rejetée** (✕) : le délai s'arrête à la **date de rejet** (réception → rejet).
- Couleurs : vert jusqu'à 20 j, orange jusqu'à 30 j, **rouge au-delà de 30 j**.

**Les actions** sont des icônes en fin de ligne (survolez-les pour lire leur libellé) : ↗ **Sedit**, 📎 **Pièces jointes**, ➤ **Lancer SF**, ✔ **Faire SF**, ⊘ **Annuler le circuit**.

**Voir la facture** : le bouton **Sedit** ouvre la fiche de la facture dans SEDIT (nouvel onglet) ; le bouton **Pièces jointes** affiche dans MagApp le PDF de la facture et ses justificatifs (XML du flux, pièces ajoutées) avec un bouton de téléchargement. Seules les factures de votre périmètre sont consultables.

**Le mandatement** : passez la souris sur la pastille **Mandatée** pour voir le type de mandat, l'objet, le n° de pièce et de bordereau, les dates d'émission, de transmission et de paiement, et le montant.

## Le service fait

Deux façons de traiter une facture, sur les factures de vos services **où vous avez un droit de modification SEDIT** (un accès partagé ne donne jamais ce droit). Les boutons n'apparaissent pas si le service fait est déjà validé, si la facture est rejetée ou mandatée, ou si un circuit est déjà en cours.

### 1. « Lancer SF » : validation par un vérificateur

À utiliser quand **quelqu'un d'autre** doit attester que la prestation a bien été réalisée.

1. Cliquez sur l'icône **Lancer SF** (➤), puis **cherchez le vérificateur** : seuls les agents de **votre direction** sont proposés.
2. Validez : le vérificateur reçoit un **e-mail avec un lien vers MagApp** (adresse paramétrée par l'administrateur dans `/admin/magapp`). Le lien **ne contient aucun jeton** : le vérificateur **s'identifie dans MagApp** (si son appareil n'a pas déjà une session MagApp, il se connecte, puis il est redirigé automatiquement vers la validation). Seul le vérificateur désigné peut ouvrir la demande ; un autre agent reçoit un message l'en informant. Les pièces jointes de la facture dans SEDIT lui sont mises à disposition.
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

1. Cliquez sur l'icône **Faire SF** (✔), indiquez la **date de service fait**.
2. Ajoutez un **commentaire** ou **joignez une pièce justificative** (l'un des deux suffit).
3. Validez : le service fait est enregistré dans SEDIT immédiatement, avec un procès-verbal scellé contenant votre déclaration et vos pièces.

### Traiter plusieurs factures d'un coup (lot)

Cochez les cases des factures d'un **même fournisseur** (un lot ne peut pas mélanger plusieurs fournisseurs), puis utilisez la barre en bas de l'écran : **Lancer SF** ou **Faire SF**. Les mêmes paramètres (vérificateur ou commentaire / pièces, date) s'appliquent à chaque facture, **une par une** : un échec n'arrête pas le lot, et un récapitulatif liste les factures traitées et celles refusées. En circuit, le vérificateur reçoit un lien par facture.

### Directeur : informé ou avec visa

Quand le directeur de votre direction est connu, le lancement d'un circuit propose :

- **Aucun** (par défaut) ;
- **Informé** : le directeur reçoit un e-mail avec l'issue de la validation ;
- **Avec visa** : après la validation du vérificateur, le directeur doit lui aussi viser (lien par e-mail) ; le service fait n'est alors enregistré dans SEDIT qu'après son visa et le procès-verbal porte les deux signatures.

### Rappels et notifications

- Le **demandeur est prévenu par mail** de chaque décision du vérificateur (validé, réserves, refus, retour, pause), avec un lien vers MagApp.
- Un vérificateur qui n'a pas répondu reçoit un **rappel automatique** (jours ouvrés, 9 h) après 3 jours sans réponse, puis tous les 3 jours, **3 rappels au maximum**. Annuler le circuit arrête les rappels.

### Annuler un circuit

Tant que le vérificateur n'a pas décidé, l'icône **Annuler le circuit** (⊘, à côté de la pastille ⏳) est proposé au **demandeur** et à tout agent ayant le droit de modification sur le service de la facture. Indiquez un motif (facultatif) : le lien devient inutilisable et, si l'annulation est faite par un autre que le demandeur, celui-ci est prévenu par mail. Vous pouvez ensuite **relancer** un nouveau circuit ou faire le service fait vous-même.

### Cas particuliers

- **« Un workflow est déjà en cours »** : un circuit existe déjà pour cette facture ; annulez-le d'abord si besoin.
- **Vérificateur introuvable** : la recherche est limitée à votre direction ; il doit avoir une adresse e-mail de la Ville.
- **Le vérificateur ne peut pas ouvrir la demande** : « destinée à un autre agent » (il n'est pas le vérificateur désigné : transférez ou relancez avec le bon agent) ou « déjà validée / refusée / annulée » (le circuit est clôturé). Un lien dont l'échéance est passée est renouvelé automatiquement à l'ouverture par le vérificateur identifié.
- **Facture d'un contrat télécom** : elle suit son propre parcours dans le module Télécom ; le service fait ne peut pas être lancé ici.
- **Pas de boutons SF** : vous n'avez pas le droit de **modification** sur le service de cette facture (consultation seule, ou accès partagé).

## Partager mes factures

Le bouton **Partager mes factures** donne à un autre agent **exactement votre vue** :

- l'agent choisi voit les mêmes factures que vous, **en direct** : si vos droits SEDIT évoluent, les siens aussi ;
- il est en **consultation seule** (pas de service fait) et ne peut pas repartager ;
- vous retirez l'accès quand vous voulez, et il peut aussi le décliner ;
- seul un agent ayant ses propres droits SEDIT peut partager.

Si un accès partagé ne donne plus de factures (droits du donneur modifiés ou compte désactivé), un bandeau vous le signale.
