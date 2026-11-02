import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, KeyRound, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { commonName, detectAgent, driveHardwareKeyJob, listCertificates, type AgentCertificate } from '../Parapheur/rgsAgent';

interface TestResult {
  ok: boolean;
  certificate: { subject: string; issuer: string; serial: string; email: string | null; notBefore: string; notAfter: string; fingerprint: string; nonRepudiation: boolean };
  checks: { label: string; ok: boolean; detail: string; optional?: boolean }[];
  durations?: { preparationMs: number | null; keyWaitMs: number | null; finalizationMs: number | null; totalMs: number; agent: Record<string, number>[] };
  filename: string;
  pdfBase64: string;
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 16 };
const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const ghost: React.CSSProperties = { ...btn, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' };
const fr = (iso: string) => new Date(iso).toLocaleDateString('fr-FR');
const sec = (ms: number | null | undefined) => (ms == null ? '—' : (ms / 1000).toFixed(1));

/**
 * Test de la clé cryptographique (RGS**) de l'administrateur : détecte l'agent de signature du poste, liste les certificats,
 * puis signe un PDF de démonstration avec la clé (confirmation à l'écran + code PIN) et affiche le rapport de contrôles.
 */
export default function ParapheurKeyTest({ token }: { token: string | null }) {
  const [agentUp, setAgentUp] = useState<boolean | null>(null);
  const [certs, setCerts] = useState<AgentCertificate[]>([]);
  const [thumb, setThumb] = useState('');
  const [agentError, setAgentError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setAgentError(null);
    setAgentUp(null);
    const up = await detectAgent();
    setAgentUp(up);
    if (!up) { setCerts([]); return; }
    try {
      const list = await listCertificates();
      setCerts(list);
      setThumb(prev => (prev && list.some(c => c.thumbprint === prev) ? prev : (list[0]?.thumbprint || '')));
    } catch (e) {
      setAgentError(e instanceof Error ? e.message : 'Lecture des certificats impossible');
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const run = async () => {
    const cert = certs.find(c => c.thumbprint === thumb);
    if (!cert) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      setResult(await driveHardwareKeyJob<TestResult>('/api/parapheur/admin/rgs-test', { Authorization: `Bearer ${token}` }, {}, cert, setStatus));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Test impossible');
    } finally {
      setRunning(false);
      setStatus(null);
    }
  };

  const download = () => {
    if (!result) return;
    const bytes = Uint8Array.from(atob(result.pdfBase64), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const selected = certs.find(c => c.thumbprint === thumb);

  return (
    <div>
      <style>{'@keyframes kt-spin { to { transform: rotate(360deg); } } .spin { animation: kt-spin 1s linear infinite; }'}</style>
      <div style={card}>
        <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
          <KeyRound size={18} color="#7c3aed" /> Tester ma clé cryptographique (RGS**)
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
          Vérifie que votre clé (carte à puce ou clé USB) est correctement reconnue et capable de signer pour le Parapheur : lecture du certificat,
          contrôles de validité, puis signature d'un PDF de démonstration (confirmation à l'écran, puis code PIN). Rien n'est enregistré.
        </p>
      </div>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#475569', marginBottom: 10 }}>1. Agent de signature du poste</div>
        {agentUp === null && <div style={{ fontSize: 13, color: '#64748b', display: 'flex', alignItems: 'center', gap: 8 }}><Loader2 size={15} className="spin" /> Recherche de l'agent…</div>}
        {agentUp === false && (
          <div style={{ fontSize: 13, color: '#b45309' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}><AlertTriangle size={15} /> Agent non détecté sur ce poste.</div>
            <ol style={{ margin: '8px 0 10px 18px', padding: 0, color: '#475569' }}>
              <li>Branchez votre clé.</li>
              <li>Lancez « Agent de signature DSI Hub » (<code>signature-agent\start-agent.bat</code>) et laissez la fenêtre ouverte.</li>
              <li>Si le message « Origine non autorisée » apparaît, ajoutez l'adresse de cette page dans <code>agent.config.json</code> (« origins »).</li>
            </ol>
            <button style={ghost} onClick={refresh}><RefreshCw size={14} /> Rechercher à nouveau</button>
          </div>
        )}
        {agentUp && agentError && <div style={{ fontSize: 13, color: '#b91c1c' }}>{agentError}</div>}
        {agentUp && !agentError && (
          <div style={{ fontSize: 13, color: '#15803d', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
            <CheckCircle2 size={15} /> Agent détecté — {certs.length} certificat(s) utilisable(s) sur ce poste
            <button style={{ ...ghost, padding: '4px 10px', marginLeft: 8 }} onClick={refresh}><RefreshCw size={13} /></button>
          </div>
        )}
      </div>

      {agentUp && certs.length > 0 && (
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
              {running ? <Loader2 size={15} className="spin" /> : <KeyRound size={15} />} Tester la clé
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
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800, color: result.ok ? '#15803d' : '#b91c1c', marginBottom: 12 }}>
            {result.ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
            {result.ok ? 'Votre clé fonctionne : elle peut signer dans le Parapheur.' : 'La clé a signé, mais certains contrôles sont en échec.'}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {result.checks.map(c => (
                <tr key={c.label} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 6px', width: 24 }}>
                    {c.ok ? <CheckCircle2 size={15} color="#15803d" /> : c.optional ? <AlertTriangle size={15} color="#b45309" /> : <XCircle size={15} color="#b91c1c" />}
                  </td>
                  <td style={{ padding: '8px 6px', fontWeight: 600, color: '#334155' }}>{c.label}</td>
                  <td style={{ padding: '8px 6px', color: '#64748b' }}>{c.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 14px', fontSize: 12, color: '#475569', margin: '14px 0' }}>
            <dt style={{ fontWeight: 700 }}>Titulaire</dt><dd style={{ margin: 0 }}>{result.certificate.subject}{result.certificate.email ? ` (${result.certificate.email})` : ''}</dd>
            <dt style={{ fontWeight: 700 }}>Émetteur</dt><dd style={{ margin: 0 }}>{result.certificate.issuer}</dd>
            <dt style={{ fontWeight: 700 }}>N° de série</dt><dd style={{ margin: 0, wordBreak: 'break-all' }}>{result.certificate.serial}</dd>
            <dt style={{ fontWeight: 700 }}>Validité</dt><dd style={{ margin: 0 }}>du {fr(result.certificate.notBefore)} au {fr(result.certificate.notAfter)}</dd>
            <dt style={{ fontWeight: 700 }}>Empreinte SHA-256</dt><dd style={{ margin: 0, wordBreak: 'break-all', fontFamily: 'monospace' }}>{result.certificate.fingerprint}</dd>
          </dl>
          {result.durations && (
            <div style={{ fontSize: 12, color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', margin: '0 0 14px' }}>
              <b>Durées</b> (en secondes) — total {sec(result.durations.totalMs)} :
              {' '}préparation serveur {sec(result.durations.preparationMs)} ·
              {' '}attente de la clé {sec(result.durations.keyWaitMs)} ·
              {' '}finalisation serveur {sec(result.durations.finalizationMs)}
              {result.durations.agent[0] && (
                <div style={{ marginTop: 4 }}>
                  Détail de la clé : recherche du certificat {sec(result.durations.agent[0].findMs)} · votre confirmation {sec(result.durations.agent[0].confirmMs)} ·
                  {' '}ouverture de la clé / code PIN {sec(result.durations.agent[0].keyMs)} · signature par la clé {sec(result.durations.agent[0].signMs)} ·
                  {' '}démarrage de l'agent {sec(Math.max(0, (result.durations.agent[0].totalMs ?? 0) - (result.durations.agent[0].findMs ?? 0) - (result.durations.agent[0].confirmMs ?? 0) - (result.durations.agent[0].keyMs ?? 0) - (result.durations.agent[0].signMs ?? 0)))}
                </div>
              )}
            </div>
          )}
          <button style={ghost} onClick={download}><Download size={14} /> Télécharger le PDF de test signé</button>
          <span style={{ fontSize: 12, color: '#64748b', marginLeft: 10 }}>Ouvrez-le dans Adobe Acrobat : le panneau « Signatures » doit afficher la signature. Le niveau RGS du certificat n'est pas contrôlé automatiquement.</span>
        </div>
      )}
    </div>
  );
}
