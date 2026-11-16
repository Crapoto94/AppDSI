# Serveur MCP AppDSI — ce qu'il reste à faire

Branche de travail : `ccr-24faa3bd-2p1jsz`. Elle n'est **ni fusionnée, ni déployée** : la prod n'a pas encore changé.

Documentation détaillée :
- `chat/mcp/README.md` — serveur MCP (DMZ) ;
- `backend/modules/dataquery/README.md` — API backend en lecture seule.

---

## 0. Authentification de `/mcp` — décidé

**Annuaire AD + clé API**, tel que codé :
- l'identifiant et le mot de passe Windows sont vérifiés contre l'AD ;
- la clé API `dsk_…` du module « Interrogation SQL lecture seule » est exigée en plus.

Le mécanisme est propre au MCP : routes, sessions et secret sont distincts du chat, et les jetons du chat sont refusés.

Évolution possible plus tard : comptes MCP dédiés + TOTP (voir § 10).

---

## 1. Points de sécurité à vérifier dès maintenant (indépendants du MCP)

- [ ] **Secret JWT de la prod** : vérifier que `JWT_SECRET` est défini sur le backend de prod. Sinon, les jetons sont signés avec `votre_cle_secrete_ici` (valeur par défaut de `backend/shared/config.js`, visible dans le code), et n'importe qui peut fabriquer un jeton superadmin.
  - Si la variable n'est pas définie : la définir (`openssl rand -base64 48`) et redémarrer. Tout le monde devra se reconnecter.
- [ ] **Clé API en dur** : `backend/shared/pg_db.js` (insertion dans `hub.infra_apis`, clé `reseau_links`) contient une vraie clé `nhk_…` de l'API des liens réseau. Elle est dans l'historique git.
  - La **régénérer** sur l'API réseau.
  - Mettre la nouvelle clé dans `hub.infra_apis`.
  - Retirer la valeur du code.

---

## 2. Relire et fusionner la branche

- [ ] Relire les changements :
  ```bash
  git fetch origin ccr-24faa3bd-2p1jsz
  git log --oneline main..origin/ccr-24faa3bd-2p1jsz
  git diff main...origin/ccr-24faa3bd-2p1jsz --stat
  ```
- [ ] Fusionner, soit avec une pull request sur GitHub, soit en local :
  ```bash
  git checkout main && git merge origin/ccr-24faa3bd-2p1jsz && git push
  ```

---

## 3. Base de données (une seule fois)

- [ ] Créer le rôle PostgreSQL en lecture seule, en superutilisateur. Choisir un mot de passe fort et le conserver pour l'étape 4.
  ```bash
  psql -h 10.103.130.106 -U postgres -d ivry_admin \
       -v dq_password="'<MOT_DE_PASSE_DQ>'" \
       -f backend/modules/dataquery/sql/create_readonly_role.sql
  ```
- [ ] Vérifier que ton compte a le rôle `superadmin`, ou prévoir de l'ajouter à `DATAQUERY_ALLOWED_USERS` (étape 4) :
  ```sql
  SELECT username, role FROM hub.users WHERE lower(username) = '<ton.identifiant>';
  ```

---

## 4. Backend (LAN)

- [ ] Ajouter ces variables d'environnement au backend (`docker-compose.yml` racine ou `.env`) :
  ```
  DATAQUERY_ENABLED=true
  DATAQUERY_PG_USER=dq_readonly
  DATAQUERY_PG_PASSWORD=<MOT_DE_PASSE_DQ>
  DATAQUERY_SESSION_SECRET=<résultat de : openssl rand -base64 48>
  # facultatif :
  DATAQUERY_ALLOWED_USERS=prenom.nom          # en plus des superadmins
  DATAQUERY_SESSION_TTL_HOURS=8
  ```
- [ ] Redéployer le backend.
- [ ] Vérifier dans les logs de démarrage :
  - `[PG DB] Droits lecture seule appliqués au rôle dq_readonly` ;
  - aucune erreur `[PG DB] dataquery:`.
- [ ] Contrôler que le rôle ne peut pas écrire. La commande doit répondre `ERROR … read-only transaction` ou `permission denied` :
  ```bash
  PGPASSWORD='<MOT_DE_PASSE_DQ>' psql -h 10.103.130.106 -U dq_readonly -d ivry_admin \
       -c "DELETE FROM hub_copieurs.copieurs WHERE false"
  ```

---

## 5. Clé API

- [ ] Dans l'appli, aller dans **`/admin/api-keys`** → **Nouvelle clé** :
  - Module : **Interrogation SQL lecture seule (tous modules, IA)**
  - Permission : **lecture**
  - **Date d'expiration** : obligatoire (une clé sans expiration est refusée), par exemple 3 mois.
- [ ] Copier la clé `dsk_…` : elle ne sera plus jamais affichée. La ranger dans ton gestionnaire de mots de passe.
- Prévoir une clé par personne, plutôt qu'une clé partagée.

---

## 6. Conteneur DMZ (`chat/`)

