# Modifications budgétaires sans papier : conception proposée (point F)

Statut : **proposition, rien n'est développé**. À valider avec la direction des finances.

## Principe

Un seul écran « Nouvelle demande », avec un choix **Type de demande** en tête. Le type détermine les blocs de saisie, les contrôles et les cases cochées sur le formulaire existant. La signature, la transmission et l'espace de traitement actuels sont réutilisés tels quels.

| Type | Saisie | Contrôle |
|---|---|---|
| Virement de crédits (actuel) | lignes à minorer et à majorer | totaux égaux |
| Nouvelle demande de crédits | lignes à majorer seulement | montant > 0, motivation |
| Abandon de crédits | lignes à minorer seulement | minoration ≤ disponible |
| Compensée dépense / recette | une liste « dépenses » et une liste « recettes » | même section, variation des dépenses = variation des recettes |
| Virement entre directions | minoration dans mon périmètre, majoration hors périmètre | totaux égaux, accord de la direction bénéficiaire |

Les trois premiers sont peu coûteux : le module sait déjà enregistrer une demande non compensée et le PDF a déjà les cases « crédits nouveaux » et « abandon ». La compensée dépense / recette demande d'autoriser les deux sens dans une même demande (aujourd'hui un seul).

## Virement entre directions ou services

Cas type : la Culture cède des crédits à la Direction de la Communication.

- **Ligne cédée** : toujours dans les droits SEDIT de l'agent (inchangé).
- **Ligne bénéficiaire**, deux possibilités cumulables :
  1. choisir la direction / le service bénéficiaire, puis une ligne existante : liste limitée à l'imputation et au libellé, **sans les montants** des autres directions ;
  2. **saisie libre** (« ligne à créer ») : chapitre, nature, fonction, service, opération, avec listes issues des référentiels SEDIT et mention « à vérifier par les finances ».
- **Accord du bénéficiaire** : signature du directeur bénéficiaire après le directeur cédant. Le PDF n'a qu'une ligne « Avis de la direction » : ajouter une ligne « Avis de la direction bénéficiaire » (modification du formulaire à faire valider).
- Le directeur bénéficiaire peut refuser (circuit du parapheur existant). La demande apparaît dans « Ma direction » des deux côtés.

## Supprimer réellement le papier

Aujourd'hui, quatre avis restent hors application : direction des services financiers, direction générale, élu de secteur, élue aux finances. Proposition :

1. depuis l'espace de traitement, les finances lancent la **suite du circuit de signature** (mêmes cases du PDF), en choisissant les signataires nécessaires ;
2. des **signataires par défaut** sont paramétrés (DSF, DGS/DGA, élus par secteur) ;
3. ajouter l'état **« À compléter »** : renvoi au demandeur avec un commentaire, sans refus définitif ;
4. pièces jointes (devis, courrier) ajoutées à la demande.

## Découpage proposé

| Lot | Contenu | Taille |
|---|---|---|
| 1 | Type de demande : crédits nouveaux, abandon, compensée dépense / recette ; pièces jointes | petite |
| 2 | Virement entre directions et saisie libre, accord de la direction bénéficiaire | moyenne |
| 3 | Circuit de signature complet depuis l'espace de traitement, « À compléter », indicateurs de délais | moyenne |

## À arbitrer avant de développer

1. Qui peut demander des crédits nouveaux : tout agent ayant un droit de modification, ou seulement les responsables ?
2. Virement entre directions : l'accord du directeur bénéficiaire est-il obligatoire ?
3. La saisie libre d'une imputation est-elle autorisée dans tous les types, ou seulement entre directions ?
4. Quels avis (finances, direction générale, élus) sont obligatoires, et selon quels seuils ou types (ex. virement entre chapitres, décision modificative) ?
5. Les élus signent-ils dans le parapheur (compte et adresse à confirmer) ?
6. Les virements entre budgets ou entre Ville et CCAS sont à exclure (budgets distincts) : confirmer.
