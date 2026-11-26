/**
 * Page de connexion MCP autonome (/mcp/login?request=…), servie par le serveur MCP lui-même.
 *
 * Même rôle et mêmes appels que `chat/src/McpAuthorizePage.tsx` (page React du conteneur DMZ), mais sans dépendance au front du chat :
 * permet d'exposer le MCP derrière n'importe quel reverse proxy, notamment en INTERNE (ex. https://chat.ivry.local) à côté du chat
 * interne qui, lui, ne contient pas cette page. Dans le conteneur DMZ, nginx route /mcp/login vers le front React : cette page n'est
 * alors jamais atteinte.
 *
 * Aucun secret n'est stocké : clé API et mot de passe partent en POST vers /mcp/oauth/login (voir server.js) puis sont effacés.
 */
import crypto from 'node:crypto';

const STYLE = `
  :root{color-scheme:light}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;
       background:linear-gradient(135deg,#eef2ff 0%,#e0e7ff 60%,#f0f9ff 100%);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#0f172a}
  .card{background:#fff;border-radius:24px;box-shadow:0 20px 60px rgba(15,23,42,.12);width:100%;max-width:440px;padding:28px 26px;box-sizing:border-box}
  .head{display:flex;align-items:center;gap:12px;margin-bottom:18px}
  .logo{width:48px;height:48px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-weight:900;font-size:18px;flex-shrink:0}
  h1{font-size:18px;font-weight:800;margin:0}
  .sub{font-size:13px;color:#64748b}
  .box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;font-size:14px;color:#334155;line-height:1.5}
  .box ul{margin:8px 0 0;padding-left:18px;color:#475569;font-size:13px}
  label{display:block;font-size:13px;font-weight:700;color:#475569;margin:14px 0 6px}
  input{width:100%;box-sizing:border-box;padding:11px 14px;font-size:15px;border:1.5px solid #e2e8f0;border-radius:10px;outline:none;background:#f8fafc;color:#0f172a}
  input:focus{border-color:#6366f1;background:#fff}
  .hint{font-size:12px;color:#94a3b8;margin-top:6px}
  .msg{border-radius:10px;padding:10px 14px;font-size:14px;margin-top:14px}
  .err{background:#fef2f2;border:1px solid #fecaca;color:#b91c1c}
  .ok{background:#f0fdf4;border:1px solid #bbf7d0;color:#15803d}
  .row{display:flex;gap:10px;margin-top:18px}
  button{flex:1;padding:12px;font-size:15px;font-weight:700;border-radius:10px;border:0;cursor:pointer}
  button.primary{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff}
  button.ghost{background:#f1f5f9;color:#334155;flex:0 0 auto;padding:12px 18px}
  button:disabled{opacity:.55;cursor:default}
  code{font-size:13px}
  [hidden]{display:none!important}
`;

const SCRIPT = `
(function(){
  var $=function(i){return document.getElementById(i)};
  var id=new URLSearchParams(location.search).get('request')||'';
  var info=null;
  function show(el,msg,cls){el.className='msg '+cls;el.textContent=msg;el.hidden=false}
  function post(url,body){return fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||('Erreur '+r.status));return d})})}
  if(!id){show($('top'),'Lien incomplet : relancez la connexion depuis votre client.','err');return}
  fetch('/mcp/oauth/request/'+encodeURIComponent(id)).then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||'Demande introuvable.');return d})}).then(function(d){
    info=d;$('client').textContent=d.client_name;$('host').textContent=d.redirect_host;$('form').hidden=false;$('user').focus();
  }).catch(function(e){show($('top'),e.message,'err')});
  $('form').addEventListener('submit',function(ev){
    ev.preventDefault();var btn=$('go');btn.disabled=true;$('err').hidden=true;
    post('/mcp/oauth/login',{request:id,username:$('user').value.trim(),password:$('pwd').value,api_key:$('key').value.trim()}).then(function(d){
      $('pwd').value='';$('key').value='';$('form').hidden=true;
      show($('top'),'Accès autorisé pour '+((d.user&&d.user.displayName)||$('user').value)+'. Retour vers '+info.client_name+'…','ok');
      location.assign(d.redirect);
    }).catch(function(e){$('pwd').value='';show($('err'),e.message,'err');btn.disabled=false});
  });
  $('deny').addEventListener('click',function(){
    post('/mcp/oauth/deny',{request:id}).then(function(d){location.assign(d.redirect)}).catch(function(e){show($('err'),e.message,'err')});
  });
})();
`;

function html(nonce) {
    return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Autoriser un client MCP</title><style nonce="${nonce}">${STYLE}</style></head>
<body><div class="card">
  <div class="head"><div class="logo">MCP</div><div><h1>Autoriser l'accès aux données</h1><div class="sub">DSI — connecteur MCP</div></div></div>
  <div id="top" class="msg" hidden></div>
  <form id="form" autocomplete="off" hidden>
    <div class="box"><strong id="client"></strong> demande à interroger les données de l'application (retour vers <code id="host"></code>).
      <ul><li>lecture seule, données sensibles masquées ;</li><li>chaque requête est tracée à votre nom ;</li><li>accès valable au plus 8 heures.</li></ul></div>
    <label for="user">Identifiant Windows</label><input id="user" autocomplete="username" placeholder="prenom.nom" required>
    <label for="pwd">Mot de passe Windows</label><input id="pwd" type="password" autocomplete="current-password" required>
    <label for="key">Clé API (dsk_…)</label><input id="key" type="password" autocomplete="off" spellcheck="false" placeholder="dsk_…" required>
    <div class="hint">Clé de périmètre « Interrogation SQL lecture seule », fournie par la DSI.</div>
    <div id="err" class="msg err" hidden></div>
    <div class="row"><button type="button" id="deny" class="ghost">Refuser</button><button type="submit" id="go" class="primary">Autoriser</button></div>
  </form>
</div><script nonce="${nonce}">${SCRIPT}</script></body></html>`;
}

/** Gestionnaire Express de GET /mcp/login : page + CSP stricte (script et style uniquement avec le nonce de la réponse). */
function loginPage(req, res) {
    const nonce = crypto.randomBytes(16).toString('base64');
    res.set({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'`,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
    });
    res.send(html(nonce));
}

export { loginPage };
