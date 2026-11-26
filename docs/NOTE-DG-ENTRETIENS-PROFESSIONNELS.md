# Note à la Direction générale

## Entretiens professionnels : passer par MagApp, le magasin d'applications de la Ville

**Objet :** proposer que la campagne d'entretiens professionnels (EP) de la Ville soit conduite, signée et archivée dans MagApp.
**Position de la DSI :** le dispositif est **prêt dès maintenant**. Il n'attend qu'une décision de la Direction générale pour être ouvert aux agent·e·s.

---

### 1. La proposition en trois lignes

1. Chaque évaluateur·rice retrouve **ses agent·e·s** dans MagApp, fixe le rendez-vous en quelques clics et conduit l'entretien.
2. Le compte rendu (CREP) est saisi, validé, signé et archivé **au même endroit**, que l'agent·e ait ou non une adresse e-mail.
3. La Direction générale suit l'avancement en temps réel, direction par direction, sans tableur ni relance manuelle.

L'outil **ne change pas la procédure réglementaire** : il l'équipe. Le document produit est le même formulaire de 4 pages, sur papier ou en ligne.

---

### 2. Pourquoi c'est un sujet stratégique

#### 2.1. Une donnée que nous n'avons pas aujourd'hui : « qui valide qui »

Le système RH connaît les services et les grades, mais pas, de façon fiable, la relation entre un·e agent·e et son évaluateur. Elle est reconstituée à la main, chaque année, dans des tableurs.

La campagne dans MagApp crée une **cartographie explicite, tracée et durable** : un·e agent·e = un·e évaluateur·rice. Cette donnée sert ensuite à bien d'autres processus (congés, formation, validations, délégations) sans nouvelle saisie.

#### 2.2. Un pilotage RH à l'échelle de la collectivité

Taux de réalisation par direction, retards, besoins de formation, objectifs de l'année suivante : la Direction générale dispose d'une **vision consolidée en continu**, au lieu d'un bilan reconstitué après coup.

#### 2.3. Sécurité juridique et égalité de traitement

Même formulaire, mêmes étapes, mêmes délais pour tous les agent·e·s. Chaque action (planification, validation, signature, archivage) est **journalisée** : en cas de contrôle ou de contentieux, on sait qui a fait quoi, quand, sur quel agent·e.

#### 2.4. Une solution maîtrisée en interne

L'outil est développé et hébergé par la DSI : **pas de licence, pas de dépendance à un éditeur, évolutions possibles en cours de campagne**. Les défauts signalés sont corrigés rapidement, y compris en production.

---

### 3. Comment cela se passe concrètement

Le dispositif couvre **tous les cas**, y compris les agent·e·s sans informatique.

#### 3.1. La prise de rendez-vous

- Cette étape est **facultative** : l’évaluateur·rice peut toujours fixer la date « à l'ancienne ». L'outil n'est qu'une **aide** (recherche de créneaux et envoi de la convocation par e-mail).
- L’évaluateur·rice clique sur « Planifier ». L'outil lui propose les **créneaux libres communs** (son agenda et celui de l'agent·e).
- Si l'agent·e a une adresse e-mail : il reçoit une **invitation Outlook** et un e-mail contenant le **CREP vierge** et un lien vers MagApp.
- Si l'agent·e n'a pas d'adresse e-mail : aucun envoi ; l’évaluateur·rice doit **de toute façon le convoquer autrement** (vive voix, téléphone, courrier) et lui remet le CREP vierge imprimé.

#### 3.2. L'entretien et le compte rendu

Dès l'ouverture du CREP, l'outil demande à l’évaluateur·rice s'il le tiendra **à la main** ou **dans l'outil**, et adapte le parcours (il peut changer à tout moment). Un **fil d'Ariane** indique où en est l'entretien :

- **À la main** : impression, entretien, signatures de l'agent·e (qui renseigne ses 2 cadres) et de l’évaluateur·rice, puis numérisation et téléversement du document signé ; l'outil lit le document, contrôle la présence des **2 signatures**, l’évaluateur·rice vérifie tout et **clôture** l'entretien.
- **Dans l'outil** : saisie de la grille et des rubriques, validation de la partie évaluateur, impression, signatures, téléversement ; l’évaluateur·rice ne vérifie que les **2 cadres de l'agent·e et les signatures**, puis **clôture**.

