# Guide — Module Transcript Manager (`/transcriptmanager`)

> Documentation fonctionnelle à l'usage des **agents et de l'équipe DSI**.
> Elle décrit comment le module capture, résume, distribue et archive les comptes rendus des réunions Teams.

---

## Sommaire

1. [Accès au module](#1-accès-au-module)
2. [Récupérer un transcript](#2-récupérer-un-transcript)
3. [Qui voit quoi](#3-qui-voit-quoi)
4. [Consulter et rechercher](#4-consulter-et-rechercher)
5. [Résumé automatique par IA](#5-résumé-automatique-par-ia)
6. [Tâches détectées](#6-tâches-détectées)
7. [Diffusion par mail](#7-diffusion-par-mail)
8. [Amender le compte rendu](#8-amender-le-compte-rendu)
9. [Historique des versions](#9-historique-des-versions)
10. [Fonctions annexes](#10-fonctions-annexes)

---

## 1. Accès au module

Le Transcript Manager se rejoint par trois portes différentes :

| Point d'entrée | Portée |
|---|---|
| **DSI Hub** (`/transcriptmanager`) | Comptes DSI (utilisateur, admin, superadmin) : toutes leurs réunions, recherche globale, réglages. |
| **Magasin d'applications** (tuile « Mon Transcript Manager ») | Accès à périmètre restreint : l'agent ne voit et ne gère que **ses propres** réunions, sans accès au reste du Hub. |
| **Lien de partage** | Généré par un admin, consultation seule d'une réunion précise, aucune action d'écriture possible. |

---

## 2. Récupérer un transcript

Deux façons d'amener le contenu d'une réunion dans le module.

### 2.1 Import automatique depuis Teams

Le module interroge Microsoft Teams pour retrouver les réunions de l'utilisateur et récupérer la transcription officielle générée par Teams.

- **Condition indispensable** : la transcription doit avoir été activée et enregistrée **pendant** la réunion Teams. Sans cet enregistrement préalable, Teams ne produit aucun fichier — impossible de le récupérer après coup.
- L'écran d'import classe les réunions trouvées en trois lots : récupérables, hors périmètre (autre tenant), sans transcript disponible.
- **Qui peut lancer l'import** : n'importe quel agent ayant assisté à la réunion, pas uniquement l'organisateur. Le premier qui importe le rend disponible pour tous les autres participants (§3).
- L'import se déclenche à la demande, d'un clic. Il n'y a **pas de synchronisation automatique** en tâche de fond.

### 2.2 Import manuel d'un fichier `.vtt`

Pour les cas où l'import automatique n'est pas possible (réunion externe, export manuel depuis Teams), il est possible de déposer directement un fichier `.vtt` (ou `.txt`). Le module reconnaît automatiquement les intervenants et les horodatages, avec un suivi de progression pendant le traitement.

---

## 3. Qui voit quoi

**Règle centrale** : un transcript importé profite à tous les participants de la réunion, pas seulement à la personne qui l'a récupéré.

Un agent a accès à une réunion s'il remplit l'une de ces conditions : il en est l'organisateur, il figure dans le texte du transcript comme intervenant, il était invité à une réunion budgétaire liée suivie dans le Hub, la réunion a été partagée à sa direction ou à son service, ou — le cas le plus courant — il figurait dans la liste des invités Teams au moment de l'import.

| Profil | Portée |
|---|---|
| Compte DSI (admin / superadmin) | Voit l'ensemble des réunions, gère les réglages et les liens de partage. |
| Agent — Magasin d'applications | Importe et traite uniquement ses propres réunions ; aucun autre module du Hub n'est visible. |
| Lien de partage (invité externe) | Consultation seule d'une réunion précise ; import, résumé IA, modification et suppression sont bloqués. |

L'amendement du compte rendu, la relance d'un résumé IA ou l'ajout d'une tâche restent réservés à un admin, à un participant de la réunion, ou à toute personne ayant déjà reçu le compte rendu par mail.

---

## 4. Consulter et rechercher

- **Dans une réunion** : un champ de recherche filtre le texte affiché, et un clic sur le nom d'un intervenant isole uniquement ses interventions.
- **Dans tous les transcripts** : un mot-clé peut être recherché sur l'ensemble des réunions auxquelles l'agent a accès ; les résultats remontent groupés par réunion. La recherche porte sur la correspondance exacte du mot (pas de recherche approximative) et reste limitée aux réunions accessibles (§3).

---

## 5. Résumé automatique par IA

Depuis la fiche réunion, un résumé peut être généré à tout moment au niveau **sommaire**, **normal** ou **détaillé**. La génération se fait en tâche de fond avec une barre de progression, pour ne pas bloquer l'interface sur une réunion longue.

La source IA (API Ville interne, ou un fournisseur externe en mode « IA locale AppDSI » — Groq, Gemini, OpenRouter, Anthropic, Ollama) est un réglage admin (**Réglages → IA → Transcript Manager**) ; aucune mention de conformité n'est affichée par défaut avec le compte rendu, puisqu'elle dépendrait de ce réglage. Un admin peut y activer la case **« Restreindre ce module aux modèles locaux (Llama, hors Groq/Nvidia) »** : dès lors, seuls les modèles Llama non hébergés par un fournisseur externe restent utilisables pour générer un résumé — toute tentative avec un modèle ou un fournisseur non conforme est refusée.

---

## 6. Tâches détectées

En même temps que le résumé, le module extrait les engagements pris en réunion (« qui fait quoi, pour quand ») et tente de rapprocher le nom cité d'un agent DSI réel pour préremplir le destinataire.

**Validation obligatoire** : une tâche détectée par l'IA n'est **jamais créée automatiquement** dans le module de gestion de tâches. Un agent doit ouvrir la fenêtre de validation, confirmer ou corriger le destinataire, puis valider : c'est seulement à ce moment qu'une tâche réelle est créée et suivie ailleurs dans le Hub (badge « Tâche créée »).

Les tâches identifiées peuvent aussi être ajoutées, corrigées, cochées « faites » ou supprimées manuellement, indépendamment de leur envoi vers le module de tâches.

---

## 7. Diffusion par mail

Le résumé peut être envoyé aux participants cochés et/ou à des adresses libres, sous forme d'un mail mis en forme incluant le résumé, la liste des tâches, les pièces jointes, et la mention légale (§5). L'objet s'adapte au contexte : « Résumé de la réunion », « Mise à jour du compte rendu », ou « ANNULE ET REMPLACE » si le résumé a été régénéré après un envoi déjà effectué.

Si le service mail interne de la Ville est indisponible, l'envoi bascule automatiquement sur le système de messagerie propre au Hub. Chaque envoi (qui, quand, à qui, succès ou échec) est conservé dans l'historique de la réunion.

---

## 8. Amender le compte rendu

Tant qu'aucun envoi n'a encore eu lieu, le résumé reste un brouillon librement modifiable. Dès qu'il a été envoyé une première fois, toute nouvelle modification passe par le circuit d'amendement, pour garder une trace de qui a changé quoi.

- **Qui est « interne »** : un participant avec une adresse `@ivry94.fr`, ou qui dispose déjà d'un compte dans l'annuaire du DSI Hub.
- **Qui peut amender** : un admin, un participant à la réunion, ou toute personne ayant déjà reçu le compte rendu par mail (via le lien « Amender ce compte rendu » du mail reçu).
- Chaque amendeur se voit attribuer une **couleur stable** pour toute la durée de vie de la réunion. Ses ajouts et suppressions de texte sont fusionnés au texte existant façon « suivi de modifications » — rien n'est jamais écrasé.
- Il est possible d'enregistrer un **brouillon privé** avant de valider et diffuser une correction.
- Une fois l'amendement validé, le compte rendu mis à jour est **renvoyé automatiquement** aux destinataires du dernier envoi (ajout de destinataires possible par tout amendeur ; retrait réservé à un admin).

---

## 9. Historique des versions

La fiche réunion affiche une frise chronologique : la version d'origine (date de génération, demandeur, modèle IA utilisé), puis chaque amendement dans l'ordre, avec le nom et la couleur de son auteur, l'horodatage, et le nombre de destinataires internes/externes de la diffusion associée.

Un bouton permet d'afficher le texte complet fusionné, avec les ajouts et suppressions de chaque auteur surlignés dans sa couleur.

---

## 10. Fonctions annexes

- **Pièces jointes** : documents attachables à une réunion, visibles depuis la fiche réunion et le viewer documentaire central du Hub, joints automatiquement au mail de diffusion.
- **Partage par direction ou service** : une réunion peut être partagée à toute une direction/service plutôt qu'à des personnes nommées une par une.
- **Lien avec les réunions budgétaires** : quand un transcript est rattaché à une réunion budgétaire suivie ailleurs dans le Hub, les invités de cette réunion héritent automatiquement de l'accès.
- **Fiche participants enrichie** : fonction, direction et service de chaque participant interne récupérés automatiquement (référentiel RH), correction manuelle possible avant l'envoi.
- **Lien de partage public** : un admin peut générer un lien de consultation en lecture seule d'une réunion.
- **Suppression d'une réunion** : définitive (contrairement aux tâches, qui disposent d'une suppression réversible).

**Pas encore au catalogue** : tags/catégories pour classer les réunions, notifications applicatives dédiées (au-delà du mail de diffusion), recherche plein texte avancée (correspondance de mot exact aujourd'hui), synchronisation Teams planifiée automatiquement (import toujours à la demande).
