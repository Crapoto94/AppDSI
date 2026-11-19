# Virement de crédits (MagApp)

Cette fonction permet de préparer une **demande de modification budgétaire** (virement de crédits), de la faire **signer** par votre responsable de service puis votre directeur, et de l'**envoyer au service budget**. Elle est en **BETA**.

## Qui peut l'utiliser ?

La tuile **Virement de crédits** apparaît dans **Mes outils** uniquement si :

- vous avez un **compte actif dans SEDIT Finances** (rapproché par votre adresse e-mail) ;
- ce compte a un **droit de modification** sur au moins un service gestionnaire ;
- la fonction est publiée, ou vous faites partie des agents BETA.

Vous ne voyez **que vos propres demandes**, quel que soit votre rôle dans l'application.

> **Vous ne voyez pas la tuile ?** Vérifiez d'abord que vous avez bien un compte SEDIT Finances. Un compte SEDIT en simple consultation (sans droit de modification) ne suffit pas : demandez les droits à la direction des finances.

## Le processus en 3 étapes

### 1. Créer la demande

1. Ouvrez **Mes outils → Virement de crédits**, onglet **Nouvelle demande**.
2. Choisissez le **budget** (liste affichée selon vos droits SEDIT : **Ville** = budget principal, puis les budgets annexes comme CMPP, Cinéma Le Luxy, Restauration municipale…), puis la **section** (Investissement / Fonctionnement) et le **sens** (Dépenses / Recettes). Changer l'un des deux vide les lignes déjà choisies.
3. **Direction, service et personne contact** sont remplis automatiquement à partir de vos informations RH (non modifiables). Renseignez la **date**, l'éventuelle **activité / projet / opération** impacté et la **motivation**.
4. Choisissez les imputations :
   - **à minorer (−)** : lignes dont on retire des crédits (elles doivent avoir plus de 50 € de disponible) ;
   - **à majorer (+)** : lignes qui reçoivent des crédits.
   La minoration est **plafonnée au disponible** de la ligne. Tapez plusieurs mots pour filtrer (ex. `21838 BF6` = nature 21838 **et** service BF6). Saisissez le montant, ou cliquez sur **Tout** (minorer : tout le disponible ; majorer : le montant libéré par les minorations).
5. Surveillez le bandeau du bas : totaux, **écart** et alertes.
6. Cliquez sur **Prévisualiser** : la demande est enregistrée en **brouillon** et le PDF s'affiche.

Les lignes proposées sont **uniquement celles que vous avez le droit de modifier dans SEDIT**, pour le **budget choisi** (exercice en cours). Changer de budget vide les lignes déjà sélectionnées ; le budget figure sur le PDF. Les disponibles sont lus en direct dans SEDIT.

### 2. Faire signer

Dans la fenêtre de la demande, bloc **1. Signatures (parapheur)** :

- les signatures sont **successives** : le **responsable de service** signe d'abord, puis le **directeur** ;
- par défaut, ce sont ceux de **votre propre chaîne hiérarchique** (issus de la liste des encadrants de l'administration Ville) ;
- vous pouvez **changer** de signataire : la liste ne contient alors que les responsables des **services** et les directeurs des **directions** pour lesquels vous avez un droit SEDIT (plus les vôtres) ;
- laissez « **— Aucun —** » pour ne solliciter qu'une seule personne ; il en faut au moins une ;
- ajoutez au besoin un **message** aux signataires, puis **Envoyer pour signature**.

Les signataires reçoivent un mail avec le lien de signature (sur le domaine du parapheur, pas sur MagApp).

### 3. Envoyer au service budget

Bloc **2. Envoi au service budget** : relisez le message, puis **Envoyer le mail**. Le **PDF signé** est joint quand les signatures sont terminées ; sinon le PDF non signé est joint, après confirmation. Le destinataire est paramétré par la direction des finances.

### Et après vos deux signatures ?

Le PDF comporte six cadres « Avis ». Les deux premiers (**responsable de service** et **direction**) sont signés par le circuit ci-dessus. Les autres (**direction des services financiers**, **direction générale**, **élu de secteur**, **élue aux finances**) sont complétés ensuite par le service budget, une fois la demande reçue.

## Les états d'une demande (onglet « Mes demandes »)

| État | Signification | Actions possibles |
|---|---|---|
| Brouillon | Enregistrée, pas encore envoyée en signature | Ouvrir, modifier (re-prévisualiser), **supprimer** |
| En signature | Au parapheur, signatures en cours | Consulter, envoyer au budget (non signé) |
| Signée | Toutes les signatures sont faites | Envoyer au budget (PDF signé) |
| Signature refusée | Un signataire a refusé | Consulter ; **dupliquer** pour corriger |
| Parapheur annulé | Le circuit a été annulé | **Dupliquer** la demande |
| Envoyée au budget | Mail transmis | Consulter, **renvoyer** le mail |

Vous êtes **prévenu par mail** quand la demande est signée, refusée ou annulée ; le lien du mail ouvre directement la demande dans MagApp. Le bouton **Dupliquer** (icône de copie, onglet « Mes demandes ») reprend une demande dans un nouveau brouillon, quel que soit son état.

## Cas particuliers

- **Demande compensée** (cochée par défaut) : le total majoré doit être égal au total minoré, sinon le bouton Prévisualiser est bloqué. Décochez pour une demande non compensée.
- **Minoration supérieure au disponible** : le montant est automatiquement ramené au disponible de la ligne.
- **Virement entre chapitres** : une alerte s'affiche quand les lignes touchées relèvent de chapitres différents ; ce type de virement peut suivre un circuit de validation différent.
- **Aucune ligne proposée** (un encadré orange l'indique) : vous n'avez pas de droit de modification pour cette section / ce sens, ou le budget concerné n'est pas le budget principal. Pour les services de la DSI, seules les enveloppes ENV16, ENV28 et ENV29 sont proposées en investissement.
- **« SEDIT indisponible »** : la lecture en direct a échoué ; réessayez plus tard.
- **Pas de responsable proposé par défaut** : le service d'accueil d'une direction n'a pas de responsable propre (le directeur la dirige), ou le poste n'est pas pourvu. Choisissez un autre signataire ou laissez « Aucun ».
- **Signataire absent de la liste** : il n'a pas d'adresse e-mail connue, ou son service / sa direction n'est pas dans votre périmètre SEDIT. Faites ajuster vos droits ou son e-mail (administration Ville → encadrants).
- **Message « Signataire non autorisé »** : le signataire choisi sort de votre périmètre ; choisissez-en un dans la liste.
- **Modifier après l'envoi en signature** : impossible. Une demande déjà transmise ne se modifie ni ne se supprime ; créez-en une nouvelle.
- **Reprendre un brouillon** : tant que la fenêtre de création reste ouverte, « Prévisualiser » met à jour le même brouillon. Sinon, ouvrez-le depuis **Mes demandes**.

## Important

Cette fonction produit une **demande** : elle ne modifie **pas** le budget dans SEDIT. La saisie du virement reste faite par le service budget une fois la demande reçue.
