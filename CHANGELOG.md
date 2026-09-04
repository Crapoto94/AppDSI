# Changelog

Toutes les évolutions notables du projet AppDSI sont documentées ici.

## [1.0.1] - 2026-09-04

### Corrections
- **Tickets** : le bouton « Reprendre » d'un ticket « En attente » ne remettait pas le ticket en statut « En cours ». Il appelait uniquement l'endpoint d'affectation (`/assign`), qui ne change le statut automatiquement que depuis « Nouveau » ou « Attribué ». Le changement de statut est maintenant déclenché directement dans ce cas. ([frontend/src/pages/Tickets/TicketDetail.tsx](frontend/src/pages/Tickets/TicketDetail.tsx))
- **Tickets** : en mode édition d'un ticket, le nom du demandeur apparaissait deux fois — une seconde fois avec son email juste en dessous du champ, comme s'il fallait le resélectionner. Le champ étant pré-rempli avec le demandeur actuel, la recherche automatique se déclenchait dès l'ouverture du mode édition et réaffichait le même résultat. Cette recherche initiale est désormais ignorée tant que l'utilisateur n'a pas modifié le champ.

## [0.3.0] - antérieur
Historique non documenté dans ce fichier (voir `git log`).
