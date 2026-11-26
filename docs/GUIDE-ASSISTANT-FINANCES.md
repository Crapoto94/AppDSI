# Assistant finances (MagApp)

Posez une question en français sur les finances de la Ville, au clavier ou à la voix : la réponse est un **tableau lu dans Sedit** au moment de la question. La fonction est en **BETA**, dans « Mes outils DSI ».

## Ce que l'on peut demander

| Données | Exemples |
|---|---|
| **Budget** (voté, disponible, engagé, mandaté…) | « Évolution du budget de fonctionnement de la DSI depuis 2023 », « disponible en investissement par service » |
| **Engagements** | « Engagements en cours de plus de 20 000 € » |
| **Commandes** | « Les dernières commandes UGAP » |
| **Factures** | « Factures sans service fait » |
| **Mandats et titres** | « Les 10 plus gros fournisseurs l'an dernier », « mandats payés à SFR cette année » |

Les marchés, les fiches tiers, les emprunts, les immobilisations et les régies ne sont **pas** interrogeables.

L'assistant répond aussi aux **questions générales** (« c'est quoi un mandat ? », « pourquoi n'as-tu pas trouvé cette commande ? ») : cette réponse de l'IA locale est signalée comme telle et ne contient aucun chiffre lu dans Sedit.

Vous pouvez enchaîner (« et en investissement ? », « sépare fonctionnement et investissement », « par chapitre », « et en 2024 ? »). Ce qui a été dit **reste valable** : service ou direction, années, section, filtres sont repris tant que vous n'en donnez pas d'autres (« tous les services », « toutes les factures » ou « sans filtre » les lèvent). « Nouvelle discussion » repart de zéro.

## Filtres permanents

Les listes déroulantes (année, section, chapitre, nature, fonction, budget, direction, service) s'appliquent à **toutes** les demandes et priment sur la question, jusqu'à **Réinitialiser** ; elles sont conservées sur votre poste. Elles ne proposent que ce qui est dans vos droits ; elles suivent les droits Sedit, pas le service d'affectation. S'ils sont limités (trois directions au plus), un bandeau l'annonce ; une direction ou un service unique est verrouillé. Les factures n'ont ni section, ni chapitre, ni nature, ni fonction : ces filtres sont alors signalés comme non appliqués.

## Directions et services

Nommez-les par leur sigle (**DSI**, **DCOM** ou **DIRCOM**, **DRH**, **DSF**, **DBC**, **DEP**, **DDAC**…) ou en toutes lettres (« la direction de la communication », « le service voirie », « BF6 »). Les sigles de deux ou trois lettres (DS, DJ, DEP…) s'écrivent en majuscules. Pour exclure : « hors DSI », « sauf la communication et la voirie », « hors UGAP ». Les tableaux donnent le nom des services avec leur code, et « par direction » additionne les services de chaque direction. Une **direction** est toujours comptée en entier : ses services sont additionnés (la ligne sous le titre les énumère), le détail n'apparaît que si vous le demandez (« par service »). Un sigle en « D… » inconnu est signalé avec la liste des directions connues. La liste est tenue dans `backend/modules/assistant-finances/referentiel.js`.

## Comparer et éduquer

- « Par rapport à », « compare », « vs » : deux années par mois sont mises face à face avec l'écart ; on peut comparer des directions, des services, des fournisseurs, ou le voté et le mandaté. Par mois, ce sont les **mois calendaires** (date de la pièce).
- **Éduquer l'IA** : une consigne enregistrée est reprise à chaque question (personnelle, ou commune si elle est donnée par un administrateur). Elle ne change ni les droits ni les chiffres.

## Lire une réponse

- Le **titre du tableau** décrit exactement ce qui a été cherché (données, section, années, filtres) : vérifiez-le, car l'IA peut mal comprendre une question.
- La ligne dessous donne le **périmètre** (services et budgets comptés).
- Le montant officiel « engagé » ou « mandaté » est celui de la **situation budgétaire** ; les listes d'engagements et de mandats peuvent s'en écarter un peu.
- **Graphiques** : demandez « en courbe », « en histogramme », « en camembert », ou utilisez les trois icônes en haut d'un tableau. **Image** télécharge le graphique (PNG). Les listes de pièces n'ont pas de graphique.
- Les tableaux s'affichent par pages de 50 lignes.
- **Excel** et **Word** produisent un fichier avec **toutes** les lignes (50 000 au plus), à ouvrir depuis le navigateur. L'icône de copie ne copie que la page affichée.
- **Trombone** : pièces jointes de la facture, de la commande, de l'engagement ou du mandat. **Sedit** ouvre la même fiche dans Sedit (pas de lien pour les titres de recette).

## Qui voit quoi ?

Les mêmes droits que « Mes factures » : les couples budget × service sur lesquels votre compte Sedit a un accès. Un collègue qui vous a **partagé ses factures** vous ouvre ses factures et leurs pièces jointes, rien d'autre. Les pièces jointes d'un engagement ou d'un mandat ne s'ouvrent que si **toutes** ses lignes sont dans votre périmètre.

## Confidentialité

L'IA est hébergée par la Ville. Elle ne fait que traduire votre question : elle ne reçoit aucun montant ni aucune pièce de Sedit, et les chiffres ne viennent jamais d'elle. La dictée utilise le service de transcription de la Ville (micro disponible en connexion HTTPS seulement) ; le son n'est pas conservé.

## Administration

- Activation : `/admin/magapp`, « Assistant finances (IA locale) » (décoché : agents BETA).
- Modèle : le modèle local préféré est choisi automatiquement ; réglage facultatif `assistant_finances.ai_model` (SQLite `app_settings`). Les modèles externes de l'API IA Ville sont toujours écartés.
- Dictée : nécessite le service Faster-Whisper de l'API IA Ville (`/api/v1/ai/transcribe`).
