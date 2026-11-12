# Agent de signature DSI Hub (clé RGS**)

Permet de signer les documents du **Parapheur** avec une clé matérielle (carte à puce ou clé USB, par exemple
Certinomis + SafeNet) branchée sur le poste du signataire. La clé privée ne quitte jamais la clé : le serveur ne
reçoit que la signature.

## Installation (une fois par poste)

1. Installer le middleware de la clé (ex. **SafeNet Authentication Client**). Le certificat doit apparaître dans
   `certmgr.msc` → *Personnel* → *Certificats* quand la clé est branchée.
2. Lancer **`DSIHubSignatureAgent-Setup.exe`** (aucun droit administrateur ; environ 1 Mo).

L'agent s'installe dans `%LOCALAPPDATA%\Programs\DSIHubSignatureAgent`, démarre **automatiquement à chaque
ouverture de session, sans fenêtre**, et apparaît dans *Paramètres → Applications → Applications installées*
(désinstallation depuis cet écran).

Une **icône** (clé violette) apparaît dans la zone de notification de la barre des tâches (cliquer sur `^` si elle est masquée).
Clic droit → **Paramètres** : état de l'agent, démarrage automatique, adresses du Hub autorisées (modifiables, appliquées
immédiatement), certificats détectés, accès au journal. Clic droit → **Quitter l'agent** pour l'arrêter.

Ensuite, il suffit de brancher la clé et d'ouvrir le lien de signature du parapheur : la page détecte l'agent et propose
« Signer avec ma clé RGS** ». Une fenêtre Windows demande de **confirmer**, puis le pilote de la clé demande le **code PIN**.

Pour vérifier la clé : `/admin/parapheur-certificats` → onglet **Tester ma clé RGS****.

## Configuration (facultative)

Les adresses autorisées se modifient dans **Paramètres** (clic droit sur l'icône). Sinon, placer un fichier `agent.config.json` (voir `agent.config.example.json`) à côté de l'exécutable pour changer le port ou la
liste des adresses du Hub autorisées (`origins`), puis redémarrer la session. Par défaut : `dsihub.ivry.local`,
`parapheur.ivry94.fr` et `localhost:5173`. Variables d'environnement équivalentes : `AGENT_PORT`, `AGENT_ORIGINS`.

## Sécurité

- L'agent n'écoute que sur `127.0.0.1` (jamais sur le réseau).
- Il n'accepte que les requêtes venant des adresses du Hub listées dans `origins` (en-tête `Origin` du navigateur).
- Chaque signature demande une **confirmation explicite** à l'écran (document, certificat, origine), puis le code PIN.
- Il ne signe que des empreintes SHA-256 de 32 octets, jamais un document. Rien n'est écrit sur le disque, hormis un journal.
- Les certificats ne sont lus que dans le magasin Windows de l'utilisateur courant (RSA, valides, avec clé privée).

## Dépannage

Journal : `%LOCALAPPDATA%\DSIHubSignatureAgent\agent.log`.

| Symptôme | Piste |
|---|---|
| La page ne détecte pas l'agent | Se déconnecter / reconnecter à Windows (ou relancer le programme depuis son dossier d'installation) ; tester `http://127.0.0.1:47821/status` |
| « Origine non autorisée » | Ajouter l'adresse exacte du Hub dans `agent.config.json` → `origins`, puis relancer l'agent |
| Aucun certificat proposé | Clé non branchée ou middleware absent ; vérifier `certmgr.msc` → *Personnel* ; fermer puis rouvrir le navigateur |
| La fenêtre de confirmation n'apparaît pas | Elle peut être derrière le navigateur : regarder la barre des tâches |
| Signature lente | Le test de clé affiche la durée de chaque étape (agent, clé, serveur) |
| Clé bloquée | Trop de codes PIN erronés : se rapprocher de l'autorité de certification (Certinomis) |

## Construire l'installateur (développeurs)

L'agent est un programme natif .NET Framework (`Agent.cs`, ~40 Ko), compilé avec le `csc.exe` livré avec Windows : aucun SDK,
Node.js ni npm. Le setup utilise Inno Setup 6.

```
powershell -ExecutionPolicy Bypass -File build.ps1            # dist\DSIHubSignatureAgent.exe + dist\DSIHubSignatureAgent-Setup.exe
powershell -ExecutionPolicy Bypass -File build.ps1 -SansSetup # agent seul
```

L'exécutable n'est pas signé numériquement : Windows SmartScreen ou l'antivirus peuvent le signaler au premier lancement.
Pour un déploiement officiel, le signer avec le certificat de code de la ville, puis le diffuser (GPO, Intune, SCCM).
Installation silencieuse : `DSIHubSignatureAgent-Setup.exe /VERYSILENT /TASKS=autostart`.

## Mode test (développeurs uniquement)

`AGENT_TEST=1` autorise les requêtes sans `Origin` (curl) et **supprime la fenêtre de confirmation** : ne jamais l'utiliser
avec une vraie clé en dehors de tests.
