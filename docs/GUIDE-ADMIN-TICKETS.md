# Guide administrateur — Administration des Tickets (`/admin/tickets`)

> Documentation fonctionnelle à l'usage des **administrateurs** du module Tickets.
> Elle détaille chaque onglet de l'administration : son rôle, quand l'utiliser et comment.
> Accès réservé aux rôles **Admin / Super Admin** (certains écrans sont ouverts aux **Superviseurs**).

L'administration pilote **tout le comportement du module** : la qualification des tickets, leur routage, les délais, les notifications, la clôture et la connaissance. Ce guide suit l'ordre des onglets.

---

## Vue d'ensemble : ce que l'administration contrôle dans le cycle de vie

| Étape du cycle de vie | Onglets concernés |
|---|---|
| **Entrée** d'un ticket (saisie, mail, live, GLPI) | Catégories, Transpositions, Live, Règles |
| **Qualification & routage** (à la création) | Règles, Catégories, Groupes, VIP |
| **Engagement de délai** | SLA |
| **Traitement** (réponses, base de connaissances) | Réponses auto, Base documentaire, Résolution auto |
| **Communication** (qui est prévenu, avec quel message) | Déclencheurs, Templates, Paramètres/AD |
| **Clôture** (manuelle / demandeur / automatique) | Clôture |
| **Mesure & gouvernance** | Satisfaction, Journal, Rôles |

---

## 1. Catégories

**Rôle.** Définir l'arborescence **catégories / sous-catégories** servant à qualifier les tickets.

**Quand.** Au démarrage, puis à chaque évolution de l'offre de services.

**Comment.** Créez, renommez et organisez les catégories ; associez-y éventuellement une **icône**. Elles alimentent les filtres de `/tickets`, le **routage** (règles, SLA) et les **statistiques**. Une arborescence claire est la base d'un support bien piloté.

---

## 2. 🗂️ Transposition (catégories)

