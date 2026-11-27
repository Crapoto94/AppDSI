# Virement de crédits (MagApp)

Cette fonction permet de préparer une **demande de modification budgétaire** (virement de crédits), de la faire **signer** par votre responsable de service puis votre directeur, et de la **transmettre à la direction des finances** (dans l'application ou par mail). Elle est en **BETA**.

## Qui peut l'utiliser ?

La tuile **Virement de crédits** apparaît dans **Mes outils** uniquement si :

- vous avez un **compte actif dans SEDIT Finances** (rapproché par votre adresse e-mail) ;
- ce compte a un **droit de modification** sur au moins un service gestionnaire ;
- la fonction est publiée, ou vous faites partie des agents BETA.

Vous modifiez, supprimez et transmettez **uniquement vos propres demandes**, quel que soit votre rôle dans l'application. Vous pouvez **consulter** celles de votre service et de votre direction.

Les agents de la **direction des finances** désignés pour l'espace de traitement voient la tuile même sans droit de modification SEDIT (ainsi que les administrateurs, pour désigner le premier accès).

> **Vous ne voyez pas la tuile ?** Vérifiez d'abord que vous avez bien un compte SEDIT Finances. Un compte SEDIT en simple consultation (sans droit de modification) ne suffit pas : demandez les droits à la direction des finances.

## Le processus en 3 étapes

### 1. Créer la demande

1. Ouvrez **Mes outils → Virement de crédits**, onglet **Nouvelle demande**.
2. Choisissez le **code collectivité** (**Ville** ou **CCAS**), puis le **budget** (budget principal ou budgets annexes, selon vos droits SEDIT ; un budget clos, comme le SSID depuis le 31/12/2025, n'est plus proposé), puis la **section** (Investissement / Fonctionnement) et le **sens** (Dépenses / Recettes). Changer l'un de ces choix vide les lignes déjà sélectionnées.
3. **Direction, service et personne contact** sont remplis automatiquement à partir de vos informations RH (non modifiables). Renseignez la **date**, l'**activité / projet / opération** impacté et la **motivation**. La **motivation est obligatoire** : sans elle, la demande ne peut être ni enregistrée, ni signée, ni transmise.
4. Réduisez au besoin la liste avec les **filtres** **Chapitre**, **Nature**, **Fonction** et **Code service** (utile pour régulariser des codes fonction au sein d'une même nature, ou virer des crédits au sein d'un même service). Les imputations déjà choisies restent sélectionnées quand vous changez de filtre.
5. Choisissez les imputations :
   - **à minorer (−)** : lignes dont on retire des crédits (elles doivent avoir plus de 50 € de disponible) ;
   - **à majorer (+)** : lignes qui reçoivent des crédits.
   La minoration est **plafonnée au disponible** de la ligne. Tapez plusieurs mots pour filtrer (ex. `21838 BF6` = nature 21838 **et** service BF6). Saisissez le montant, ou cliquez sur **Tout** (minorer : tout le disponible ; majorer : le montant libéré par les minorations).
6. Surveillez le bandeau du bas : totaux, **écart** et alertes.
7. Cliquez sur **Prévisualiser** : la demande est enregistrée en **brouillon** et le PDF s'affiche.

Les lignes proposées sont **uniquement celles que vous avez le droit de modifier dans SEDIT**, pour le **budget choisi** (exercice en cours). Changer de budget vide les lignes déjà sélectionnées ; le budget figure sur le PDF. Les disponibles sont lus en direct dans SEDIT.

### 2. Faire signer

Dans la fenêtre de la demande, bloc **1. Signatures (parapheur)** :

- les signatures sont **successives** : le **responsable de service** signe d'abord, puis le **directeur** ;
- par défaut, ce sont ceux de **votre propre chaîne hiérarchique** (issus de la liste des encadrants de l'administration Ville) ;
- les listes sont classées **par nom** (« NOM Prénom ») : tapez les premières lettres du nom pour y aller directement ;
- vous pouvez **changer** de signataire : la liste ne contient alors que les responsables des **services** et les directeurs des **directions** pour lesquels vous avez un droit SEDIT (plus les vôtres) ;
- laissez « **— Aucun —** » pour ne solliciter qu'une seule personne ; il en faut au moins une ;
- ajoutez au besoin un **message** aux signataires, puis **Envoyer pour signature**.

Les signataires reçoivent un mail avec le lien de signature (sur le domaine du parapheur, pas sur MagApp).

Sur le document, chaque signataire a sa ligne : la **signature** dans la case « Nom et Signature », la **date** dans la case « Date » et son **avis** (mention facultative) sous l'intitulé de la même ligne. Il n'y a rien à déplacer.

### 3. Transmettre à la direction des finances

La transmission n'est possible **qu'une fois toutes les signatures faites**. Bloc **2. Transmission à la direction des finances**, au choix :

- **Transmettre dans l'application** : la demande arrive dans l'espace de traitement des finances, sans mail. Ce bouton apparaît quand au moins un agent des finances est désigné ;
- **Envoyer le mail** : relisez le message, le **PDF signé** est joint. Le destinataire est paramétré par la direction des finances.

Dans les deux cas, la direction des finances peut ensuite indiquer l'état de la demande dans l'application.

### Et après vos deux signatures ?

Le PDF comporte six cadres « Avis ». Les deux premiers (**responsable de service** et **direction**) sont signés par le circuit ci-dessus. Les autres (**direction des services financiers**, **direction générale**, **élu de secteur**, **élue aux finances**) sont complétés ensuite par le service budget, une fois la demande reçue.

## Suivre les demandes (onglet « Suivi des demandes »)

Trois vues : **Mes demandes**, **Mon service** et **Ma direction** (d'après votre rattachement RH). Les demandes des collègues sont en **consultation seule** (détail et PDF).

| État | Signification | Actions possibles (sur vos demandes) |
|---|---|---|
| Brouillon | Enregistrée, pas encore envoyée en signature | Ouvrir, modifier (re-prévisualiser), **supprimer** |
| En signature | Au parapheur, signatures en cours | Consulter |
| Signée, à transmettre | Toutes les signatures sont faites | Transmettre dans l'application ou par mail |
| Signature refusée | Un signataire a refusé | Consulter ; **dupliquer** pour corriger |
| Parapheur annulé | Le circuit a été annulé | **Dupliquer** la demande |
| Transmise aux finances | Reçue par la direction des finances | Consulter, **renvoyer** par mail |
| En cours (finances) | Prise en charge, pas encore faite (ex. nécessite une décision modificative) | Consulter |
| Faite | Traitée par la direction des finances | Consulter |
| Refusée par les finances | Refusée, avec la raison | Consulter ; **dupliquer** pour corriger |

Vous êtes **prévenu par mail** quand la demande est signée, refusée ou annulée au parapheur, puis à **chaque changement d'état** donné par la direction des finances ; le lien du mail ouvre la demande dans MagApp. Le bouton **Dupliquer** (icône de copie) reprend une de vos demandes dans un nouveau brouillon, sur le même budget.

## Direction des finances : l'espace de traitement

Onglet **Traitement (finances)**, réservé aux agents désignés.

- Listes **À traiter**, **En cours**, **Faites / refusées**, **Toutes** : toutes les demandes transmises, dans l'application ou par mail.
- **Traiter** ouvre la demande et son PDF signé. Choisissez **Fait**, **En cours** ou **Refusé** (**raison obligatoire**), puis **Enregistrer et prévenir le demandeur** : un mail part à chaque enregistrement. L'état peut être changé ensuite (par exemple « En cours » puis « Fait »).
- **Accès** : un administrateur de l'application désigne le **premier agent** (même onglet, bloc « Agents ayant accès ») ; ensuite toute personne de la liste peut en ajouter ou en retirer. L'agent doit s'être déjà connecté au moins une fois pour être trouvé. Un administrateur non désigné gère les accès mais ne voit pas les demandes.

Une demande transmise dans l'application n'envoie **pas** de mail au service budget : consultez la liste « À traiter ».

## Cas particuliers

- **Demande compensée** (cochée par défaut) : le total majoré doit être égal au total minoré, sinon le bouton Prévisualiser est bloqué. Décochez pour une demande non compensée.
- **Minoration supérieure au disponible** : le montant est automatiquement ramené au disponible de la ligne.
- **Virement entre chapitres** : une alerte s'affiche quand les lignes touchées relèvent de chapitres différents ; ce type de virement peut suivre un circuit de validation différent.
- **Aucune ligne proposée** (un encadré orange l'indique) : vous n'avez pas de droit de modification pour cette section / ce sens sur ce budget. Pour les services de la DSI, seules les enveloppes ENV16, ENV28 et ENV29 sont proposées en investissement.
- **« SEDIT indisponible »** : la lecture en direct a échoué ; réessayez plus tard.
- **Pas de responsable proposé par défaut** : le service d'accueil d'une direction n'a pas de responsable propre (le directeur la dirige), ou le poste n'est pas pourvu. Choisissez un autre signataire ou laissez « Aucun ».
- **Signataire absent de la liste** : il n'a pas d'adresse e-mail connue, ou son service / sa direction n'est pas dans votre périmètre SEDIT. Faites ajuster vos droits ou son e-mail (administration Ville → encadrants).
- **Message « Signataire non autorisé »** : le signataire choisi sort de votre périmètre ; choisissez-en un dans la liste.
- **Modifier après l'envoi en signature** : impossible. Une demande déjà transmise ne se modifie ni ne se supprime ; créez-en une nouvelle.
- **Reprendre un brouillon** : tant que la fenêtre de création reste ouverte, « Prévisualiser » met à jour le même brouillon. Sinon, ouvrez-le depuis **Suivi des demandes**.

## Important

Cette fonction produit une **demande** : elle ne modifie **pas** le budget dans SEDIT. La saisie du virement reste faite par le service budget une fois la demande reçue.
