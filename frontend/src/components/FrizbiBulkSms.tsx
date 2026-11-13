import React, { useMemo, useState } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, Send, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const sel: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem', background: '#f8fafc', boxSizing: 'border-box' };
const lbl: React.CSSProperties = { display: 'block', fontWeight: 700, fontSize: '0.8rem', color: '#475569', marginBottom: 6 };

// Même règle que le backend (mobiles français) pour l'aperçu
const normalizeMobile = (v: unknown): string | null => {
  let n = String(v ?? '').replace(/[^\d+]/g, '');
  if (n.startsWith('+33')) n = '0' + n.slice(3);
  else if (n.startsWith('0033')) n = '0' + n.slice(4);
  else if (/^[67]\d{8}$/.test(n)) n = '0' + n;
  return /^0[67]\d{8}$/.test(n) ? n : null;
};
const varKey = (h: string) => h.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();

/** Envoi d'un même message SMS (Frizbi) à tous les contacts d'un fichier Excel, en choisissant la colonne du mobile. */
const FrizbiBulkSms: React.FC = () => {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };

  const [fileName, setFileName] = useState('');
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheet, setSheet] = useState('');
  const [rows, setRows] = useState<any[][]>([]);
  const [phoneCol, setPhoneCol] = useState(-1);
  const [firstCol, setFirstCol] = useState(-1);
  const [lastCol, setLastCol] = useState(-1);
  const [title, setTitle] = useState('Message DSI');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const columns: string[] = useMemo(() => (rows[0] || []).map((h, i) => String(h ?? '').trim() || `Colonne ${i + 1}`), [rows]);
  const data = useMemo(() => rows.slice(1).filter(r => r.some(c => String(c ?? '').trim() !== '')), [rows]);

  const loadSheet = (wb: XLSX.WorkBook, name: string) => {
    const r = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[name], { header: 1, raw: false, defval: '' });
    setSheet(name);
    setRows(r);
    const head = (r[0] || []).map(h => String(h ?? '').toLowerCase());
    const guess = (re: RegExp) => head.findIndex(h => re.test(h));
    setPhoneCol(guess(/mobile|portable|t[ée]l|gsm|phone|num/));
    setFirstCol(guess(/pr[ée]nom|first/));
    setLastCol(guess(/^nom|last|famille/));
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setStatus(null);
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      setWorkbook(wb);
      setFileName(f.name);
      loadSheet(wb, wb.SheetNames[0]);
    } catch {
      setStatus({ type: 'error', message: 'Fichier illisible (formats acceptés : .xlsx, .xls, .csv)' });
    }
  };

  const stats = useMemo(() => {
    if (phoneCol < 0) return { valid: 0, invalid: 0, duplicates: 0 };
    const seen = new Set<string>();
    let valid = 0, invalid = 0, duplicates = 0;
    for (const r of data) {
      const m = normalizeMobile(r[phoneCol]);
      if (!m) invalid++;
      else if (seen.has(m)) duplicates++;
      else { seen.add(m); valid++; }
    }
    return { valid, invalid, duplicates };
  }, [data, phoneCol]);

  const smsCount = message.length <= 160 ? 1 : Math.ceil(message.length / 153);
  const canSend = !sending && stats.valid > 0 && message.trim().length > 0;

  const send = async () => {
    if (!window.confirm(`Envoyer ce SMS à ${stats.valid} destinataire(s) ?\n\n« ${message.trim()} »\n\nCette action est irréversible.`)) return;
    setSending(true);
    setStatus(null);
    const contacts = data.map(r => ({
      mobile: r[phoneCol],
      firstName: firstCol >= 0 ? r[firstCol] : '',
      lastName: lastCol >= 0 ? r[lastCol] : '',
      variables: Object.fromEntries(columns.map((c, i) => [varKey(c), r[i]]).filter(([k]) => k))
    }));
    try {
      const res = await axios.post('/api/admin/frizbi/send-bulk', { message: message.trim(), title, contacts }, { headers });
      const d = res.data;
      setStatus({
        type: d.success ? 'success' : 'error',
        message: `${d.sent} SMS envoyé(s)` + (d.invalid_count ? `, ${d.invalid_count} numéro(s) invalide(s) ignoré(s)` : '') + (d.duplicates ? `, ${d.duplicates} doublon(s) ignoré(s)` : '') + (d.failed?.length ? ` — erreurs : ${d.failed.map((f: any) => `lignes ${f.from}-${f.to} (${f.error})`).join(' ; ')}` : '')
      });
    } catch (err: any) {
      setStatus({ type: 'error', message: err.response?.data?.message || 'Erreur lors de l\'envoi' });
    } finally {
      setSending(false);
    }
  };

  const colOptions = (allowNone: boolean) => (
    <>
      {allowNone && <option value={-1}>— aucune —</option>}
      {!allowNone && <option value={-1}>— choisir —</option>}
      {columns.map((c, i) => <option key={i} value={i}>{c}</option>)}
    </>
  );

  return (
    <div className="settings-card full-width" style={{ marginTop: 25 }}>
      <div className="card-header">
        <FileSpreadsheet size={20} />
        <h3>Envoi en masse depuis un fichier Excel</h3>
      </div>
      <div className="card-body">
        <p style={{ marginTop: 0, color: '#64748b', fontSize: '0.9rem' }}>
          Envoyez le même message à tous les contacts d'un fichier. Choisissez la colonne contenant le numéro de mobile ; les autres colonnes peuvent être insérées dans le message avec <code>$nom_colonne$</code>.
        </p>

        {status && (
          <div className={`status-alert ${status.type}`}>
            {status.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{status.message}</span>
            <button className="close-btn" onClick={() => setStatus(null)}>×</button>
          </div>
        )}

        <div className="form-group">
          <label style={lbl}>Fichier (.xlsx, .xls, .csv)</label>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} />
          {fileName && <small>{fileName} — {data.length} ligne(s) de données</small>}
        </div>

        {workbook && rows.length > 0 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 15, marginBottom: 20 }}>
              {workbook.SheetNames.length > 1 && (
                <div>
                  <label style={lbl}>Feuille</label>
                  <select style={sel} value={sheet} onChange={e => loadSheet(workbook, e.target.value)}>
                    {workbook.SheetNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label style={lbl}>Colonne du mobile *</label>
                <select style={sel} value={phoneCol} onChange={e => setPhoneCol(Number(e.target.value))}>{colOptions(false)}</select>
              </div>
              <div>
                <label style={lbl}>Colonne prénom</label>
                <select style={sel} value={firstCol} onChange={e => setFirstCol(Number(e.target.value))}>{colOptions(true)}</select>
              </div>
              <div>
                <label style={lbl}>Colonne nom</label>
                <select style={sel} value={lastCol} onChange={e => setLastCol(Number(e.target.value))}>{colOptions(true)}</select>
              </div>
            </div>

            {phoneCol >= 0 && (
              <div style={{ marginBottom: 20, fontSize: '0.9rem', fontWeight: 600 }}>
                <span style={{ color: '#059669' }}>{stats.valid} numéro(s) valide(s)</span>
                {stats.invalid > 0 && <span style={{ color: '#dc2626', marginLeft: 14 }}>{stats.invalid} invalide(s) (ignoré(s))</span>}
                {stats.duplicates > 0 && <span style={{ color: '#d97706', marginLeft: 14 }}>{stats.duplicates} doublon(s) (ignoré(s))</span>}
              </div>
            )}

            <div className="form-group">
              <label style={lbl}>Objet (interne, non envoyé)</label>
              <input style={sel} value={title} maxLength={100} onChange={e => setTitle(e.target.value)} />
            </div>

            <div className="form-group">
              <label style={lbl}>Message</label>
              <textarea
                style={{ ...sel, minHeight: 110, fontFamily: 'inherit' }}
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Bonjour $prenom$, ..."
              />
              <small>{message.length} caractère(s) — {smsCount} SMS par destinataire (160 car. pour 1 SMS, 153 par SMS au-delà). Les accents circonflexes sont simplifiés par l'opérateur.</small>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {columns.map((c, i) => varKey(c) && (
                  <button key={i} type="button" onClick={() => setMessage(m => `${m}$${varKey(c)}$`)}
                    style={{ padding: '3px 10px', borderRadius: 12, border: '1px solid #cbd5e1', background: 'white', fontSize: '0.75rem', cursor: 'pointer' }}>
                    ${varKey(c)}$
                  </button>
                ))}
              </div>
            </div>

            <button className="btn btn-primary" onClick={send} disabled={!canSend}>
              {sending ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
              Envoyer à {stats.valid} destinataire(s)
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default FrizbiBulkSms;