**Rôle.** Faire correspondre les catégories **issues de GLPI** (ou d'une autre source) aux catégories internes du hub.

**Quand.** Tant que des tickets proviennent de GLPI.

**Comment.** Pour chaque libellé source, choisissez la catégorie cible. Les tickets synchronisés tombent ainsi dans la bonne rubrique, sans ressaisie ni rubrique « fourre-tout ».

---

## 3. SLA (engagements de délai)

**Rôle.** Définir et suivre les **délais contractuels** : première réponse et résolution.

**Comment.** Trois sous-onglets :
- **Définitions** : créez des SLA (par priorité et/ou catégorie) avec leurs durées.
- **Calendriers** : déclarez les **heures ouvrées** (jours, plages horaires) servant au décompte — « 4 h ouvrées » ne court ni la nuit ni le week-end.
- **Dépassements** : suivez les tickets hors délai.

**À savoir.**
- Le SLA se **met en pause** automatiquement quand un ticket passe **En attente**.
- Un bouton **réinitialise/recalcule** les SLA (purge + recalcul).
- Une **table de conversion jours ouvrés → minutes** facilite le paramétrage.

---

## 4. Règles (d'affectation)

**Rôle.** **Automatiser** la qualification et le routage **à la création** d'un ticket.

**Quand.** Dès que des schémas se répètent (telle catégorie → tel groupe, tel mot-clé → priorité haute…).

**Comment.** Une règle = des **conditions** (catégorie, mots-clés, demandeur, type…) + des **actions** :
- **assignation** à un technicien ou un **groupe** ;
- `set_vip` (marquer VIP), `boost_priority` (élever la priorité) ;
- `set_type` (Incident/Demande), `set_category`, `add_tag`.

Les règles s'appliquent **en cascade** : ordonnez-les du plus spécifique au plus général. Objectif : qu'un ticket arrive **déjà qualifié et routé**, sans tri manuel.

---

## 5. ⭐ VIP

**Rôle.** Gérer les **usagers prioritaires** (élus, direction, fonctions sensibles).

**Comment.** Renseignez les personnes/critères VIP. Leurs tickets sont mis en avant (filtre ⭐ côté technicien) et peuvent être priorisés via les règles. Permet de garantir un traitement renforcé sans dépendre de la vigilance individuelle.

---

## 6. 📜 Journal

**Rôle.** **Traçabilité globale** : l'historique de **tous** les évènements de **tous** les tickets (statuts, assignations, commentaires, escalades, SLA…).

**Comment.** Consultez et faites défiler pour **auditer** une action ou retrouver « qui a fait quoi, quand ». Lecture seule. C'est l'outil de contrôle et de preuve.

---

## 7. Templates (modèles de mail)

**Rôle.** Définir le **contenu des e-mails** envoyés par le module (accusé de réception, changement de statut, ticket clos, résumé de chat live…).

**Comment.** Éditez le HTML des modèles avec des **variables** (`{{ticket_id}}`, `{{ticket_title}}`, `{{new_status}}`, `{{app_url}}`…). Un même évènement peut avoir un modèle distinct **par destinataire**. Soignez ces modèles : c'est l'image du support auprès des usagers.

---

## 8. Déclencheurs (de notification)

**Rôle.** Décider **qui est notifié** et **avec quel modèle** à chaque évènement (création, changement de statut, clôture, réouverture…).

**Comment.** Pour chaque évènement, activez les destinataires : **demandeur**, **technicien**, **groupe**, **observateurs**, **admins**. Couplé aux **Templates**, cela définit toute la mécanique de notification. Évitez les sur-notifications : n'activez que les destinataires réellement utiles.

---

## 9. Équipe

**Rôle.** Gérer les **membres du support** et leur **rôle dans le module** (technicien, superviseur, admin, super admin).

**Comment.** Ajoutez/retirez des membres, fixez leur rôle. C'est ici que se décide qui peut **traiter**, **superviser** ou **administrer**. Le rôle module est **indépendant** du rôle global de l'application : un simple utilisateur de l'app peut être technicien ici.

---

## 10. 👥 Groupes

**Rôle.** Constituer des **équipes** (Proximité, Réseau, Applicatif, prestataire…) pour l'affectation et l'escalade.

**Comment.** Créez les groupes et affectez-y des membres. Les groupes sont les **cibles des escalades** et des règles d'affectation. Pensez votre organisation en niveaux (N1 / N2 / experts).

---

## 11. 🔄 Transposition groupes

**Rôle.** Faire correspondre les **groupes/entités GLPI** aux groupes internes.

**Comment.** Mappez chaque groupe source vers un groupe cible, afin que les tickets synchronisés soient escaladés au bon endroit.

---

## 12. ⬆️ Escalade

**Rôle.** Définir les **règles et niveaux d'escalade** (montée vers un groupe supérieur selon des conditions/délais).

**Comment.** Précisez vers quel groupe et dans quelles conditions un ticket doit être escaladé. Objectif : qu'aucun ticket ne reste **sans prise en charge** ou bloqué trop longtemps.

---

## 13. 🔐 Rôles (permissions)

**Rôle.** Régler les **permissions** attachées à chaque rôle du module.

**Comment.** Ajustez ce que chaque rôle a le droit de faire (créer, transférer, clore, supprimer, administrer). Permet d'adapter finement la **gouvernance** : par exemple réserver la clôture des Problèmes aux superviseurs, ou la suppression aux admins.

---

## 14. ⚙️ Paramètres

**Rôle.** Réglages généraux du module.

**Comment.** On y configure notamment :
- le **Live Chat** : nom et logo du chat ;
- l'**apparence** : couleurs principale/secondaire ;
- l'**Active Directory** : nom de l'annuaire, valeur par défaut de l'identifiant (placeholder de connexion) ;
- des **fonctionnalités** activables (ex. **reformulation IA** des commentaires, **dictée vocale**).

---

## 15. 🔒 Clôture

**Rôle.** Gérer la **clôture automatique** des tickets résolus et tracer toutes les clôtures.

**Comment.**
- **Durée avant clôture auto** (en jours, défaut **7**, `0` = désactivé) : un ticket **Résolu** depuis plus de N jours est **clos automatiquement** chaque nuit (tâche planifiée de minuit).
- Bouton **« Lancer la clôture maintenant »** : exécution immédiate à la demande.
- **Log des clôtures** : tableau de toutes les clôtures, avec leur **source** —
  - **Automatique** (système, après délai),
  - **Demandeur** (l'usager a clos lui-même),
  - **Technicien** (clôture manuelle).

**À savoir.** Bien régler ce délai évite l'accumulation de tickets « Résolus » jamais clôturés, tout en laissant au demandeur le temps de réagir.

---

## 16. 🟢 Live (chat en direct)

**Rôle.** Configurer l'**assistance instantanée** par chat.

**Comment.** Réglez le comportement des sessions : **pré-clôture** (par le demandeur ou sur **inactivité**) puis **finalisation par le technicien**, **classification Incident/Demande** obligatoire avant clôture, **modèle de résumé**, **contacts d'urgence/mobile**, etc. Chaque session alimente un ticket : c'est un véritable **canal d'entrée** à part entière.

---

## 17. 🤖 Résolution auto

**Rôle.** **Résoudre automatiquement** des tickets simples et répétitifs, sans intervention humaine.

**Comment.** Définissez les cas éligibles (catégories, mots-clés) et la réponse apportée. Selon le paramétrage, la résolution peut être **proposée** (à confirmer) ou appliquée. Permet d'absorber le volume des demandes récurrentes et de concentrer les techniciens sur les cas à valeur ajoutée.

---

## 18. ⭐ Satisfaction

**Rôle.** Piloter les **enquêtes de satisfaction** envoyées après résolution/clôture.

**Comment.** Activez/paramétrez l'enquête et consultez les **retours** (notes, commentaires). C'est l'indicateur de **qualité perçue** du service ; à suivre dans le temps.

---

## 19. 💬 Réponses auto

**Rôle.** Gérer une bibliothèque de **réponses types** réutilisables dans les commentaires.

**Comment.** Rédigez des réponses pré-écrites par catégorie/situation. Les techniciens les insèrent en un clic : gain de temps et **uniformité** du discours. À maintenir à jour avec les évolutions des procédures.

---

## 20. 📚 Base documentaire (connaissances)

**Rôle.** Constituer la **base de connaissances** (procédures, articles de résolution).

**Comment.** Rédigez et organisez les articles. Ils alimentent :
- les **suggestions** lors du traitement d'un ticket,
- les **réponses automatiques**,
- les **méthodes de résolution** des Problèmes.

Plus la base est riche, plus la résolution est rapide et homogène. Encouragez les techniciens à transformer les bonnes solutions en articles.

---

## Interactions avec les autres modules

Le module Tickets s'intègre au reste de DSI Hub. Côté administration, plusieurs réglages conditionnent ces liens.

| Module | Interaction | Ce que l'admin pilote |
|---|---|---|
| **Mes Tâches** | Les tâches créées sur un ticket remontent dans Mes Tâches (et inversement). | Rien de spécifique : le lien est natif. |
| **MagApp** | Le **logiciel** d'un ticket est rattaché à une application MagApp ; ses **documents** sont suggérés/joignables ; un ticket peut provenir du portail MagApp. | Veiller à ce que les applications soient **publiées dans MagApp** et leurs **documents à jour**. |
| **Base documentaire** | Articles suggérés au traitement, méthode de résolution des Problèmes. | Onglet **Base documentaire** : rédiger/maintenir les articles. |
| **Réponses auto** | Réponses types insérées dans les commentaires. | Onglet **Réponses auto**. |
| **Parc informatique** | La fiche ticket montre les **équipements du demandeur** (rapprochés par e-mail). | Qualité des données du **Parc** (emails usagers à jour). |
| **Annuaire AD / Sites** | Recherche de demandeur/observateurs/techniciens ; localisation. | Onglet **Paramètres** (réglage AD) ; référentiel **Sites**. |
| **GLPI** | Synchronisation des tickets/catégories/groupes ; images & documents. | Écran `/admin/glpi` + onglets **Transposition** (catégories) et **Transposition groupes**. |
| **Mail Collector** | Création automatique de tickets depuis des e-mails O365. | Configuration du collecteur (boîtes surveillées, classification, routage). |
| **Live / Chat** | Chaque session de chat alimente un ticket. | Onglet **Live**. |
| **Notifications / E-mail** | Envois automatiques aux parties prenantes. | Onglets **Déclencheurs** + **Templates** + réglages **Paramètres/AD**. |
| **Tableau de bord DSI** | Widgets KPIs / tendance / statuts / catégories du module. | Disponibles dans le Tableau de bord DSI. |

---

## Repères transverses

- **Statuts** : 1 Nouveau · 2 En cours (attribué) · 3 En cours (planifié) · 4 En attente *(SLA en pause)* · 5 Résolu · 6 Clos · 8 Rejeté *(suppression logique)*.
- **Priorités** : de Très basse à Très haute ; « Critique » = priorité maximale.
- **Canaux d'entrée** : saisie manuelle, **Mail Collector** (e-mails O365), **Live** (chat), **synchronisation GLPI**.
- **Chaîne de notification** : **Déclencheurs** (qui) + **Templates** (quel message) + **Paramètres/AD** (vers quelle adresse).
- **Synchronisation GLPI** : voir aussi l'écran dédié `/admin/glpi` ; les onglets **Transposition** assurent l'alignement des référentiels.

---

*Pour le traitement quotidien des tickets, voir le **Guide technicien — Module Tickets** (`GUIDE-TECHNICIEN-TICKETS.md`).*
