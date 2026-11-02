import { AlertTriangle, CheckCircle2, Download, XCircle } from 'lucide-react';

export interface CertTestResult {
  ok: boolean;
  certificate: { subject: string; issuer: string; serial: string; email?: string | null; notBefore: string; notAfter: string; fingerprint?: string; nonRepudiation?: boolean } | null;
  checks: { label: string; ok: boolean; detail: string; optional?: boolean }[];
  durations?: { preparationMs: number | null; keyWaitMs: number | null; finalizationMs: number | null; totalMs: number; agent: Record<string, number>[] };
  filename?: string;
  pdfBase64?: string | null;
}

const ghost: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const fr = (iso: string) => new Date(iso).toLocaleDateString('fr-FR');
const sec = (ms: number | null | undefined) => (ms == null ? '—' : (ms / 1000).toFixed(1));

/** Rapport d'un test de certificat (logiciel ou clé matérielle) : contrôles, identité du certificat, durées, PDF signé d'essai. */
export default function CertTestReport({ result, okMessage, failMessage }: { result: CertTestResult; okMessage: string; failMessage: string }) {
  const download = () => {
    if (!result.pdfBase64) return;
    const bytes = Uint8Array.from(atob(result.pdfBase64), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename || 'test-signature.pdf';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  const ag = result.durations?.agent?.[0];

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800, color: result.ok ? '#15803d' : '#b91c1c', marginBottom: 12 }}>
        {result.ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
        {result.ok ? okMessage : failMessage}
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
      {result.certificate && (
        <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 14px', fontSize: 12, color: '#475569', margin: '14px 0' }}>
          <dt style={{ fontWeight: 700 }}>Titulaire</dt><dd style={{ margin: 0 }}>{result.certificate.subject}{result.certificate.email ? ` (${result.certificate.email})` : ''}</dd>
          <dt style={{ fontWeight: 700 }}>Émetteur</dt><dd style={{ margin: 0 }}>{result.certificate.issuer}</dd>
          <dt style={{ fontWeight: 700 }}>N° de série</dt><dd style={{ margin: 0, wordBreak: 'break-all' }}>{result.certificate.serial}</dd>
          <dt style={{ fontWeight: 700 }}>Validité</dt><dd style={{ margin: 0 }}>du {fr(result.certificate.notBefore)} au {fr(result.certificate.notAfter)}</dd>
          {result.certificate.fingerprint && (<><dt style={{ fontWeight: 700 }}>Empreinte SHA-256</dt><dd style={{ margin: 0, wordBreak: 'break-all', fontFamily: 'monospace' }}>{result.certificate.fingerprint}</dd></>)}
        </dl>
      )}
      {result.durations && (
        <div style={{ fontSize: 12, color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', margin: '0 0 14px' }}>
          <b>Durées</b> (en secondes) — total {sec(result.durations.totalMs)} : préparation serveur {sec(result.durations.preparationMs)} · attente de la clé {sec(result.durations.keyWaitMs)} · finalisation serveur {sec(result.durations.finalizationMs)}
          {ag && (
            <div style={{ marginTop: 4 }}>
              Détail de la clé : recherche du certificat {sec(ag.findMs)} · votre confirmation {sec(ag.confirmMs)} · ouverture de la clé / code PIN {sec(ag.keyMs)} · signature par la clé {sec(ag.signMs)} ·
              {' '}démarrage de l'agent {sec(Math.max(0, (ag.totalMs ?? 0) - (ag.findMs ?? 0) - (ag.confirmMs ?? 0) - (ag.keyMs ?? 0) - (ag.signMs ?? 0)))}
            </div>
          )}
        </div>
      )}
      {result.pdfBase64 && (
        <>
          <button style={ghost} onClick={download}><Download size={14} /> Télécharger le PDF de test signé</button>
          <span style={{ fontSize: 12, color: '#64748b', marginLeft: 10 }}>Ouvrez-le dans Adobe Acrobat : le panneau « Signatures » doit afficher la signature.</span>
        </>
      )}
    </div>
  );
}