Selon un **réglage d'administration** (« Lecture des entretiens numérisés »), l'outil lit le document téléversé et demande une **vérification** à l’évaluateur·rice (réglage activé) ou se contente de lui faire **consulter le document et confirmer les 2 signatures** (réglage désactivé, par défaut) ; dans ce second cas, la lecture est faite en arrière-plan et seuls les administrateur·rice·s en voient le résultat.

Une fois le CREP validé, **tout passe en lecture seule** et l'outil rappelle que **l'original signé doit être transmis à la DRH**. Les documents restent consultables jusqu'à la **clôture de la campagne** (action réservée aux administrateurs) ; ensuite le CREP est consulté dans le **dossier de l'agent·e**. Seuls les administrateurs peuvent **dévalider** un CREP, en cas d'erreur manifeste (motif obligatoire, tracé au journal). Le processus complet est modélisé en BPMN dans le module de modélisation du DSI Hub.

- L'agent·e peut **préparer sa fiche en ligne** ou sur papier (facultatif).
- L’évaluateur·rice **saisit directement** le compte rendu dans l'outil, ou **écrit à la main** sur le formulaire puis le reporte dans l'outil (avec lecture assistée du scan, relue et corrigée par lui).
- Un contrôle de cohérence signale les rubriques oubliées avant validation.

#### 3.3. La signature et l'archivage : deux circuits, un seul document

| Situation de l'agent·e | Signature | Archivage |
|---|---|---|
| E-mail + signature électronique ouverte | L'agent·e relit, ajoute ses observations, valide ; les deux parties signent dans le parapheur | Automatique |
| Pas d'e-mail, ou signature électronique non ouverte | Impression, signature papier | Scan des 4 pages téléversé dans l'outil |

Aucun agent·e n'est écarté du dispositif du fait de sa situation numérique.

#### 3.4. Le papier ne freine plus : lecture du manuscrit par l'IA locale

Un·e évaluateur·rice peut préférer écrire à la main. Il photographie alors les pages du compte rendu papier signé et les dépose dans l'outil :

- **L'IA locale de la Ville** (hébergée sur un serveur dédié de la collectivité : **aucune donnée ne sort du réseau**) lit l'écriture manuscrite, les **cases cochées** de la grille d'appréciation et propose le contenu du compte rendu ;
- l'analyse prend **quelques minutes** et se fait en **tâche de fond** : l’évaluateur·rice est **prévenu par e-mail** quand elle est terminée ;
- **l’évaluateur·rice vérifie chaque ligne** avant de valider : l'IA propose, il décide et en répond (une case de confirmation est obligatoire) ;
- **deux versions sont conservées** : le **scan original** et la **version numérique lue par l'IA**. Cette dernière porte le filigrane **« DOCUMENT NON CONTRACTUEL »** et la mention **« Document original manuscrit signé »** à la place des signatures : on sait immédiatement qu'elle n'est pas l'original ;
- **dans tous les cas, l’évaluateur·rice envoie l'ORIGINAL papier signé à la DRH** et valide son pendant numérique : **seul l'original signé fait foi**.

Si le compte rendu a d'abord été saisi dans l'outil, puis imprimé et signé, l'IA ne lit que **les deux commentaires manuscrits de l'agent·e**.

#### 3.5. Une question, une idée, un bug : l'ampoule

Une **ampoule**, en haut à droite du module, permet à chacun·e de déposer en quelques lignes (avec une **pièce jointe** si besoin) :

- **« J'ai une question »** : un point de la procédure ou de l'outil n'est pas clair ;
- **« Je propose une amélioration »** : une idée pour simplifier ou compléter l'outil ;
- **« Il y a un bug »** : quelque chose ne fonctionne pas comme prévu.

Chaque demande est **visible de tous les utilisateur·rice·s** du module, qui peuvent la **commenter** (et joindre un fichier). Les administrateur·rice·s la traitent dans un **backlog de traitement** : réponse à une question, acceptation, refus **motivé** ou réalisation d'une évolution. Le demandeur est **prévenu par e-mail** à chaque étape. Les remontées du terrain alimentent ainsi directement les évolutions de l'outil, en cours de campagne.

#### 3.6. Le suivi de la réception des originaux par la DRH

Au Pilotage, les administrateur·rice·s déclarent **« reçu par la DRH »** chaque CREP signé dont l'original est parvenu à la DRH (un par un ou par lot). Deux indicateurs apparaissent, pour le Pilotage comme pour chaque évaluateur·rice : **« À transmettre à la DRH »** (entretiens clôturés dont l'original n'est pas encore reçu) et **« Reçus par la DRH »**. Les indicateurs sont **cliquables** et filtrent la liste.

