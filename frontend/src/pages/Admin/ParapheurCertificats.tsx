import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Trash2, RefreshCw, ShieldCheck, AlertTriangle, KeyRound, HelpCircle, PenLine, Fingerprint, FileText, Smartphone } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import AgentPresenceBadge from '../../components/AgentPresenceBadge';

interface CertRow {
  id: number;
  email: string;
  agent_id?: number | null;
  nom?: string | null;
  filename?: string | null;
  subject?: string | null;
  issuer?: string | null;
  serial?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
  has_private_key?: boolean | null;
  is_verified?: boolean | null;
  validation_error?: string | null;
  updated_at?: string | null;
  decryptable: boolean;
  validity: 'valid' | 'expired' | 'not_yet' | 'unknown';
  ready_to_sign: boolean;
}

interface LogRow {
  nom: string;
  email: string;
  status: string;
  signature_mode: string;
  signed_at?: string | null;
  rejected_at?: string | null;
  rejection_comment?: string | null;
  ip?: string | null;
  parapheur_id: number;
  title: string;
  reference: string;
  mode: string;
  nb_documents: number;
  documents: string;
}

interface SecRow {
  id: number;
  parapheur_id: number;
  reference: string;
  title: string;
  parapheur_status: string;
  original_name: string;
  doc_hash?: string | null;
  integrity_ok?: boolean | null;
  has_signed: boolean;
  has_pades: boolean;
  has_crypto_signature: boolean;
}

type Tab = 'certificats' | 'logs' | 'securite';

