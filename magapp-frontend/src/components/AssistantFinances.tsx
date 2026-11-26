import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Send, Mic, Square, Loader2, Copy, Check, Paperclip, Download, Sparkles, Trash2, ShieldCheck, FileSpreadsheet, FileText, ExternalLink, LineChart as LineIcon, BarChart3, PieChart as PieIcon, HelpCircle, GraduationCap } from 'lucide-react';
import ModuleVersion from '../ep/ModuleVersion';
import FinanceChart from './AssistantFinancesChart';
import AssistantFinancesHelp from './AssistantFinancesHelp';
import AssistantFinancesRules from './AssistantFinancesRules';
import AssistantFinancesFilters from './AssistantFinancesFilters';
import { loadFiltres, saveFiltres, type Filtres, type FilterOptions } from './assistantFinancesFiltersData';
import { chartAsked, chartModel, multicolorAsked, type ChartKind } from './assistantFinancesChartData';

// Assistant finances : questions en français (clavier ou voix) → tableaux lus dans Sedit, dans le périmètre de
// l'agent (mêmes droits que « Mes factures », contrôlés par le serveur). IA et dictée hébergées par la Ville.

type ColType = 'text' | 'date' | 'money' | 'int' | 'pct';
type Cell = string | number | null;
interface Pj { type: string; id: string; nom: string }
interface Tableau { titre: string; perimetre: string; colonnes: { label: string; type: ColType }[]; lignes: Cell[][]; total: Cell[] | null; notes: string[]; pj?: (Pj | null)[]; sedit?: (string | null)[]; pagination?: { page: number; taille: number; lignes: number }; requete?: unknown }
interface Answer { message: string | null; tableaux: Tableau[]; requetes: unknown[]; model: string | null; general?: boolean }
interface Turn { id: number; question: string; answer?: Answer; error?: string }
interface Access { allowed: boolean; own: boolean; nb_services: number; budgets: string[]; shared_by: string[] }
interface Doc { doc_id: string; nom: string; mime: string; categorie: string; url: string }

const API = '/api/assistant-finances';
const authHeaders = (): Record<string, string> => ({ Authorization: `Bearer ${localStorage.getItem('token') || ''}` });

const EXAMPLES = [
  'Évolution du budget de fonctionnement de la DSI depuis 2023, en courbe',
  'Histogramme du mandaté par chapitre l’an dernier',
  'Disponible en investissement par service, en camembert',
  'Les 10 plus gros fournisseurs l’an dernier, en histogramme',
  'Liste des engagements en cours de plus de 20 000 €',
  'Factures sans service fait',
  'Les dernières commandes UGAP',
];

const isNumber = (t: ColType) => t === 'money' || t === 'int' || t === 'pct';
const frDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : v);

