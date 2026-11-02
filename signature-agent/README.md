# Agent de signature DSI Hub (clé RGS**)

Permet de signer les documents du **Parapheur** avec une clé matérielle RGS** (carte à puce ou clé USB,
par exemple Certinomis + SafeNet) branchée sur le poste du signataire. La clé privée ne quitte jamais la clé :
le serveur ne reçoit que la signature.

## Prérequis

- Windows 10 ou 11, avec Windows PowerShell 5.1 (présent par défaut).
- [Node.js](https://nodejs.org) 16 ou plus récent.
- Le middleware de la clé installé (ex. **SafeNet Authentication Client**) : le certificat doit apparaître dans
  `certmgr.msc` → *Personnel* → *Certificats* quand la clé est branchée.
- Chrome, Edge ou Firefox. Aucune extension à installer.

## Utilisation

1. Brancher la clé.
2. Double-cliquer sur `start-agent.bat` et **laisser la fenêtre ouverte** (réduite).
3. Ouvrir le lien de signature du parapheur : la page détecte l'agent et propose
   « Signer avec ma clé RGS** ».
4. Choisir le certificat, valider : une fenêtre Windows demande de **confirmer** la signature, puis le
   pilote de la clé demande le **code PIN**.

Pour lancer l'agent automatiquement à l'ouverture de session : appuyer sur `Win + R`, saisir `shell:startup`
et y placer un raccourci vers `start-agent.bat` (propriétés du raccourci → *Exécuter* : *Réduit*).

## Configuration

Copier `agent.config.example.json` en `agent.config.json` pour changer le port ou la liste des adresses du Hub
autorisées à utiliser l'agent (`origins`). Variables d'environnement équivalentes : `AGENT_PORT`, `AGENT_ORIGINS`.
Si le Hub est ouvert à une autre adresse que celles de la liste, le navigateur est refusé (erreur « Origine non autorisée »).

## Sécurité

- L'agent n'écoute que sur `127.0.0.1` (jamais sur le réseau).
- Il n'accepte que les requêtes venant des adresses du Hub listées dans `origins` (en-tête `Origin` du navigateur).
- Chaque signature demande une **confirmation explicite** à l'écran (nom du document, certificat, origine), puis le code PIN.
- Il ne signe que des empreintes SHA-256 de 32 octets, jamais un document. Rien n'est écrit sur le disque.
- Les certificats ne sont lus que dans le magasin Windows de l'utilisateur courant (RSA, valides, avec clé privée).

## Dépannage

| Symptôme | Piste |
|---|---|
| La page ne détecte pas l'agent | Vérifier que la fenêtre de l'agent est ouverte ; tester `http://127.0.0.1:47821/status` dans le navigateur |
| « Origine non autorisée » | Ajouter l'adresse exacte du Hub dans `agent.config.json` → `origins`, puis relancer l'agent |
| Aucun certificat proposé | Clé non branchée ou middleware absent ; vérifier `certmgr.msc` → *Personnel* ; fermer puis rouvrir le navigateur |
| La fenêtre de confirmation n'apparaît pas | Elle peut être derrière le navigateur : regarder la barre des tâches |
| Clé bloquée | Trop de codes PIN erronés : se rapprocher de l'autorité de certification (Certinomis) |

## Mode test (développeurs uniquement)

`set AGENT_TEST=1` autorise les requêtes sans `Origin` (curl) et **supprime la fenêtre de confirmation** : ne jamais
l'utiliser avec une vraie clé en dehors de tests.