- [ ] Sur l'hôte Docker de la DMZ, récupérer le code fusionné.
- [ ] Facultatif : ajouter dans `chat/.env` :
  ```
  MCP_TRACE_BODIES=full     # ou "meta" : aucune donnée métier écrite en DMZ
  ```
- [ ] Reconstruire et relancer :
  ```bash
  cd chat && docker compose up -d --build
  docker logs appdsi-chat-dmz | grep MCP
  # attendu : [MCP] https://chat.ivry94.fr/mcp → écoute 127.0.0.1:5176 …
  ```
- [ ] Vérifier que `chat/logs/` est créé : c'est là qu'arrivent les traces.
- Le firewall n'a **rien de nouveau à ouvrir** : le MCP utilise le même flux DMZ → LAN (TCP 3001) que le chat.
- Sur le reverse proxy DMZ en amont, vérifier que :
  - les chemins `/mcp`, `/mcp/oauth/…` et `/.well-known/…` sont bien transmis au conteneur (pas filtrés) ;
  - le délai de réponse est d'au moins 60 s.

---

## 7. Vérifications depuis Internet

- [ ] Métadonnées OAuth (doit renvoyer du JSON avec `"resource":"https://chat.ivry94.fr/mcp"`) :
  ```bash
  curl -s https://chat.ivry94.fr/.well-known/oauth-protected-resource/mcp
  ```
- [ ] Accès sans authentification (doit répondre `401` avec un en-tête `WWW-Authenticate: Bearer resource_metadata=…`) :
  ```bash
  curl -si -X POST https://chat.ivry94.fr/mcp -H 'Content-Type: application/json' -d '{}' | head -5
  ```
- [ ] L'API interne doit rester fermée. Cette commande doit renvoyer la page HTML du chat, **pas** du JSON :
  ```bash
  curl -s https://chat.ivry94.fr/api/dataquery/health | head -c 100
  ```

---

## 8. Connecter Claude

- **claude.ai / Claude Desktop** : Paramètres → Connecteurs → *Ajouter un connecteur personnalisé* → `https://chat.ivry94.fr/mcp`.
- **Claude Code** :
  ```bash
  claude mcp add --transport http appdsi https://chat.ivry94.fr/mcp
  ```

Ensuite :
- [ ] La page **Autoriser l'accès aux données** s'ouvre. Y saisir l'identifiant, le mot de passe et la clé `dsk_…`.
- [ ] Tester dans Claude, par exemple : *« Liste les modules disponibles »*, puis *« Combien de tickets ouverts par technicien ? »*.
- [ ] Vérifier que la session et l'audit sont bien enregistrés :
  ```sql
  SELECT username, client, created_at, expires_at FROM hub.dataquery_sessions ORDER BY created_at DESC LIMIT 5;
  SELECT created_at, username, action, left(sql_text, 80), row_count, error
  FROM hub.dataquery_audit ORDER BY id DESC LIMIT 20;
  ```

### Me donner accès depuis une session Claude Code distante (facultatif)

Une session distante ne peut pas faire la connexion par navigateur. Pour que je puisse interroger la prod :
1. Me prévenir quand l'étape 7 est validée.
2. Je demanderai d'autoriser l'hôte `chat.ivry94.fr` dans mon environnement. Une fenêtre de validation s'affichera de ton côté.
3. Je te présenterai un formulaire sécurisé pour transmettre le jeton d'accès. **Ne jamais coller de clé ou de jeton dans la conversation.** Le jeton expire au bout de 8 h.

---

## 9. Exploitation

- **Traces** : `chat/logs/mcp-trace-AAAA-MM-JJ.jsonl` sur l'hôte DMZ, un fichier par jour.
  - Les secrets y sont masqués, mais les données métier y figurent si `MCP_TRACE_BODIES=full`.
  - Définir une **durée de conservation**, une **sauvegarde** et une **purge**.
  - Faire valider par le DPO (données personnelles d'agents).
- **Croiser une trace avec l'audit** : le champ `trace_id` est commun aux traces DMZ et à `hub.dataquery_audit.trace_id`.
- **Couper l'accès** :

  | Portée | Action |
  |---|---|
  | Une personne | `UPDATE hub.dataquery_sessions SET revoked_at = NOW() WHERE username = '…';` |
  | Une clé | la désactiver dans `/admin/api-keys` |
  | Tout, immédiatement | `ALTER ROLE dq_readonly NOLOGIN;` |
  | Internet seulement | commenter les blocs `/mcp` de `chat/nginx.conf.template`, puis reconstruire |
  | Le module | `DATAQUERY_ENABLED=false`, puis redémarrer le backend |

- **Renouveler les clés** avant leur date d'expiration.

---

## 10. Plus tard

- [ ] **Création de tickets via le MCP** : par des actions dédiées qui appellent le service tickets existant, avec une clé séparée, un mode « simulation » par défaut et un audit. Non commencé.
- [ ] Éventuellement : comptes MCP dédiés + TOTP, à la place de l'AD.
- [ ] Problème existant constaté pendant les tests, sans lien avec le MCP : `setupPgDb()` échoue sur une base vierge (`schema "projets" does not exist`). C'est sans effet sur la prod actuelle, mais ça gênera une réinstallation ou un environnement de test.