function display(v: Cell, type: ColType): string {
  if (v === null || v === undefined || v === '') return type === 'pct' ? '—' : '';
  if (typeof v !== 'number') return type === 'date' ? frDate(String(v)) : String(v);
  if (type === 'money') return v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  if (type === 'pct') return `${v > 0 ? '+' : ''}${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
  return v.toLocaleString('fr-FR');
}

// Valeur collée dans Excel : nombres sans symbole ni séparateur de milliers, virgule décimale
function raw(v: Cell, type: ColType): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') {
    if (type === 'money') return v.toFixed(2).replace('.', ',');
    if (type === 'pct') return `${String(v).replace('.', ',')} %`;
    return String(v).replace('.', ',');
  }
  const s = (type === 'date' ? frDate(String(v)) : String(v)).replace(/[\t\r\n]+/g, ' ');
  // Un libellé commençant par « = + - @ » serait pris pour une formule par le tableur
  return /^[=+\-@]/.test(s) ? `'${s}` : s;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const PAGE = 50;

// Fichier Excel ou Word complet, produit par le serveur : le navigateur l'ouvre dans l'application
async function exportFile(t: Tableau, format: 'excel' | 'word'): Promise<void> {
  const r = await fetch(`${API}/export`, { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ requete: t.requete, format }) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || (r.status === 404 ? 'Export impossible : le serveur n’a pas la dernière version, il doit être redémarré.' : `Export impossible (erreur ${r.status}).`));
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = r.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || `finances.${format === 'excel' ? 'xlsx' : 'docx'}`;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Copie d'un tableau. « excel » : nombres bruts (calculables), codes et libellés forcés en texte (« 011 » reste « 011 »).
// « word » : tableau mis en forme pour Word ou Outlook. L'événement « copy » fonctionne aussi hors HTTPS.
function copyTable(t: Tableau, target: 'excel' | 'word'): boolean {
  const excel = target === 'excel';
  const format = (type: ColType) => (type === 'money' ? 'mso-number-format:\'\\#\\,\\#\\#0\\.00\';' : type === 'text' ? 'mso-number-format:\'\\@\';' : '');
  const value = (v: Cell, type: ColType) => {
    if (!excel) return display(v, type);
    // « raw » protège le texte brut d'une formule ; dans une cellule HTML au format texte, l'apostrophe est inutile
    return typeof v === 'number' || type === 'date' ? raw(v, type) : String(v ?? '');
  };
  const rows = [t.colonnes.map(c => c.label), ...t.lignes.map(l => l.map((v, i) => raw(v, t.colonnes[i].type)))];
  if (t.total) rows.push(t.total.map((v, i) => raw(v, t.colonnes[i].type)));
  const text = rows.map(r => r.join('\t')).join('\r\n');
  const td = 'border:1px solid #999;padding:3px 8px;';
  const body = [...t.lignes, ...(t.total ? [t.total] : [])]
    .map((l, k) => `<tr${t.total && k === t.lignes.length ? ' style="font-weight:bold"' : ''}>${l.map((v, i) => {
      const type = t.colonnes[i].type;
      return `<td style='${td}${isNumber(type) ? 'text-align:right;' : ''}${excel ? format(type).replace(/'/g, '"') : ''}'>${esc(value(v, type))}</td>`;
    }).join('')}</tr>`).join('');
  const html = `${excel ? '' : `<p><b>${esc(t.titre)}</b></p>`}<table style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt"><thead><tr>${t.colonnes.map(c => `<th style="${td}background:#e2e8f0">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
  let ok = false;
  const onCopy = (e: ClipboardEvent) => {
    e.preventDefault();
    e.clipboardData?.setData('text/plain', text);
    e.clipboardData?.setData('text/html', html);
    ok = true;
  };
  document.addEventListener('copy', onCopy);
  // execCommand n'émet « copy » que s'il y a une sélection
  const area = document.createElement('textarea');
  area.value = ' ';
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  try { document.execCommand('copy'); } finally {
    document.removeEventListener('copy', onCopy);
    area.remove();
  }
  return ok;
}

const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' };

