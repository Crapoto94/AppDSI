import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { X, Loader, Send, CheckCircle2, Upload, Paperclip } from 'lucide-react';

export interface BatchInvoice {
  invoice_ref: string; invoice_number: string; invoice_label: string; invoice_supplier: string; invoice_amount: any; invoice_section: string;
}

interface Props {
  invoices: BatchInvoice[];
  mode: 'circuit' | 'self';
  onClose: () => void;
  onDone: () => void;
}

// Service fait PAR LOT : plusieurs factures d'un même fournisseur traitées avec les mêmes paramètres
// (même vérificateur / même déclaration). POST /api/finance/service-fait/batch — un échec n'arrête pas le lot.
export default function ServiceFaitBatchModal({ invoices, mode, onClose, onDone }: Props) {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };
  const isSelf = mode === 'self';
  const [agents, setAgents] = useState<any[]>([]);
  const [directors, setDirectors] = useState<any[]>([]);
  const [verifier, setVerifier] = useState('');
  const [directorMode, setDirectorMode] = useState<'none' | 'informe' | 'visa'>('none');
  const [entityCode, setEntityCode] = useState('');
  const [comment, setComment] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [date, setDate] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<{ invoice_ref: string; ok: boolean; message: string }[] | null>(null);

  useEffect(() => {
    if (isSelf) return;
    axios.get('/api/calendrier-dsi/agents', { headers }).then(r => setAgents(Array.isArray(r.data) ? r.data : [])).catch(() => setAgents([]));
    axios.get('/api/finance/service-fait/directors', { headers }).then(r => {
      const list = Array.isArray(r.data) ? r.data : [];
      setDirectors(list);
      const dsi = list.find((d: any) => /SYST[EÈ]MES D.INFORMATION/i.test(d.entity_label || ''));
      setEntityCode((dsi || list[0] || {}).entity_code || '');
    }).catch(() => setDirectors([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const director = directors.find(d => d.entity_code === entityCode) || directors[0];
  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const a of [...agents].sort((x, y) => (x.nom || '').localeCompare(y.nom || ''))) {
      const k = (a.service || '').trim() || 'Autres';
      (map[k] = map[k] || []).push(a);
    }
    return Object.keys(map).sort().map(k => [k, map[k]] as const);
  }, [agents]);
  const total = invoices.reduce((a, i) => a + (parseFloat(String(i.invoice_amount)) || 0), 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (isSelf && !comment.trim() && files.length === 0) { setError('Renseignez un commentaire ou joignez au moins une pièce justificative (l’un des deux suffit).'); return; }
    if (!isSelf && !verifier) { setError('Veuillez choisir un vérificateur.'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('mode', mode);
      fd.append('invoices', JSON.stringify(invoices));
      fd.append('service_fait_date', isSelf ? date : '');
      if (isSelf) { fd.append('comment', comment); files.forEach(f => fd.append('files', f)); }
      else {
        fd.append('verifier_username', verifier);
        if (director && directorMode !== 'none') { fd.append('director_mode', directorMode); fd.append('entity_code', director.entity_code); }
      }
      const r = await axios.post('/api/finance/service-fait/batch', fd, { headers: { ...headers, 'Content-Type': 'multipart/form-data' } });
      setResults(r.data?.results || []);
      onDone();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du traitement par lot.');
    } finally { setBusy(false); }
  };

  const lbl: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 };
  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', background: '#fff' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, flex: 1, fontSize: 18, fontWeight: 700 }}>{isSelf ? 'Service fait par lot — déclaration directe' : 'Validation du service fait par lot'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
        </div>
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', marginBottom: 8 }}>{invoices.length} factures — {invoices[0]?.invoice_supplier}</div>
          <div style={{ maxHeight: 140, overflowY: 'auto' }}>
            {invoices.map(i => (
              <div key={i.invoice_ref} style={{ display: 'flex', gap: 8 }}>
                <strong>{i.invoice_number || i.invoice_ref}</strong>
                <span style={{ flex: 1, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.invoice_label}</span>
                <span>{(parseFloat(String(i.invoice_amount)) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'right', fontWeight: 700, marginTop: 6 }}>Total : {total.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</div>
        </div>

        {error && <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#b91c1c', fontSize: 13, marginBottom: 14 }}>{error}</div>}

        {results ? (
          <div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{results.filter(r => r.ok).length} facture(s) traitée(s) sur {results.length}</div>
            {results.map(r => <div key={r.invoice_ref} style={{ fontSize: 13, color: r.ok ? '#166534' : '#b91c1c', padding: '3px 0' }}>{r.ok ? '✔' : '✖'} {r.invoice_ref}{r.ok ? '' : ` — ${r.message}`}</div>)}
            <button onClick={onClose} style={{ marginTop: 16, width: '100%', padding: 12, background: '#6366f1', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Fermer</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            {isSelf ? (
              <>
                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>Date de service fait</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>Commentaire <span style={{ fontWeight: 400, color: '#94a3b8' }}>— ou joignez une pièce ci-dessous (appliqués à chaque facture)</span></label>
                  <textarea value={comment} onChange={e => setComment(e.target.value)} rows={4} style={{ ...inp, resize: 'vertical' }} placeholder="Précisez le service fait (prestation réalisée, date, référence…)" />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>Pièce(s) justificative(s)</label>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, border: '1.5px dashed #cbd5e1', borderRadius: 8, background: '#f8fafc', color: '#475569', fontSize: 13, cursor: 'pointer' }}>
                    <Upload size={16} /> Choisir un ou plusieurs fichiers
                    <input type="file" multiple style={{ display: 'none' }} onChange={e => setFiles(Array.from(e.target.files || []))} />
                  </label>
                  {files.length > 0 && <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none' }}>{files.map((f, i) => <li key={i} style={{ fontSize: 12, color: '#475569', display: 'flex', gap: 6, alignItems: 'center' }}><Paperclip size={12} /> {f.name}</li>)}</ul>}
                </div>
              </>
            ) : (
              <>
                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>Vérificateur <span style={{ color: '#dc2626' }}>*</span></label>
                  <select value={verifier} onChange={e => setVerifier(e.target.value)} required style={inp}>
                    <option value="">-- Choisir un agent DSI --</option>
                    {grouped.map(([service, list]) => <optgroup key={service} label={service}>{list.map(a => <option key={a.username} value={a.username}>{a.nom || a.username}</option>)}</optgroup>)}
                  </select>
                  <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>Le vérificateur reçoit un lien par facture ; il saisit la date de service fait à sa décision.</div>
                </div>
                {director && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={lbl}>Directeur — {director.director_name}</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {([['none', 'Aucun'], ['informe', 'Informé'], ['visa', 'Avec visa']] as const).map(([v, l]) => (
                        <button type="button" key={v} onClick={() => setDirectorMode(v)}
                          style={{ flex: 1, padding: '9px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, border: directorMode === v ? '1.5px solid #6366f1' : '1.5px solid #e2e8f0', background: directorMode === v ? '#eef2ff' : '#fff', color: directorMode === v ? '#3730a3' : '#475569' }}>{l}</button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            <button type="submit" disabled={busy}
              style={{ width: '100%', padding: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: busy ? '#a5b4fc' : (isSelf ? '#16a34a' : '#6366f1'), color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
              {busy ? <><Loader size={16} /> Traitement…</> : isSelf ? <><CheckCircle2 size={16} /> Valider le service fait ({invoices.length})</> : <><Send size={16} /> Lancer la validation ({invoices.length})</>}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