#### 3.7. Des e-mails adaptés et modifiables

Tous les e-mails envoyés par l'application (convocation, compte rendu à valider, relances, décisions, backlog…) sont **adaptés à la situation de chaque agent·e** (par exemple, pas de lien vers « Mon entretien » pour une personne qui n'y a pas accès) et **modifiables par les administrateur·rice·s** dans un éditeur visuel, avec la liste des variables disponibles et un aperçu avant enregistrement.

---

### 4. Les avantages

**Pour la Direction générale**
- Suivi en temps réel de la campagne, par direction, service et secteur.
- Identification immédiate des agent·e·s sans évaluateur·rice ou sans adresse e-mail.
- Base fiable pour préparer la campagne suivante.

**Pour les évaluateur·rice·s**
- Un seul endroit, un guide pas à pas pensé pour les non-informaticiens.
- Créneaux communs proposés automatiquement, invitations envoyées sans effort.
- Plus de relances manuelles : l'outil relance l'agent·e et rappelle à l’évaluateur·rice ses EP en attente.

**Pour les agent·e·s**
- Un cadre identique pour tous, une préparation possible en ligne ou sur papier.
- Un compte rendu qu'ils relisent, complètent et signent, puis retrouvent archivé.

**Pour la DRH**
- Demandes de formation centralisées et exportables, avec la compétence visée.
- **Vue globale des besoins de formation**, par direction et par service, selon les trois types (obligatoires, métiers, parcours), **non nominative** : l'IA locale **regroupe les demandes par thème** (management et encadrement ; Word et Excel en bureautique…) et en tire une synthèse des besoins transversaux pour bâtir le plan de formation.
- Fin des documents perdus et des ressaisies.

**Pour la sécurité et la preuve**
- Traçabilité complète, accès limités aux personnes habilitées, remise à zéro encadrée et réservée aux administrateurs.

---

### 5. Nous sommes prêts tout de suite

- L'outil couvre **l'ensemble du parcours** : désignation des évaluateur·rice·s, planification, préparation, saisie, validation, signature électronique ou papier, archivage, pilotage.
- Il dispose d'un **mode de test (BETA)** : tant que la Direction générale n'a pas décidé, **aucun mail ne part aux agent·e·s hors BETA**. Le passage en production se fait par un simple réglage.
- Le **guide pas à pas** pour évaluateur·rice·s et administrateurs est intégré à l'outil, avec un **tutoriel interactif** (façon jeu) à la première connexion.
- La **lecture des comptes rendus manuscrits par l'IA locale** a été essayée sur des photos de qualité médiocre : les cases cochées de la grille sont reconnues, et le texte manuscrit l'est en grande partie, avec relecture obligatoire par l’évaluateur·rice.
- La reprise des agent·e·s et des évaluateur·rice·s se fait à partir du classeur de référence existant.

**Il suffit d'une décision pour lancer la campagne.**

---

### 6. Données personnelles et confidentialité

L'outil applique le principe de **minimisation** et des accès limités : l'agent·e voit son entretien, l’évaluateur·rice ses agent·e·s, les administrateurs le pilotage. En fin de campagne, **la DPD sera associée** pour définir les durées de conservation et organiser l'anonymisation des données nominatives.

---

### 7. Évolutions possibles (et déjà activables)

Le socle est en place ; les fonctions ci-dessous sont **déjà développées** et s'activent par un simple réglage, par direction ou pour tous :

- **Signature par parapheur électronique** : l'agent·e et l’évaluateur·rice signent le compte rendu en ligne, sans impression ni scan ; l'archivage est automatique.
- **Préparation de l'entretien par l'agent·e, vue par le N+1** : l'agent·e prépare sa fiche en ligne (réalisations, difficultés, souhaits d'évolution et de formation) et son évaluateur·rice la retrouve avant l'entretien.
- **Aide à la rédaction par l'IA** : reformulation des notes de l’évaluateur·rice et **analyse de cohérence** du compte rendu (appréciation générale, grille, objectifs) avant validation, avec une IA hébergée dans la collectivité.
- **Dès l'année prochaine : reprise automatique des objectifs** fixés lors de l'entretien précédent, proposés d'office pour le bilan.

**Prochaine étape :** dès accord, publication du module, ouverture de la campagne et courrier d'annonce aux évaluateur·rice·s.