const DocViewer: React.FC<{ pj: Pj; onClose: () => void }> = ({ pj, onClose }) => {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [current, setCurrent] = useState<Doc | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API}/pj/${pj.type}/${encodeURIComponent(pj.id)}`, { headers: authHeaders() })
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.message || 'Erreur'); setDocs(d.documents); setCurrent(d.documents[0] || null); })
      .catch(e => { setDocs([]); setError(e.message); });
  }, [pj]);

  useEffect(() => {
    if (!current) return;
    let object = '';
    let cancelled = false;
    fetch(current.url, { headers: authHeaders() })
      .then(async r => {
        if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.message || d.error || 'Fichier indisponible'); }
        const blob = await r.blob();
        if (cancelled) return;
        // XML et autres formats : affichés en texte brut, jamais interprétés
        const safe = /pdf|^image\/(png|jpe?g|gif|webp)/.test(current.mime) ? new Blob([blob], { type: current.mime }) : new Blob([blob], { type: 'text/plain;charset=utf-8' });
        object = URL.createObjectURL(safe);
        setUrl(object);
      })
      .catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; if (object) URL.revokeObjectURL(object); };
  }, [current]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', zIndex: 2400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: 'min(1000px, 100%)', height: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
          <Paperclip size={16} color="#7c3aed" />
          <strong style={{ fontSize: 14, color: '#0f172a' }}>Pièces jointes — {pj.nom}</strong>
          <div style={{ flex: 1 }} />
          {url && current && <a href={url} download={current.nom} style={{ ...btn, textDecoration: 'none' }}><Download size={14} /> Télécharger</a>}
          <button type="button" style={btn} onClick={onClose} aria-label="Fermer"><X size={14} /></button>
        </div>
        {docs && docs.length > 1 && (
          <div style={{ display: 'flex', gap: 6, padding: '8px 14px', overflowX: 'auto', borderBottom: '1px solid #f1f5f9' }}>
            {docs.map(d => <button type="button" key={d.doc_id} onClick={() => { if (d.doc_id !== current?.doc_id) { setUrl(''); setError(''); setCurrent(d); } }} title={d.nom} style={{ ...btn, whiteSpace: 'nowrap', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', background: current?.doc_id === d.doc_id ? '#ede9fe' : '#fff' }}>{d.nom}</button>)}
          </div>
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
          {error && <div style={{ padding: 24, color: '#b91c1c', fontSize: 14 }}>{error}</div>}
          {!error && docs && !docs.length && <div style={{ padding: 24, color: '#64748b' }}>Aucune pièce jointe.</div>}
          {!error && (!docs || (current && !url)) && <div style={{ padding: 24, color: '#64748b', display: 'flex', gap: 8 }}><Loader2 size={18} /> Chargement…</div>}
          {!error && url && <iframe title="Pièce jointe" src={url} style={{ flex: 1, border: 'none' }} />}
        </div>
      </div>
    </div>
  );
};

const CHARTS: [ChartKind, string, typeof LineIcon][] = [['courbe', 'Courbe', LineIcon], ['histogramme', 'Histogramme', BarChart3], ['camembert', 'Camembert', PieIcon]];

const ResultTable: React.FC<{ t: Tableau; asked?: ChartKind | 'auto' | null; multicolor?: boolean; onPj: (pj: Pj) => void }> = ({ t: first, asked, multicolor, onPj }) => {
  // Listes : une page lue à la demande ; synthèses : toutes les lignes sont là, découpées à l'affichage
  const [loaded, setLoaded] = useState<Tableau | null>(null);
  const [localPage, setLocalPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<'excel' | 'word' | null>(null);
  const [problem, setProblem] = useState('');
  const t = loaded || first;
  const server = t.pagination;
  const count = server ? server.lignes : t.lignes.length;
  const pages = Math.max(1, Math.ceil(count / PAGE));
  const page = server ? server.page : Math.min(localPage, pages - 1);
  const from = server ? 0 : page * PAGE;
  const rows = server ? t.lignes : t.lignes.slice(from, from + PAGE);
  const goTo = async (target: number) => {
    if (!server) { setLocalPage(target); return; }
    setLoading(true); setProblem('');
    try {
      const r = await fetch(`${API}/page`, { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ requete: t.requete, page: target }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || 'Page indisponible.');
      setLoaded({ ...d, notes: first.notes });
    } catch (e) { setProblem(e instanceof Error ? e.message : 'Page indisponible.'); } finally { setLoading(false); }
  };
  const doExport = async (format: 'excel' | 'word') => {
    setExporting(format); setProblem('');
    try { await exportFile(t, format); } catch (e) { setProblem(e instanceof Error ? e.message : 'Export impossible.'); } finally { setExporting(null); }
  };
  const model = chartModel(t);
  // « graphique » sans précision : courbe pour une série dans le temps, histogramme sinon
  const [kind, setKind] = useState<ChartKind | null>(() => {
    if (!asked || !model) return null;
    if (asked !== 'auto') return asked;
    return /^(Exercice|Année|Mois)/.test(t.colonnes[0]?.label || '') ? 'courbe' : 'histogramme';
  });
  const [copied, setCopied] = useState<boolean | null>(null);
  // Colonne d'actions : pièces jointes et ouverture de la fiche dans Sedit
  const hasPj = !!t.pj?.some(Boolean) || !!t.sedit?.some(Boolean);
  const copy = () => { setCopied(copyTable({ ...t, lignes: rows }, 'excel')); window.setTimeout(() => setCopied(null), 2200); };
  const th: React.CSSProperties = { padding: '7px 9px', fontSize: 11.5, color: '#475569', background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', position: 'sticky', top: 0, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '6px 9px', fontSize: 13, color: '#1e293b', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' };
  const align = (type: ColType): React.CSSProperties => ({ textAlign: isNumber(type) ? 'right' : 'left', whiteSpace: isNumber(type) || type === 'date' ? 'nowrap' : 'normal' });
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff', overflow: 'hidden', marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 13.5, color: '#0f172a' }}>{t.titre}</div>
          {t.perimetre && <div style={{ fontSize: 11.5, color: '#64748b' }}>{t.perimetre}</div>}
        </div>
        {model && (
          <div role="group" aria-label="Graphique" style={{ display: 'flex', gap: 4 }}>
            {CHARTS.map(([key, label, Icon]) => (
              <button type="button" key={key} onClick={() => setKind(kind === key ? null : key)} aria-pressed={kind === key} title={kind === key ? 'Masquer le graphique' : label} aria-label={label}
                style={{ ...btn, padding: '6px 8px', background: kind === key ? '#ede9fe' : '#fff', borderColor: kind === key ? '#a78bfa' : '#cbd5e1' }}>
                <Icon size={14} />
              </button>
            ))}
          </div>
        )}
        {t.lignes.length > 0 && (
          <div style={{ display: 'flex', gap: 4 }}>
            {([['excel', 'Excel', FileSpreadsheet], ['word', 'Word', FileText]] as const).map(([format, label, Icon]) => (
              <button type="button" key={format} style={btn} disabled={!!exporting} onClick={() => doExport(format)} title={`Toutes les lignes dans un fichier ${label}`}>
                {exporting === format ? <Loader2 size={14} style={{ animation: 'af-spin 1s linear infinite' }} /> : <Icon size={14} />} {label}
              </button>
            ))}
            <button type="button" style={{ ...btn, padding: '6px 8px' }} onClick={copy} title="Copier les lignes affichées" aria-label="Copier les lignes affichées">
              {copied === null ? <Copy size={14} /> : copied ? <Check size={14} color="#16a34a" /> : <X size={14} color="#b91c1c" />}
            </button>
          </div>
        )}
      </div>
      {kind && <FinanceChart data={t} kind={kind} multicolor={multicolor} />}
      {t.lignes.length > 0 && (
        <div style={{ overflow: 'auto', maxHeight: 420 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr>{t.colonnes.map((c, i) => <th key={i} style={{ ...th, ...align(c.type) }}>{c.label}</th>)}{hasPj && <th style={th}>Actions</th>}</tr></thead>
            <tbody>
              {rows.map((l, r) => (
                <tr key={r}>
                  {l.map((v, i) => <td key={i} style={{ ...td, ...align(t.colonnes[i].type) }}>{display(v, t.colonnes[i].type)}</td>)}
                  {hasPj && (
                    <td style={{ ...td, textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {t.sedit?.[from + r] && <a href={t.sedit[from + r]!} target="_blank" rel="noopener noreferrer" title="Ouvrir dans Sedit" aria-label="Ouvrir dans Sedit" style={{ ...btn, padding: '3px 7px', marginRight: 4, color: '#2563eb', textDecoration: 'none' }}><ExternalLink size={13} /> Sedit</a>}
                      {t.pj?.[from + r] && <button type="button" onClick={() => onPj(t.pj![from + r]!)} title="Voir les pièces jointes" aria-label="Voir les pièces jointes" style={{ ...btn, padding: '3px 7px' }}><Paperclip size={13} /></button>}
                    </td>
                  )}
                </tr>
              ))}
              {t.total && (
                <tr style={{ background: '#f8fafc', fontWeight: 800 }}>
                  {t.total.map((v, i) => <td key={i} style={{ ...td, ...align(t.colonnes[i].type), fontWeight: 800 }}>{v === null ? '' : display(v, t.colonnes[i].type)}</td>)}
                  {hasPj && <td style={td} />}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderTop: '1px solid #e2e8f0', fontSize: 12.5, color: '#475569', flexWrap: 'wrap' }}>
          <span style={{ flex: 1 }}>Lignes {(page * PAGE + 1).toLocaleString('fr-FR')} à {Math.min(count, (page + 1) * PAGE).toLocaleString('fr-FR')} sur {count.toLocaleString('fr-FR')}</span>
          {loading && <Loader2 size={14} style={{ animation: 'af-spin 1s linear infinite' }} />}
          {([[0, '«', 'Première page'], [page - 1, '‹ Précédente', 'Page précédente'], [page + 1, 'Suivante ›', 'Page suivante'], [pages - 1, '»', 'Dernière page']] as const).map(([target, label, help], i) => (
            <button type="button" key={help} style={{ ...btn, padding: '3px 9px', opacity: (i < 2 ? page === 0 : page === pages - 1) ? 0.4 : 1 }} disabled={loading || (i < 2 ? page === 0 : page === pages - 1)} onClick={() => goTo(target)} title={help} aria-label={help}>{label}</button>
          ))}
          <span>page {page + 1} / {pages}</span>
        </div>
      )}
      {problem && <div role="alert" style={{ padding: '6px 12px', color: '#b91c1c', fontSize: 12.5 }}>{problem}</div>}
      {t.notes.length > 0 && (
        <div style={{ padding: '7px 12px', background: '#fffbeb', borderTop: '1px solid #fde68a', fontSize: 11.5, color: '#92400e' }}>
          {t.notes.map((n, i) => <div key={i}>{n}</div>)}
        </div>
      )}
    </div>
  );
};

// Dictée : enregistrement dans le navigateur, transcription par le serveur de la Ville (jamais la reconnaissance
// vocale du navigateur, qui envoie le son à un service extérieur).
function useDictation(onText: (text: string) => void, onError: (message: string) => void) {
  const [state, setState] = useState<'idle' | 'recording' | 'sending'>('idle');
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const discard = useRef(false);

  const stop = useCallback(() => {
    window.clearTimeout(timer.current);
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }, []);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onError('Le micro n’est pas accessible depuis cette adresse (une connexion HTTPS est nécessaire) ou ce navigateur ne le permet pas.');
      return;
    }
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch {
      onError('Accès au micro refusé ou aucun micro détecté.');
      return;
    }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream);
    recorder.current = rec;
    discard.current = false;
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      if (discard.current) return;
      setState('sending');
      try {
        const form = new FormData();
        form.append('audio', new Blob(chunks, { type: rec.mimeType }), 'question');
        const r = await fetch(`${API}/transcribe`, { method: 'POST', headers: authHeaders(), body: form });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.message || 'La transcription a échoué.');
        if (!d.text) throw new Error('Je n’ai rien entendu. Réessayez en parlant près du micro.');
        onText(d.text);
      } catch (e) {
        onError(e instanceof Error ? e.message : 'La transcription a échoué.');
      } finally { setState('idle'); }
    };
    rec.start();
    setState('recording');
    timer.current = window.setTimeout(stop, 60000); // une question tient en moins d'une minute
  };

  // Fermeture de l'assistant pendant un enregistrement : micro coupé, rien n'est envoyé
  useEffect(() => () => { discard.current = true; stop(); }, [stop]);

  return { state, start, stop };
}

const AssistantFinances: React.FC<{ beta?: boolean; onClose: () => void }> = ({ beta, onClose }) => {
  const [access, setAccess] = useState<Access | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [micError, setMicError] = useState('');
  const [pj, setPj] = useState<Pj | null>(null);
  const [help, setHelp] = useState(false);
  const [teach, setTeach] = useState(false);
  const [filtres, setFiltres] = useState<Filtres>(loadFiltres);
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const changeFiltres = (f: Filtres) => { setFiltres(f); saveFiltres(f); };
  const end = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  const dictation = useDictation(
    text => { setMicError(''); setInput(prev => (prev ? `${prev} ${text}` : text)); field.current?.focus(); },
    setMicError,
  );

  useEffect(() => { fetch(`${API}/access`, { headers: authHeaders() }).then(r => (r.ok ? r.json() : null)).then(setAccess).catch(() => setAccess(null)); }, []);
  useEffect(() => { fetch(`${API}/filtres`, { headers: authHeaders() }).then(r => (r.ok ? r.json() : null)).then(setOptions).catch(() => setOptions(null)); }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [turns]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (q.length < 3 || busy) return;
    const id = Date.now();
    const last = [...turns].reverse().find(t => t.answer?.requetes?.length);
    setHelp(false);
    setTeach(false);
    setTurns(prev => [...prev, { id, question: q }]);
    setInput(''); setMicError(''); setBusy(true);
    try {
      const r = await fetch(`${API}/ask`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, filtres, historique: turns.slice(-4).map(x => ({ question: x.question, titres: x.answer?.tableaux.map(tab => `${tab.titre} (${tab.pagination?.lignes ?? tab.lignes.length} ligne(s))`) || [] })), previous: last ? { question: last.question, requetes: toRaw(last.answer!.requetes) } : null }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || 'Le service ne répond pas.');
      setTurns(prev => prev.map(t => (t.id === id ? { ...t, answer: d } : t)));
    } catch (e) {
      setTurns(prev => prev.map(t => (t.id === id ? { ...t, error: e instanceof Error ? e.message : 'Erreur' } : t)));
    } finally { setBusy(false); }
  };

  const recording = dictation.state === 'recording';
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', backdropFilter: 'blur(4px)', zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div style={{ background: '#f8fafc', borderRadius: 18, width: 'min(1100px, 100%)', height: '94vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 60px rgba(15,23,42,.45)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', background: '#fff', borderBottom: '1px solid #e2e8f0' }}>
          <Sparkles size={22} color="#7c3aed" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 17, color: '#0f172a' }}>
              Assistant finances
              {beta && <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 800, color: '#7c2d12', background: '#ffedd5', borderRadius: 999, padding: '2px 8px' }}>BETA</span>}
              <ModuleVersion url={`${API}/version`} title="Assistant finances" />
            </div>
            <div style={{ fontSize: 11.5, color: '#64748b', display: 'flex', alignItems: 'center', gap: 5 }}>
              <ShieldCheck size={12} color="#16a34a" /> IA hébergée par la Ville
              {access && ` · ${access.own ? `${access.nb_services} service${access.nb_services > 1 ? 's' : ''} selon vos droits Sedit` : 'factures partagées uniquement'}`}
              {access && access.shared_by.length > 0 && access.own && ` · factures partagées par ${access.shared_by.join(', ')}`}
            </div>
          </div>
          <button type="button" style={{ ...btn, background: teach ? '#ede9fe' : '#fff', borderColor: teach ? '#a78bfa' : '#cbd5e1' }} onClick={() => { setTeach(v => !v); setHelp(false); }} aria-pressed={teach} title="Donner à l’IA une consigne qu’elle reprendra ensuite"><GraduationCap size={15} /> Éduquer l’IA</button>
          <button type="button" style={{ ...btn, background: help ? '#ede9fe' : '#fff', borderColor: help ? '#a78bfa' : '#cbd5e1' }} onClick={() => { setHelp(h => !h); setTeach(false); }} aria-pressed={help} title={help ? 'Revenir à la discussion' : 'Aide'}><HelpCircle size={15} /> Aide</button>
          {turns.length > 0 && <button type="button" style={btn} onClick={() => setTurns([])} disabled={busy}><Trash2 size={14} /> Nouvelle discussion</button>}
          <button type="button" style={btn} onClick={onClose} aria-label="Fermer"><X size={16} /></button>
        </div>

        {options && <AssistantFinancesFilters options={options} value={filtres} onChange={changeFiltres} />}
        {!options && Object.keys(filtres).length > 0 && (
          // Listes indisponibles : les filtres restent actifs, on doit pouvoir les lever
          <div style={{ padding: '8px 18px', background: '#f5f3ff', fontSize: 12.5 }}>Des filtres permanents sont actifs. <button type="button" style={btn} onClick={() => changeFiltres({})}>Réinitialiser</button></div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
          {help && <AssistantFinancesHelp onAsk={ask} />}
          {teach && <AssistantFinancesRules lastQuestion={turns[turns.length - 1]?.question} />}
          {/* La discussion reste montée sous l'aide : les graphiques choisis ne sont pas perdus */}
          <div style={{ display: help || teach ? 'none' : 'block' }}>
          {!turns.length && (
            <div style={{ maxWidth: 720, margin: '24px auto', textAlign: 'center', color: '#475569' }}>
              <FileSpreadsheet size={38} color="#7c3aed" />
              <h2 style={{ fontSize: 18, color: '#0f172a', margin: '10px 0 4px' }}>Que voulez-vous savoir sur les finances ?</h2>
              <p style={{ fontSize: 13.5, margin: '0 0 18px' }}>
                Budget, engagements, commandes, factures, mandats et titres de Sedit, dans la limite de vos droits.
                Les chiffres sont lus dans Sedit au moment de la question ; vérifiez le titre du tableau, il décrit exactement ce qui a été cherché.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                {EXAMPLES.map(e => <button type="button" key={e} style={{ ...btn, fontWeight: 500 }} onClick={() => ask(e)}>{e}</button>)}
              </div>
            </div>
          )}
          {turns.map(t => (
            <div key={t.id} style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ background: '#7c3aed', color: '#fff', borderRadius: '14px 14px 2px 14px', padding: '9px 14px', fontSize: 14, maxWidth: '80%', whiteSpace: 'pre-wrap' }}>{t.question}</div>
              </div>
              {!t.answer && !t.error && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: 13, marginTop: 10 }}><Loader2 size={16} style={{ animation: 'af-spin 1s linear infinite' }} /> Recherche dans Sedit…</div>}
              {t.error && <div style={{ marginTop: 10, padding: '9px 13px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13.5 }}>{t.error}</div>}
              {t.answer?.message && (
                <div style={{ marginTop: 10, padding: '9px 13px', borderRadius: 10, background: '#fff', border: '1px solid #e2e8f0', color: '#334155', fontSize: 13.5, whiteSpace: 'pre-wrap', maxWidth: '85%' }}>
                  {t.answer.general && <div style={{ fontSize: 11, fontWeight: 800, color: '#7c3aed', marginBottom: 4 }}>Réponse générale de l’IA locale — à vérifier, aucun chiffre n’est lu dans Sedit</div>}
                  {t.answer.message}
                </div>
              )}
              {t.answer?.tableaux.map((tab, i) => <ResultTable key={i} t={tab} asked={chartAsked(t.question) || (multicolorAsked(t.question) ? 'histogramme' : null)} multicolor={multicolorAsked(t.question)} onPj={setPj} />)}
            </div>
          ))}
          <div ref={end} />
          </div>
        </div>

        <div style={{ padding: '10px 18px 14px', background: '#fff', borderTop: '1px solid #e2e8f0' }}>
          {micError && <div role="alert" style={{ color: '#b91c1c', fontSize: 12.5, marginBottom: 6 }}>{micError}</div>}
          {recording && <div style={{ color: '#dc2626', fontSize: 12.5, marginBottom: 6, fontWeight: 600 }}>● Je vous écoute… cliquez sur le carré quand vous avez fini.</div>}
          {dictation.state === 'sending' && <div style={{ color: '#64748b', fontSize: 12.5, marginBottom: 6 }}>Transcription en cours…</div>}
          <form onSubmit={e => { e.preventDefault(); ask(input); }} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              ref={field} value={input} rows={2} maxLength={600}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input); } }}
              placeholder="Ex. : évolution du budget de fonctionnement de la DSI depuis 2023"
              aria-label="Votre question"
              style={{ flex: 1, resize: 'none', padding: '9px 12px', border: '1.5px solid #cbd5e1', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', color: '#1e293b', background: '#fff' }}
            />
            <button
              type="button"
              onClick={recording ? dictation.stop : dictation.start}
              disabled={dictation.state === 'sending'}
              title={recording ? 'Arrêter l’enregistrement' : 'Dicter la question (micro)'}
              aria-label={recording ? 'Arrêter l’enregistrement' : 'Dicter la question'}
              style={{ ...btn, height: 44, width: 44, justifyContent: 'center', padding: 0, background: recording ? '#dc2626' : '#fff', color: recording ? '#fff' : '#334155' }}
            >
              {dictation.state === 'sending' ? <Loader2 size={18} style={{ animation: 'af-spin 1s linear infinite' }} /> : recording ? <Square size={16} /> : <Mic size={18} />}
            </button>
            <button type="submit" disabled={busy || input.trim().length < 3} style={{ ...btn, height: 44, background: '#7c3aed', borderColor: '#7c3aed', color: '#fff', opacity: busy || input.trim().length < 3 ? 0.5 : 1 }}>
              <Send size={16} /> Envoyer
            </button>
          </form>
        </div>
      </div>
      <style>{'@keyframes af-spin { to { transform: rotate(360deg) } }'}</style>
      {pj && <DocViewer pj={pj} onClose={() => setPj(null)} />}
    </div>
  );
};

// La demande précédente est renvoyée au format attendu par le serveur (qui la revalide entièrement)
function toRaw(requetes: unknown[]): unknown[] {
  return requetes.map(q => {
    const query = q as Record<string, unknown> & { regrouper?: string[] };
    return { ...query, regrouper_par: query.regrouper };
  });
}

export default AssistantFinances;