const VALIDITY: Record<string, { label: string; style: React.CSSProperties }> = {
  valid: { label: 'Valide', style: { color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0' } },
  expired: { label: 'Expiré', style: { color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca' } },
  not_yet: { label: 'Pas encore valide', style: { color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a' } },
  unknown: { label: 'Inconnu', style: { color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0' } },
};

export default function ParapheurCertificats() {
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>('certificats');
  const [certs, setCerts] = useState<CertRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [security, setSecurity] = useState<SecRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const headers = { Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const [c, l, s] = await Promise.all([
        fetch('/api/parapheur/certificates', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        fetch('/api/parapheur/signature-logs', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        fetch('/api/parapheur/security', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      ]);
      if (c.message || l.message || s.message) throw new Error(c.message || l.message || s.message);
      setCerts(Array.isArray(c) ? c : []);
      setLogs(Array.isArray(l) ? l : []);
      setSecurity(Array.isArray(s) ? s : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement');
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const removeCert = async (row: CertRow) => {
    if (!confirm(`Supprimer le certificat de ${row.nom || row.email} ? L'agent devra le réimporter pour signer en mode sécurisé.`)) return;
    setBusyId(row.id);
    try {
      const r = await fetch(`/api/parapheur/certificates/${row.id}`, { method: 'DELETE', headers });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || 'Erreur');
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Suppression impossible');
    } finally { setBusyId(null); }
  };

  const readyCount = certs.filter(r => r.ready_to_sign).length;
  const signedDocs = security.filter(d => d.has_crypto_signature).length;

  const tabs: [Tab, string, number][] = [
    ['certificats', 'Certificats P12', certs.length],
    ['logs', 'Journal de signature', logs.length],
    ['securite', 'Sécurité & non-falsification', signedDocs],
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <ShieldCheck size={26} color="#7c3aed" />
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Parapheur</h1>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: '#64748b' }}>
            Certificats, journal des signatures et éléments de sécurisation
          </p>
        </div>
        <button onClick={load} style={ghostBtn}><RefreshCw size={15} /> Actualiser</button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map(([k, label, n]) => (
          <button key={k} onClick={() => setTab(k)} style={tabBtn(tab === k)}>
            {label}
            {n > 0 && <span style={badge(tab === k)}>{n}</span>}
          </button>
        ))}
      </div>

      {error && <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: 13, marginBottom: 14 }}>{error}</div>}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Chargement…</div>
      ) : tab === 'certificats' ? (
        <Certificates certs={certs} readyCount={readyCount} busyId={busyId} onRemove={removeCert} />
      ) : tab === 'logs' ? (
        <Logs logs={logs} />
      ) : (
        <Security rows={security} />
      )}
    </div>
  );
}

function Certificates({ certs, readyCount, busyId, onRemove }: { certs: CertRow[]; readyCount: number; busyId: number | null; onRemove: (r: CertRow) => void }) {
  if (certs.length === 0) return <Empty>Aucun certificat enregistré.</Empty>;
  return (
    <>
      <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 0 }}>{certs.length} certificat(s) — {readyCount} prêt(s) à signer</p>
      <div style={card}>
        <table style={table}>
          <thead>
            <tr style={theadRow}>
              {['Agent', 'Fichier', 'Sujet (CN)', 'Validité', 'Clé privée', 'Chiffré OK', 'Prêt à signer', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {certs.map(r => {
              const v = VALIDITY[r.validity] || VALIDITY.unknown;
              return (
                <tr key={r.id} style={tr}>
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <AgentPresenceBadge email={r.email} name={r.nom} size={13} />
                      <div>
                        <div style={{ fontWeight: 700, color: '#1e293b' }}>{r.nom || r.email}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ ...td, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.filename || '—'}</td>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{r.subject || '—'}</div>
                    {r.issuer && <div style={{ fontSize: 11, color: '#94a3b8' }}>Émetteur : {r.issuer}</div>}
                  </td>
                  <td style={td}>
                    <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 10, fontSize: 11, fontWeight: 700, ...v.style }}>{v.label}</span>
                    {r.valid_to && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>→ {new Date(r.valid_to).toLocaleDateString('fr-FR')}</div>}
                  </td>
                  <td style={td}>{yesNo(r.has_private_key)}</td>
                  <td style={td}>{yesNo(r.decryptable)}</td>
                  <td style={td}>
                    {r.ready_to_sign
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#15803d', fontWeight: 700 }}><CheckCircle2 size={14} /> Oui</span>
                      : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#b45309', fontWeight: 700 }}><AlertTriangle size={14} /> Non</span>}
                    {!r.is_verified && r.validation_error && <div style={{ fontSize: 11, color: '#b45309', maxWidth: 200 }}>{r.validation_error}</div>}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <button onClick={() => onRemove(r)} disabled={busyId === r.id} title="Supprimer le certificat" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626', display: 'inline-flex', padding: 4 }}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
        <KeyRound size={13} /> Le mot de passe du certificat n'est jamais stocké. <HelpCircle size={13} /> « Prêt à signer » = chiffré + clé privée + certificat vérifié et non expiré.
      </p>
    </>
  );
}

function Logs({ logs }: { logs: LogRow[] }) {
  if (logs.length === 0) return <Empty>Aucune signature enregistrée pour le moment.</Empty>;
  return (
    <div style={card}>
      <table style={table}>
        <thead>
          <tr style={theadRow}>
            {['Date', 'Signataire', 'Parapheur', 'Action', 'Mode', 'Documents', 'IP'].map((h, i) => <th key={i} style={th}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {logs.map((l, i) => {
            const date = l.signed_at || l.rejected_at;
            const refused = l.status === 'refuse';
            return (
              <tr key={i} style={tr}>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{date ? new Date(date).toLocaleString('fr-FR') : '—'}</td>
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AgentPresenceBadge email={l.email} name={l.nom} size={13} />
                    <div>
                      <div style={{ fontWeight: 700, color: '#1e293b' }}>{l.nom}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{l.email}</div>
                    </div>
                  </div>
                </td>
                <td style={td}>
                  <div style={{ fontWeight: 600, color: '#1e293b' }}>{l.title}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{l.reference}</div>
                </td>
                <td style={td}>
                  {refused
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#b91c1c', fontWeight: 700 }}><XCircle size={14} /> Refusé</span>
                    : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#15803d', fontWeight: 700 }}><PenLine size={14} /> Signé</span>}
                  {refused && l.rejection_comment && <div style={{ fontSize: 11, color: '#b91c1c', fontStyle: 'italic' }}>« {l.rejection_comment} »</div>}
                </td>
                <td style={td}>
                  {l.signature_mode === 'securise'
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#6d28d9', fontWeight: 700 }}><ShieldCheck size={13} /> P12</span>
                    : l.signature_mode === 'sms'
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#0e7490', fontWeight: 700 }}><Smartphone size={13} /> SMS</span>
                      : <span style={{ color: '#64748b' }}>Simple</span>}
                </td>
                <td style={{ ...td, maxWidth: 240 }}>
                  <span title={l.documents} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#475569', fontSize: 12 }}>{l.documents || '—'}</span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{l.nb_documents} document(s)</span>
                </td>
                <td style={{ ...td, fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>{l.ip || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Security({ rows }: { rows: SecRow[] }) {
  if (rows.length === 0) return <Empty>Aucun document.</Empty>;
  return (
    <>
      <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 0 }}>
        Empreinte SHA-256 de l'original, présence d'une signature cryptographique (PAdES) et du PDF signé.
      </p>
      <div style={card}>
        <table style={table}>
          <thead>
            <tr style={theadRow}>
              {['Document', 'Parapheur', 'Empreinte SHA-256', 'PDF signé', 'Signature PAdES', 'Intégrité'].map((h, i) => <th key={i} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(d => (
              <tr key={d.id} style={tr}>
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileText size={14} color="#ef4444" />
                    <span style={{ fontWeight: 600, color: '#1e293b' }}>{d.original_name}</span>
                  </div>
                </td>
                <td style={td}>
                  <div style={{ fontWeight: 600, color: '#1e293b' }}>{d.title}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{d.reference}</div>
                </td>
                <td style={td}>
                  {d.doc_hash
                    ? <code title={d.doc_hash} style={{ fontSize: 11, color: '#475569', background: '#f8fafc', padding: '2px 6px', borderRadius: 4 }}>{d.doc_hash.slice(0, 16)}…</code>
                    : <span style={{ color: '#94a3b8' }}>—</span>}
                </td>
                <td style={td}>{d.has_signed ? yesNo(true) : <span style={{ color: '#94a3b8' }}>En attente</span>}</td>
                <td style={td}>
                  {d.has_crypto_signature
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#15803d', fontWeight: 700 }}><Fingerprint size={14} /> Présente</span>
                    : <span style={{ color: '#94a3b8' }}>—</span>}
                </td>
                <td style={td}>
                  {d.integrity_ok === true
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#15803d', fontWeight: 700 }}><CheckCircle2 size={14} /> Intègre</span>
                    : d.integrity_ok === false
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#b91c1c', fontWeight: 700 }}><XCircle size={14} /> Altéré</span>
                      : <span style={{ color: '#94a3b8' }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', background: '#fff', borderRadius: 12, border: '1px dashed #e2e8f0' }}>{children}</div>;
}

function yesNo(v: boolean | null | undefined) {
  if (v === true) return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#15803d', fontWeight: 700 }}><CheckCircle2 size={14} /> Oui</span>;
  if (v === false) return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#b91c1c', fontWeight: 700 }}><XCircle size={14} /> Non</span>;
  return <span style={{ color: '#94a3b8' }}>—</span>;
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const theadRow: React.CSSProperties = { background: '#f8fafc' };
const th: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 12, borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' };
const tr: React.CSSProperties = { borderBottom: '1px solid #f1f5f9' };
const td: React.CSSProperties = { padding: '10px 14px', color: '#475569', verticalAlign: 'top' };
const ghostBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: 'pointer' };

function tabBtn(active: boolean): React.CSSProperties {
  return { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 10, border: `1px solid ${active ? '#7c3aed' : '#e2e8f0'}`, background: active ? '#7c3aed' : '#fff', color: active ? '#fff' : '#475569', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
}
function badge(active: boolean): React.CSSProperties {
  return { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, fontSize: 11, fontWeight: 800, lineHeight: 1, background: active ? 'rgba(255,255,255,0.28)' : '#ede9fe', color: active ? '#fff' : '#6d28d9' };
}
