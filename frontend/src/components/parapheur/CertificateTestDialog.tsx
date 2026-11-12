import { useEffect, useState } from 'react';
import { KeyRound, Loader2, ShieldCheck, Upload, X } from 'lucide-react';
import ParapheurKeyTest from '../../pages/Admin/ParapheurKeyTest';
import CertTestReport, { type CertTestResult } from './CertTestReport';

type Tab = 'logiciel' | 'materiel';

const primary: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const input: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' };

function tabBtn(active: boolean): React.CSSProperties {
  return { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 10, border: `1px solid ${active ? '#7c3aed' : '#e2e8f0'}`, background: active ? '#7c3aed' : '#fff', color: active ? '#fff' : '#475569', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
}

/** Test du certificat de l'utilisateur : certificat logiciel (.p12 enregistré) ou clé matérielle (agent résident du poste). */
export default function CertificateTestDialog({ token, onClose }: { token: string | null; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('logiciel');
  const [hasCert, setHasCert] = useState<boolean | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CertTestResult | null>(null);

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetch('/api/parapheur/my-certificate', { headers })
      .then(r => r.json())
      .then(d => { setHasCert(!!d.has_certificate); setFilename(d.filename || null); })
      .catch(() => setHasCert(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const runSoftwareTest = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      if (!hasCert) {
        if (!file) throw new Error('Choisissez votre fichier de certificat (.p12 ou .pfx).');
        const fd = new FormData();
        fd.append('file', file);
        fd.append('certificatePassword', password);
        fd.append('remember', 'true');
        const up = await fetch('/api/parapheur/my-certificate', { method: 'POST', headers, body: fd });
        const upData = await up.json().catch(() => ({}));
        if (!up.ok) throw new Error(upData.message || `Import impossible (${up.status})`);
        setHasCert(true);
        setFilename(file.name);
      }
      const r = await fetch('/api/parapheur/my-certificate/test', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || `Test impossible (${r.status})`);
      setResult(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Test impossible');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }} onClick={onClose}>
      <div style={{ background: '#f8fafc', borderRadius: 16, width: '100%', maxWidth: 780, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <ShieldCheck size={22} color="#7c3aed" />
          <h2 style={{ margin: 0, flex: 1, fontSize: 19, fontWeight: 800, color: '#0f172a' }}>Tester mon certificat</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }} aria-label="Fermer"><X size={20} /></button>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b' }}>
          Vérifiez que votre certificat permet bien de signer dans le Parapheur. Le test signe un PDF de démonstration : rien n'est enregistré dans un parapheur.
        </p>

        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          <button style={tabBtn(tab === 'logiciel')} onClick={() => setTab('logiciel')}><ShieldCheck size={15} /> Certificat logiciel (.p12)</button>
          <button style={tabBtn(tab === 'materiel')} onClick={() => setTab('materiel')}><KeyRound size={15} /> Clé matérielle (RGS**)</button>
        </div>

        {tab === 'materiel' ? (
          <ParapheurKeyTest token={token} base="/api/parapheur/my-key-test" embedded />
        ) : (
          <>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 16 }}>
              {hasCert === null ? (
                <div style={{ fontSize: 13, color: '#64748b' }}><Loader2 size={14} className="spin" /> Chargement…</div>
              ) : (
                <>
                  <p style={{ margin: '0 0 12px', fontSize: 13, color: '#475569' }}>
                    {hasCert
                      ? <>Certificat enregistré{filename ? <> : <b>{filename}</b></> : null}. Saisissez son mot de passe pour le tester.</>
                      : "Aucun certificat enregistré : importez votre fichier .p12 / .pfx. Il sera mémorisé (chiffré) pour vos signatures sécurisées."}
                  </p>
                  {!hasCert && <input type="file" accept=".p12,.pfx,application/x-pkcs12" onChange={e => setFile(e.target.files?.[0] || null)} style={{ fontSize: 12, marginBottom: 10 }} />}
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mot de passe du certificat" style={input}
                    onKeyDown={e => { if (e.key === 'Enter' && password && !busy) runSoftwareTest(); }} />
                  <div style={{ marginTop: 12 }}>
                    <button style={{ ...primary, opacity: busy || !password ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer' }} disabled={busy || !password} onClick={runSoftwareTest}>
                      {busy ? <Loader2 size={15} className="spin" /> : hasCert ? <ShieldCheck size={15} /> : <Upload size={15} />} {hasCert ? 'Tester le certificat' : 'Importer et tester'}
                    </button>
                  </div>
                </>
              )}
            </div>
            {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '12px 16px', fontSize: 13, marginBottom: 16 }}>{error}</div>}
            {result && <CertTestReport result={result} okMessage="Votre certificat fonctionne : il peut signer dans le Parapheur." failMessage="Le certificat présente des problèmes (voir ci-dessous)." />}
          </>
        )}
      </div>
      <style>{'@keyframes ct-spin { to { transform: rotate(360deg); } } .spin { animation: ct-spin 1s linear infinite; }'}</style>
    </div>
  );
}
