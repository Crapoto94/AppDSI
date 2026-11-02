import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, KeyRound, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { commonName, driveHardwareKeyJob, listCertificates, probeAgent, type AgentCertificate, type AgentProbe } from '../Parapheur/rgsAgent';
import CertTestReport, { type CertTestResult } from '../../components/parapheur/CertTestReport';

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 16 };
const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const ghost: React.CSSProperties = { ...btn, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' };
const fr = (iso: string) => new Date(iso).toLocaleDateString('fr-FR');
// Compare deux versions « 1.3.0 » : négatif si a < b
const cmpVersion = (a: string, b: string) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
  return 0;
};

/**
 * Test de la clé cryptographique (RGS**) : diagnostic du programme résident (agent de signature du poste), lecture des
 * certificats, puis signature d'un PDF de démonstration (confirmation à l'écran, puis code PIN) avec rapport de contrôles.
 * `base` : racine des routes serveur (administration ou utilisateur) ; `embedded` : sans carte d'introduction.
 */
export default function ParapheurKeyTest({ token, base = '/api/parapheur/admin/rgs-test', embedded = false }: { token: string | null; base?: string; embedded?: boolean }) {
  const [probe, setProbe] = useState<AgentProbe | null>(null);
  const [certs, setCerts] = useState<AgentCertificate[]>([]);
  const [thumb, setThumb] = useState('');
  const [agentError, setAgentError] = useState<string | null>(null);
  // 'inconnu' : vérification impossible ou en cours (on propose quand même le lien) ; 'absent' : fichier non déposé sur le serveur
  const [setupState, setSetupState] = useState<'inconnu' | 'disponible' | 'absent'>('inconnu');
  const [setupVersion, setSetupVersion] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<CertTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setAgentError(null);
    setProbe(null);
    const p = await probeAgent();
    setProbe(p);
    if (!p.up || p.originAllowed === false) { setCerts([]); return; }
    try {
      const list = await listCertificates();
      setCerts(list);
      setThumb(prev => (prev && list.some(c => c.thumbprint === prev) ? prev : (list.find(c => c.nonRepudiation) || list[0])?.thumbprint || ''));
    } catch (e) {
      setAgentError(e instanceof Error ? e.message : 'Lecture des certificats impossible');
    }
  }, []);

  const loadSetupInfo = useCallback(() => {
    fetch('/api/parapheur/agent/info', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => { setSetupState(d.available ? 'disponible' : 'absent'); setSetupVersion(d.version || null); })
      .catch(() => setSetupState('inconnu'));
  }, [token]);

  useEffect(() => { refresh(); loadSetupInfo(); }, [refresh, loadSetupInfo]);

  // Agent installé mais arrêté : le protocole dsihub-agent:// (enregistré par le setup) le démarre, puis on attend sa réponse
  const startAgent = () => {
    setStarting(true);
    window.location.href = 'dsihub-agent://start';
    let tries = 0;
    const timer = setInterval(async () => {
      tries++;
      const p = await probeAgent();
      if (p.up || tries >= 8) { clearInterval(timer); setStarting(false); refresh(); }
    }, 1500);
  };

  const downloadSetup = async () => {
    try {
      const r = await fetch('/api/parapheur/agent/download', { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) {
        loadSetupInfo();
        throw new Error(r.status === 404 ? "L'installateur n'est pas encore déposé sur le serveur : demandez à la DSI de le déposer (backend/data/agent)." : (await r.json().catch(() => null))?.message || `Erreur ${r.status}`);
      }
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = 'DSIHubSignatureAgent-Setup.exe';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setDownloaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Téléchargement impossible');
    }
  };

  const run = async () => {
    const cert = certs.find(c => c.thumbprint === thumb);
    if (!cert) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      setResult(await driveHardwareKeyJob<CertTestResult>(base, { Authorization: `Bearer ${token}` }, {}, cert, setStatus));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Test impossible');
    } finally {
      setRunning(false);
      setStatus(null);
    }
  };

  // Après le téléchargement : on surveille l'arrivée de l'agent (toutes les 3 s, 10 min maximum) et on relance le diagnostic dès qu'il répond
  useEffect(() => {
    if (!downloaded) return;
    let stopped = false;
    const started = Date.now();
    const timer = setInterval(async () => {
      if (stopped || Date.now() - started > 10 * 60 * 1000) { clearInterval(timer); return; }
      const p = await probeAgent();
      if (p.up && !stopped) {
        stopped = true;
        clearInterval(timer);
        setDownloaded(false);
        setJustInstalled(true);
        refresh();
      }
    }, 3000);
    return () => { stopped = true; clearInterval(timer); };
  }, [downloaded, refresh]);

  const outdated = !!(probe?.up && probe.version && setupVersion && cmpVersion(probe.version, setupVersion) < 0);
  const selected = certs.find(c => c.thumbprint === thumb);
  const agentReady = !!probe?.up && probe.originAllowed !== false;
  const signCerts = certs.filter(c => c.nonRepudiation).length;

  const line = (ok: boolean | null, label: string, detail: React.ReactNode) => (
    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
      <td style={{ padding: '8px 6px', width: 24 }}>
        {ok === null ? <Loader2 size={15} className="spin" /> : ok ? <CheckCircle2 size={15} color="#15803d" /> : <XCircle size={15} color="#b91c1c" />}
      </td>
      <td style={{ padding: '8px 6px', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>{label}</td>
      <td style={{ padding: '8px 6px', color: '#64748b' }}>{detail}</td>
    </tr>
  );

  return (
    <div>
      <style>{'@keyframes kt-spin { to { transform: rotate(360deg); } } .spin { animation: kt-spin 1s linear infinite; }'}</style>
      {!embedded && (
        <div style={card}>
          <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
            <KeyRound size={18} color="#7c3aed" /> Tester ma clé cryptographique (RGS**)
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Vérifie que votre clé (carte à puce ou clé USB) est correctement reconnue et capable de signer pour le Parapheur : programme résident, lecture du certificat,
            contrôles de validité, puis signature d'un PDF de démonstration (confirmation à l'écran, puis code PIN). Rien n'est enregistré.
          </p>
        </div>
      )}

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#475569', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          1. Programme résident (agent de signature)
          <button style={{ ...ghost, padding: '4px 10px' }} onClick={() => { refresh(); loadSetupInfo(); }} title="Relancer le diagnostic"><RefreshCw size={13} /></button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            {line(probe === null ? null : probe.up, 'Agent détecté sur ce poste', probe === null ? 'Recherche…' : probe.up ? `version ${probe.version}` : 'aucune réponse sur 127.0.0.1:47821')}
            {probe?.up && line(probe.originAllowed !== false, "Ce site est autorisé par l'agent", probe.originAllowed !== false ? window.location.origin : <>refusé : <b>{window.location.origin}</b></>)}
            {probe?.up && setupVersion && line(!outdated, 'Agent à jour', outdated ? `installé : ${probe.version} — disponible : ${setupVersion}` : `version ${probe.version}`)}
            {agentReady && line(agentError ? false : certs.length > 0, 'Certificats lisibles sur le poste', agentError || (certs.length ? `${certs.length} certificat(s), dont ${signCerts} de signature` : 'aucun certificat utilisable (clé non branchée ou middleware absent)'))}
          </tbody>
        </table>

        {justInstalled && probe?.up && (
          <div style={{ fontSize: 13, color: '#15803d', marginTop: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={15} /> Agent installé et détecté. Branchez votre clé si ce n'est pas fait, puis lancez le test ci-dessous.
          </div>
        )}
        {probe && !probe.up && (
          <div style={{ fontSize: 13, color: '#b45309', marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}><AlertTriangle size={15} /> L'agent de signature ne répond pas sur ce poste.</div>
            <div style={{ margin: '8px 0 6px', color: '#475569', fontWeight: 700 }}>S'il n'est pas encore installé (une seule fois par poste, sans droits administrateur) :</div>
            <ol style={{ margin: '0 0 10px 18px', padding: 0, color: '#475569' }}>
              <li>Téléchargez l'installateur{setupVersion ? ` (version ${setupVersion})` : ''}{setupState === 'absent' ? ' : il n\'est pas encore déposé sur le serveur, demandez à la DSI' : ''}.</li>
              <li>Ouvrez le fichier téléchargé <code>DSIHubSignatureAgent-Setup.exe</code> et suivez l'assistant (laissez cochée « Lancer l'agent automatiquement à l'ouverture de session »).</li>
              <li>Revenez sur cette page : l'agent est détecté automatiquement.</li>
            </ol>
            {setupState !== 'absent' && <button style={btn} onClick={downloadSetup}><Download size={14} /> Télécharger l'installateur de l'agent</button>}
            {downloaded && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, color: '#6d28d9', fontWeight: 700 }}>
                <Loader2 size={15} className="spin" /> Téléchargement lancé : ouvrez le fichier puis installez-le, cette page attend l'agent…
              </div>
            )}
            <div style={{ margin: '12px 0 6px', color: '#475569' }}>
              <b>Déjà installé mais arrêté ?</b> Démarrez-le : il se lance aussi tout seul à chaque ouverture de session Windows (icône de clé violette près de l'horloge).
            </div>
            <button style={ghost} onClick={startAgent} disabled={starting}>
              {starting ? <Loader2 size={14} className="spin" /> : <KeyRound size={14} />} Démarrer l'agent
            </button>
            <span style={{ fontSize: 12, color: '#64748b', marginLeft: 10 }}>Le navigateur peut demander l'autorisation d'ouvrir le programme. Sinon : menu Démarrer → « Agent de signature DSI Hub ».</span>
          </div>
        )}
        {outdated && (
          <div style={{ fontSize: 13, color: '#b45309', marginTop: 10 }}>
            Une version plus récente de l'agent est disponible ({setupVersion}). Téléchargez-la et installez-la par-dessus la version actuelle (la configuration est conservée).{' '}
            {setupState !== 'absent' && <button style={btn} onClick={downloadSetup}><Download size={14} /> Télécharger la mise à jour</button>}
          </div>
        )}
        {probe?.up && probe.originAllowed === false && (
          <div style={{ fontSize: 13, color: '#b45309', marginTop: 10 }}>
            L'agent tourne mais refuse ce site. Clic droit sur l'icône de l'agent → <b>Paramètres</b> → ajoutez <code>{window.location.origin}</code> dans les adresses autorisées, puis revenez ici.
          </div>
        )}
      </div>

      {agentReady && certs.length > 0 && (
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#475569', marginBottom: 10 }}>2. Certificat à tester</div>
          <select value={thumb} onChange={e => setThumb(e.target.value)} disabled={running}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box', background: '#fff' }}>
            {certs.map(c => (
              <option key={c.thumbprint} value={c.thumbprint}>
                {commonName(c.subject)} — {commonName(c.issuer)} — jusqu'au {fr(c.notAfter)}{c.nonRepudiation ? ' — signature' : ' — authentification'}
              </option>
            ))}
          </select>
          {selected && !selected.nonRepudiation && (
            <p style={{ fontSize: 12, color: '#b45309', margin: '8px 0 0' }}>Ce certificat est un certificat d'authentification : pour signer, choisissez celui dont l'usage est « signature ».</p>
          )}
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button style={{ ...btn, opacity: running ? 0.6 : 1, cursor: running ? 'wait' : 'pointer' }} disabled={running} onClick={run}>
              {running ? <Loader2 size={15} className="spin" /> : <KeyRound size={15} />} Tester la signature avec la clé
            </button>
            {status && <span style={{ fontSize: 13, fontWeight: 700, color: '#6d28d9' }}>{status}</span>}
          </div>
        </div>
      )}

      {error && (
        <div style={{ ...card, borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c', fontSize: 13, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <XCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> <div><b>Le test a échoué.</b> {error}</div>
        </div>
      )}

      {result && (
        <CertTestReport result={result} okMessage="Votre clé fonctionne : elle peut signer dans le Parapheur." failMessage="La clé a signé, mais certains contrôles sont en échec." />
      )}
    </div>
  );
}
