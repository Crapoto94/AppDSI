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
  sms_phone?: string | null;
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

  const [publicBaseUrl, setPublicBaseUrl] = useState('');
  const [internalBaseUrl, setInternalBaseUrl] = useState('');
  const [settingsInput, setSettingsInput] = useState('');
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [sealEnabled, setSealEnabled] = useState(true);
  const [bulkSignMention, setBulkSignMention] = useState('');
  const [notifyInterval, setNotifyInterval] = useState(2);
  const [ca, setCa] = useState<{ exists: boolean; subject?: string | null; serial?: string | null; fingerprint?: string | null; valid_to?: string | null } | null>(null);
  const [caMsg, setCaMsg] = useState<string | null>(null);
  const [caBusy, setCaBusy] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const [c, l, s, cfg, caInfo] = await Promise.all([
        fetch('/api/parapheur/certificates', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        fetch('/api/parapheur/signature-logs', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        fetch('/api/parapheur/security', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        fetch('/api/parapheur/admin/settings', { headers: { Authorization: `Bearer ${token}` } }).then(r => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/parapheur/admin/ca', { headers: { Authorization: `Bearer ${token}` } }).then(r => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (cfg && typeof cfg === 'object' && !cfg.message) {
        setPublicBaseUrl(cfg.public_base_url || '');
        setInternalBaseUrl(cfg.internal_base_url || '');
        setSettingsInput(prev => (prev || cfg.public_base_url || ''));
        setSealEnabled(cfg.seal_enabled !== false);
        setBulkSignMention(cfg.bulk_sign_mention || '');
        setNotifyInterval(Number(cfg.notify_interval_minutes) || 2);
      }
      if (caInfo && typeof caInfo === 'object') setCa(caInfo);
      if (c.message || l.message || s.message) throw new Error(c.message || l.message || s.message);
      setCerts(Array.isArray(c) ? c : []);
      setLogs(Array.isArray(l) ? l : []);
      setSecurity(Array.isArray(s) ? s : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement');
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const saveSettings = async () => {
    setSavingSettings(true); setSettingsMsg(null);
    try {
      const r = await fetch('/api/parapheur/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ public_base_url: settingsInput, seal_enabled: sealEnabled, bulk_sign_mention: bulkSignMention, notify_interval_minutes: notifyInterval }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || 'Erreur');
      setPublicBaseUrl(d.public_base_url || '');
      setInternalBaseUrl(d.internal_base_url || '');
      setSealEnabled(d.seal_enabled !== false);
      setBulkSignMention(d.bulk_sign_mention || '');
      setNotifyInterval(Number(d.notify_interval_minutes) || 2);
      setSettingsMsg('Paramètres enregistrés.');
    } catch (e: unknown) { setSettingsMsg(e instanceof Error ? e.message : 'Erreur'); }
    finally { setSavingSettings(false); }
  };

  const generateCa = async () => {
    if (!confirm("Générer (ou régénérer) l'autorité de certification interne ? Les documents déjà scellés conservent leur certificat.")) return;
    setCaBusy(true); setCaMsg(null);
    try {
      const r = await fetch('/api/parapheur/admin/ca', { method: 'POST', headers });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || 'Erreur');
      setCa({ exists: true, subject: d.subject, serial: d.serial, fingerprint: d.fingerprint, valid_to: d.valid_to });
      setCaMsg("Autorité de certification générée. Les prochains documents scellés l'utiliseront.");
    } catch (e: unknown) { setCaMsg(e instanceof Error ? e.message : 'Erreur'); }
    finally { setCaBusy(false); }
  };

  const downloadCa = async () => {
    try {
      const r = await fetch('/api/parapheur/admin/ca/cert', { headers });
      if (!r.ok) throw new Error('Certificat indisponible');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ac-parapheur.pem';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e: unknown) { setCaMsg(e instanceof Error ? e.message : 'Erreur'); }
  };

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

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
          URL publique du parapheur (flashcode de vérification)
        </div>
        <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 10px' }}>
          Domaine externe utilisé pour construire le lien du flashcode apposé sur les PDF signés (ex. <code>https://chat.ivry94.fr</code>), afin qu'il soit joignable hors du réseau interne. Laisser vide pour utiliser l'URL interne.
          {internalBaseUrl && <> URL interne actuelle : <code>{internalBaseUrl}</code>.</>}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={settingsInput}
            onChange={e => setSettingsInput(e.target.value)}
            placeholder="https://chat.ivry94.fr"
            style={{ flex: '1 1 280px', minWidth: 220, padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}
          />
          <button
            onClick={saveSettings}
            disabled={savingSettings}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: savingSettings ? 0.6 : 1 }}
          >
            {savingSettings ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
        {publicBaseUrl && (
          <p style={{ fontSize: 12, color: '#15803d', margin: '10px 0 0' }}>
            Lien généré : <code>{publicBaseUrl}/parapheur/verification/&lt;jeton&gt;</code>
          </p>
        )}

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
            Fréquence d'envoi des e-mails de signature
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="number"
              min={1}
              max={240}
              value={notifyInterval}
              onChange={e => setNotifyInterval(Math.max(1, Math.min(240, Number(e.target.value) || 2)))}
              style={{ width: 90, padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}
            />
            <span style={{ fontSize: 12, color: '#64748b' }}>minutes — les parapheurs activés sont regroupés en un seul e-mail.</span>
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#475569', marginTop: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={sealEnabled} onChange={e => setSealEnabled(e.target.checked)} />
          Apposer un <b>sceau PAdES de fin de circuit</b> (signature cryptographique de la plateforme) sur les documents signés.
        </label>

        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
            Formule de signature en masse
          </div>
          <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 8px' }}>
            Texte affiché au signataire pour l'engager lorsqu'il signe plusieurs documents en masse (sans lecture
            intégrale). Laisser vide pour utiliser la formule par défaut.
          </p>
          <textarea
            value={bulkSignMention}
            onChange={e => setBulkSignMention(e.target.value.slice(0, 2000))}
            rows={4}
            placeholder="Formule juridique…"
            style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
            Autorité de certification interne (sceau de la plateforme)
          </div>
          {ca?.exists ? (
            <div style={{ fontSize: 12, color: '#475569', display: 'grid', gap: 3 }}>
              <div><b>Sujet :</b> {ca.subject}</div>
              <div><b>N° de série :</b> {ca.serial}</div>
              {ca.valid_to && <div><b>Valide jusqu'au :</b> {new Date(ca.valid_to).toLocaleDateString('fr-FR')}</div>}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#b45309' }}>
              Aucune autorité de certification générée : elle sera créée automatiquement au premier scellement.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button
              onClick={generateCa}
              disabled={caBusy}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: caBusy ? 'default' : 'pointer', opacity: caBusy ? 0.6 : 1 }}
            >
              {caBusy ? 'Génération…' : (ca?.exists ? "Régénérer l'AC" : "Générer l'AC")}
            </button>
            {ca?.exists && (
              <button
                onClick={downloadCa}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', background: '#fff', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >
                Télécharger le certificat
              </button>
            )}
          </div>
          {caMsg && <p style={{ fontSize: 12, color: '#475569', margin: '8px 0 0' }}>{caMsg}</p>}
        </div>

        {settingsMsg && <p style={{ fontSize: 12, color: '#475569', margin: '8px 0 0' }}>{settingsMsg}</p>}
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
        <KeyRound size={13} /> Le mot de passe du certificat n'est jamais stocké. <HelpCircle size={13} /> « Prêt à signer » = fichier déchiffrable + clé privée présente + certificat non expiré. La vérification du mot de passe se fait au moment de la signature.
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
            {['Date', 'Signataire', 'Parapheur', 'Action', 'Mode', 'Téléphone SMS', 'Documents', 'IP'].map((h, i) => <th key={i} style={th}>{h}</th>)}
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
                <td style={{ ...td, fontFamily: 'monospace', fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>
                  {l.signature_mode === 'sms' ? (l.sms_phone || '—') : '—'}
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
