import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { FileText, Trash2, Search, AlertTriangle } from 'lucide-react';
import VirementCreditsModal from './VirementCreditsModal';
import VirementCreditsHistory from './VirementCreditsHistory';

interface BudgetLine {
  Code: string;
  'Libellé': string;
  Sens: string;
  Section: string;
  'Article par nature': string;
  'Chapitre par nature': string;
  'Référence Fonctionnelle': string;
  "Opération d'équipement": string;
  'Service Gestionnaire': string;
  EQUIPEMENT: string;
  'Budget voté': number;
  Disponible: number;
  'Mt. prévision': number;
}
interface Picked { line: BudgetLine; montant: string; }

// Enveloppes d'investissement proposées automatiquement (opérations d'équipement)
const ENVELOPPES = ['ENV16', 'ENV28', 'ENV29'];
const clean = (v: string) => (!v || v === '-' ? '' : v);
// ENV0000016 -> ENV16
const shortOp = (v: string) => clean(v).replace(/^([A-Za-z]+)0+(\d)/, '$1$2');
const toNum = (v: string) => { const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.')); return isNaN(n) ? 0 : n; };
const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const s: Record<string, React.CSSProperties> = {
  card: { background: 'var(--card-bg, #fff)', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.25rem' },
  input: { width: '100%', padding: '0.5rem 0.7rem', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.9rem', boxSizing: 'border-box' },
  label: { display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: 4 },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.55rem 1.1rem', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer' },
  th: { textAlign: 'left', padding: '0.5rem', fontSize: '0.72rem', color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' },
  td: { padding: '0.5rem', fontSize: '0.85rem', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' },
  right: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
};

const imputation = (l: BudgetLine) =>
  [l['Chapitre par nature'], l['Référence Fonctionnelle'], l['Article par nature'], shortOp(l["Opération d'équipement"]), l['Service Gestionnaire']]
    .map(x => x || '·').join(' / ');

const Picker: React.FC<{
  title: string; sign: '+' | '-'; picked: Picked[]; setPicked: (p: Picked[]) => void; color: string;
  scoped: BudgetLine[]; taken: Set<string>; totalMin: number; totalMaj: number;
}> = ({ title, sign, picked, setPicked, color, scoped, taken, totalMin, totalMaj }) => {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const results = useMemo(() => {
    // Plusieurs mots = tous doivent être présents (« 21838 BF6 » → nature 21838 ET service BF6)
    const tokens = q.toLowerCase().split(/[\s/,;]+/).filter(Boolean);
    return scoped
      .filter(l => {
        if (taken.has(l.Code) || (sign === '-' && !(l.Disponible > 50))) return false;
        if (!tokens.length) return true;
        const hay = `${l.Code} ${l['Libellé']} ${imputation(l)} ${l["Opération d'équipement"]} ${shortOp(l["Opération d'équipement"])}`.toLowerCase();
        return tokens.every(t => hay.includes(t));
      })
      .slice(0, 60);
  }, [q, scoped, taken, sign]);
  const delta = sign === '+' ? 1 : -1;
  return (
    <div style={{ ...s.card, borderTop: `4px solid ${color}` }}>
      <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', color }}>{title}</h3>
      <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
        <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: '#94a3b8' }} />
        <input
          style={{ ...s.input, paddingLeft: 32 }}
          placeholder="Chercher une imputation (chapitre, fonction, nature, opération, service, libellé…)"
          value={q} onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        />
        {open && results.length > 0 && (
          <div style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: 42, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, maxHeight: 320, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,.12)' }}>
            {results.map(l => (
              <div key={l.Code}
                onMouseDown={e => { e.preventDefault(); setPicked([...picked, { line: l, montant: '' }]); setQ(''); }}
                style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '0.85rem' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
                onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                <strong>{imputation(l)}</strong> <span style={{ color: '#64748b' }}>— {l['Libellé']}</span>
                <span style={{ float: 'right', color: l.Disponible < 0 ? '#dc2626' : '#475569' }}>Dispo {fmt(l.Disponible)} €</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {picked.length === 0 ? (
        <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Aucune imputation sélectionnée.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={s.th}>Imputation (chap. / fonc. / nature / op. / act.)</th>
                <th style={{ ...s.th, ...s.right }}>Dispo avant</th>
                <th style={{ ...s.th, width: 170 }}>Montant {sign}</th>
                <th style={{ ...s.th, ...s.right }}>Dispo après</th>
                <th style={s.th}></th>
              </tr>
            </thead>
            <tbody>
              {picked.map((p, i) => {
                const apres = p.line.Disponible + delta * toNum(p.montant);
                return (
                  <tr key={p.line.Code}>
                    <td style={s.td}>
                      <strong>{imputation(p.line)}</strong>
                      <div style={{ color: '#64748b', fontSize: '0.75rem' }}>{p.line.Code} — {p.line['Libellé']}</div>
                    </td>
                    <td style={{ ...s.td, ...s.right, color: p.line.Disponible < 0 ? '#dc2626' : undefined }}>{fmt(p.line.Disponible)}</td>
                    <td style={s.td}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input style={{ ...s.input, textAlign: 'right' }} inputMode="decimal" value={p.montant}
                          onChange={e => setPicked(picked.map((x, j) => (j === i ? { ...x, montant: e.target.value } : x)))} />
                        <button type="button" style={{ padding: '0 0.6rem', border: `1px solid ${color}`, color, background: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.78rem' }}
                          title={sign === '-' ? 'Minorer tout le disponible' : 'Majorer du montant libéré par les minorations (ou du déficit de la ligne)'}
                          onClick={() => {
                            let v: number;
                            if (sign === '-') v = Math.max(0, p.line.Disponible);
                            else {
                              v = Math.max(0, totalMin - (totalMaj - toNum(p.montant)));
                              if (v === 0 && p.line.Disponible < 0) v = -p.line.Disponible;
                            }
                            v = Math.round(v * 100) / 100;
                            setPicked(picked.map((x, j) => (j === i ? { ...x, montant: v ? String(v) : '' } : x)));
                          }}>Tout</button>
                      </div>
                    </td>
                    <td style={{ ...s.td, ...s.right, fontWeight: 700, color: apres < 0 ? '#dc2626' : '#16a34a' }}>{fmt(apres)}</td>
                    <td style={s.td}>
                      <button title="Retirer" onClick={() => setPicked(picked.filter((_, j) => j !== i))}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626' }}><Trash2 size={16} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const VirementCreditsTab: React.FC = () => {
  const { token, user } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };

  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<'I' | 'F'>('I');
  const [sens, setSens] = useState<'D' | 'R'>('D');
  const [compense, setCompense] = useState(true);
  const [direction, setDirection] = useState('');
  const [service, setService] = useState(user?.service_code || '');
  const [contact, setContact] = useState(user?.displayName || '');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [activite, setActivite] = useState('');
  const [motivation, setMotivation] = useState('');
  const [minorer, setMinorer] = useState<Picked[]>([]);
  const [majorer, setMajorer] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [liveError, setLiveError] = useState('');
  const [mode, setMode] = useState<'new' | 'history'>('new');
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Direction, service et contact : ceux de l'agent identifié (AD / RH Studio)
  useEffect(() => {
    fetch('/api/agents/me', { headers })
      .then(r => (r.ok ? r.json() : null))
      .then(me => {
        if (!me) return;
        if (me.direction) setDirection(me.direction);
        if (me.service) setService(me.service);
        if (me.displayName) setContact(me.displayName);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Lignes et disponibles lus en direct dans SEDIT (aucun import Excel)
    fetch('/api/budget/virement-credits/lines', { headers })
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'SEDIT indisponible');
        return r.json();
      })
      .then(setLines)
      .catch((e: Error) => { setLines([]); setLiveError(e.message); })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Changer de section / sens invalide les lignes déjà choisies
  const changeScope = (sec: 'I' | 'F', sn: 'D' | 'R') => {
    if (sec !== section || sn !== sens) { setMinorer([]); setMajorer([]); }
    setSection(sec); setSens(sn);
  };

  // Périmètre DSI : services gestionnaires BF* ; en investissement, uniquement les enveloppes ENV16, ENV28 et ENV29
  const scoped = useMemo(
    () => lines.filter(l => l.Section === section && l.Sens === sens && /^BF/i.test(l['Service Gestionnaire'] || '') && !!l['Référence Fonctionnelle']
      && (section === 'F' || ENVELOPPES.includes(shortOp(l["Opération d'équipement"])))),
    [lines, section, sens]
  );

  const taken = useMemo(() => new Set([...majorer, ...minorer].map(p => p.line.Code)), [majorer, minorer]);
  const totalMaj = majorer.reduce((a, p) => a + toNum(p.montant), 0);
  const totalMin = minorer.reduce((a, p) => a + toNum(p.montant), 0);
  const ecart = Math.round((totalMaj - totalMin) * 100) / 100;
  const desequilibre = compense && ecart !== 0;
  const hasLines = majorer.length + minorer.length > 0;
  const hasNegative = minorer.some(p => p.line.Disponible - toNum(p.montant) < 0);

  const toPayloadLine = (p: Picked, delta: 1 | -1) => ({
    chapitre: p.line['Chapitre par nature'],
    fonction: p.line['Référence Fonctionnelle'],
    nature: p.line['Article par nature'],
    equipement: clean(p.line.EQUIPEMENT),
    operation: shortOp(p.line["Opération d'équipement"]),
    activite: p.line['Service Gestionnaire'],
    code: p.line.Code,
    montant: toNum(p.montant),
    avant: p.line.Disponible,
    apres: p.line.Disponible + delta * toNum(p.montant),
  });

  // Enregistre la demande (brouillon, mis à jour si déjà enregistrée) puis ouvre la prévisualisation
  const generate = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/budget/virement-credits', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentId, direction, service, contact, date, section, sens, compense, activite, motivation,
          majorer: majorer.map(p => toPayloadLine(p, 1)),
          minorer: minorer.map(p => toPayloadLine(p, -1)),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) { setCurrentId(null); throw new Error(data.message + ' — modifiez à nouveau pour créer une nouvelle demande.'); }
      if (!res.ok) throw new Error(data.message || "Erreur d'enregistrement");
      setCurrentId(data.id);
      setOpenId(data.id);
      setRefreshKey(k => k + 1);
    } catch (e: any) {
      setError(e.message || "Erreur d'enregistrement");
    } finally {
      setBusy(false);
    }
  };

  const tabBtn = (m: 'new' | 'history', label: string): React.ReactNode => (
    <button onClick={() => setMode(m)} style={{ padding: '0.5rem 1.1rem', border: 'none', borderBottom: mode === m ? '3px solid #2563eb' : '3px solid transparent', background: 'none', fontWeight: 600, cursor: 'pointer', color: mode === m ? '#2563eb' : '#64748b' }}>{label}</button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e2e8f0' }}>
        {tabBtn('new', 'Nouvelle demande')}
        {tabBtn('history', 'Historique')}
      </div>
      {mode === 'history' && <VirementCreditsHistory refreshKey={refreshKey} direction={direction} />}
      {mode === 'new' && <>
      <div style={s.card}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '1.05rem' }}>Demande de virement de crédits</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.9rem' }}>
          <div>
            <label style={s.label}>Section</label>
            <select style={s.input} value={section} onChange={e => changeScope(e.target.value as 'I' | 'F', sens)}>
              <option value="I">Investissement</option>
              <option value="F">Fonctionnement</option>
            </select>
          </div>
          <div>
            <label style={s.label}>Sens</label>
            <select style={s.input} value={sens} onChange={e => changeScope(section, e.target.value as 'D' | 'R')}>
              <option value="D">Dépenses</option>
              <option value="R">Recettes</option>
            </select>
          </div>
          <div>
            <label style={s.label}>Direction</label>
            <input style={{ ...s.input, background: '#f1f5f9' }} readOnly value={direction} />
          </div>
          <div>
            <label style={s.label}>Service</label>
            <input style={{ ...s.input, background: '#f1f5f9' }} readOnly value={service} />
          </div>
          <div>
            <label style={s.label}>Personne contact</label>
            <input style={{ ...s.input, background: '#f1f5f9' }} readOnly value={contact} />
          </div>
          <div>
            <label style={s.label}>Date de la demande</label>
            <input type="date" style={s.input} value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>
        <div style={{ margin: '0.9rem 0' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, cursor: 'pointer' }}>
            <input type="checkbox" checked={compense} onChange={e => setCompense(e.target.checked)} />
            Demande compensée (majorations = minorations)
          </label>
        </div>
        <div style={{ marginBottom: '0.9rem' }}>
          <label style={s.label}>Activité / Projet / Opération impacté (optionnel)</label>
          <input style={s.input} value={activite} onChange={e => setActivite(e.target.value)} />
        </div>
        <div>
          <label style={s.label}>Motivation de la demande (raison)</label>
          <textarea style={{ ...s.input, minHeight: 80, fontFamily: 'inherit' }} value={motivation} onChange={e => setMotivation(e.target.value)}
            placeholder="Ex. : Régularisation de lignes d'exécution négatives" />
        </div>
      </div>

      {liveError && (
        <div style={{ ...s.card, borderColor: '#dc2626', color: '#b91c1c', fontSize: '0.85rem' }}>
          <AlertTriangle size={15} style={{ verticalAlign: 'text-bottom' }} /> Impossible de lire les lignes dans SEDIT : {liveError}
        </div>
      )}
      {loading ? (
        <div style={s.card}>Chargement des lignes d'exécution…</div>
      ) : (
        <>
          <Picker scoped={scoped} taken={taken} totalMin={totalMin} totalMaj={totalMaj} title="Imputations à minorer (−)" sign="-" picked={minorer} setPicked={setMinorer} color="#dc2626" />
          <Picker scoped={scoped} taken={taken} totalMin={totalMin} totalMaj={totalMaj} title="Imputations à majorer (+)" sign="+" picked={majorer} setPicked={setMajorer} color="#16a34a" />
        </>
      )}

      <div style={{ ...s.card, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1.5rem' }}>
        <div>Total à minorer : <strong>{fmt(totalMin)} €</strong></div>
        <div>Total à majorer : <strong>{fmt(totalMaj)} €</strong></div>
        <div style={{ color: desequilibre ? '#dc2626' : '#16a34a' }}>Écart : <strong>{fmt(ecart)} €</strong></div>
        {desequilibre && (
          <span style={{ color: '#dc2626', display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '0.85rem' }}>
            <AlertTriangle size={15} /> Demande compensée : les totaux doivent être égaux.
          </span>
        )}
        {hasNegative && (
          <span style={{ color: '#d97706', display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '0.85rem' }}>
            <AlertTriangle size={15} /> Une ligne minorée passerait en disponible négatif.
          </span>
        )}
        <div style={{ marginLeft: 'auto' }}>
          <button style={{ ...s.btn, opacity: busy || !hasLines || desequilibre ? 0.5 : 1 }}
            disabled={busy || !hasLines || desequilibre} onClick={generate}>
            <FileText size={16} /> {busy ? 'Génération…' : 'Prévisualiser'}
          </button>
        </div>
        {error && <div style={{ width: '100%', color: '#dc2626' }}>{error}</div>}
      </div>

      </>}

      {openId != null && (
        <VirementCreditsModal id={openId} direction={direction} onClose={() => { setOpenId(null); setRefreshKey(k => k + 1); }} onChanged={() => setRefreshKey(k => k + 1)} />
      )}
    </div>
  );
};

export default VirementCreditsTab;
