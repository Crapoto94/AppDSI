import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Loader2, X } from 'lucide-react';
import { useAuth } from './useAuth';
import type { Campaign } from './types';
import { COLORS, Th, Td, btnGhost, card, input } from './ui';

interface Row { id: number; agent_nom: string; agent_prenom: string; direction: string; service: string; evaluator_nom: string; date_entretien: string | null; statut: string }

const SCALE = ['#ebedf0', '#c6dbf7', '#8fbcf0', '#4a90e2', '#1e4fa3'];
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const CELL = 13;
const GAP = 3;
const p2 = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const monday = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));
const long = (s: string) => parse(s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** Calendrier des entretiens programmés, « à la GitHub » : une case par jour, d'autant plus foncée qu'il y a d'entretiens. */
export default function CalendrierEp() {
  const { token } = useAuth();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState(0);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [dir, setDir] = useState('');
  const [day, setDay] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get('/api/entretiens/campaigns', { headers }).then(r => {
      const list: Campaign[] = Array.isArray(r.data) ? r.data : [];
      setCampaigns(list);
      setCampaignId((list.find(c => c.statut === 'ouverte') || list[0])?.id || 0);
      if (!list.length) setRows([]);
    }).catch(() => { setError('Chargement impossible.'); setRows([]); });
  }, [headers]);
  useEffect(() => {
    if (!campaignId) return;
    setRows(null); setDay(''); setError('');
    axios.get(`/api/entretiens/returns/summary?campaign_id=${campaignId}`, { headers })
      .then(r => setRows(r.data?.rows || []))
      .catch(e => { setError(e?.response?.data?.message || 'Chargement impossible.'); setRows([]); });
  }, [campaignId, headers]);

  const directions = useMemo(() => [...new Set((rows || []).map(r => r.direction).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')), [rows]);
  const byDay = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows || []) {
      const d = String(r.date_entretien || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || (dir && r.direction !== dir)) continue;
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(r);
    }
    return m;
  }, [rows, dir]);

  // Du mois du premier entretien (ou du mois en cours) jusqu’à la fin du mois de mai suivant
  const { weeks, fin } = useMemo(() => {
    const dates = [...byDay.keys()].sort();
    const today = new Date();
    const first = dates.length && parse(dates[0]) < today ? parse(dates[0]) : today;
    const start = monday(new Date(first.getFullYear(), first.getMonth(), 1));
    const end = new Date(first.getFullYear() + (first.getMonth() > 4 ? 1 : 0), 4, 31);
    const out: string[][] = [];
    for (let w = start; w <= end; w = addDays(w, 7)) out.push(Array.from({ length: 7 }, (_, i) => iso(addDays(w, i))));
    return { weeks: out, fin: iso(end) };
  }, [byDay]);
  const apres = [...byDay.entries()].filter(([d]) => d > fin).reduce((s, [, l]) => s + l.length, 0);
  const max = Math.max(1, ...[...byDay.values()].map(l => l.length));
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((n / max) * 4))));
  const total = [...byDay.values()].reduce((s, l) => s + l.length, 0);
  const today = iso(new Date());
  const list = day ? [...(byDay.get(day) || [])].sort((a, b) => String(a.date_entretien).localeCompare(String(b.date_entretien))) : [];

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <select style={{ ...input, width: 'auto' }} aria-label="Campagne" value={campaignId} onChange={e => setCampaignId(Number(e.target.value))}>
          {campaigns.map(c => <option key={c.id} value={c.id}>{c.libelle || `Campagne ${c.annee}`}</option>)}
        </select>
        <select style={{ ...input, width: 'auto' }} aria-label="Direction" value={dir} onChange={e => { setDir(e.target.value); setDay(''); }}>
          <option value="">Toutes les directions</option>
          {directions.map(d => <option key={d}>{d}</option>)}
        </select>
        {rows && <span style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.muted }}>{total} entretien{total > 1 ? 's' : ''} programmé{total > 1 ? 's' : ''} sur {byDay.size} jour{byDay.size > 1 ? 's' : ''}</span>}
      </div>
      {error && <div style={{ color: COLORS.danger, fontSize: 12.5, marginBottom: 8 }}>{error}</div>}
      {!rows ? <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}><Loader2 size={22} className="spin" /></div> : (
        <div style={{ ...card, padding: 16 }}>
          <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
            <div style={{ display: 'inline-flex', gap: GAP }}>
              <div style={{ display: 'grid', gridTemplateRows: `16px repeat(7, ${CELL}px)`, gap: GAP, marginRight: 4, fontSize: 10.5, color: COLORS.muted }}>
                {['', 'Lun', '', 'Mer', '', 'Ven', '', ''].map((l, i) => <span key={i} style={{ lineHeight: `${CELL}px` }}>{l}</span>)}
              </div>
              {weeks.map((w, i) => {
                // libellé du mois sur la semaine qui contient son 1er jour
                const premier = w.find(d => d.endsWith('-01'));
                return (
                  <div key={w[0]} style={{ display: 'grid', gridTemplateRows: `16px repeat(7, ${CELL}px)`, gap: GAP, width: CELL }}>
                    <span style={{ fontSize: 10.5, color: COLORS.muted, whiteSpace: 'nowrap' }}>
                      {premier ? `${MOIS[Number(premier.slice(5, 7)) - 1]}${premier.slice(5, 7) === '01' || i === 0 ? ` ${premier.slice(2, 4)}` : ''}` : ''}
                    </span>
                    {w.map(d => {
                      if (d > fin) return <span key={d} />;
                      const n = byDay.get(d)?.length || 0;
                      const text = `${long(d)} : ${n ? `${n} entretien${n > 1 ? 's' : ''}` : 'aucun entretien'}`;
                      return <button key={d} type="button" title={text} aria-label={text} data-jour={d} disabled={!n} onClick={() => setDay(day === d ? '' : d)}
                        style={{ width: CELL, height: CELL, padding: 0, borderRadius: 3, background: SCALE[level(n)], cursor: n ? 'pointer' : 'default',
                          border: d === day ? '2px solid #0f172a' : d === today ? '2px solid #f59e0b' : '1px solid rgba(15,23,42,.06)' }} />;
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          {apres > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: '#b45309', marginTop: 6 }}>{apres} entretien{apres > 1 ? 's' : ''} programmé{apres > 1 ? 's' : ''} après le 31 mai, hors du calendrier.</div>}
          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center', fontSize: 11, color: COLORS.muted, marginTop: 8 }}>
            <span style={{ marginRight: 'auto' }}>Cliquez sur un jour pour voir ses entretiens. Le jour même est entouré en orange.</span>
            Moins {SCALE.map(c => <span key={c} style={{ width: CELL, height: CELL, borderRadius: 3, background: c, display: 'inline-block' }} />)} Plus (jusqu’à {max} par jour)
          </div>
        </div>
      )}
      {day && (
        <div style={{ ...card, marginTop: 12, overflowX: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px' }}>
            <strong style={{ fontSize: 13.5, color: COLORS.text }}>{long(day)} : {list.length} entretien{list.length > 1 ? 's' : ''}</strong>
            <button style={btnGhost} onClick={() => setDay('')} aria-label="Fermer"><X size={13} /></button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr><Th>Heure</Th><Th>Agent</Th><Th>Direction / Service</Th><Th>Évaluateur</Th></tr></thead>
            <tbody>
              {list.map(r => (
                <tr key={r.id} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                  <Td>{String(r.date_entretien).slice(11, 16)}</Td>
                  <Td><strong>{r.agent_nom}</strong> {r.agent_prenom}</Td>
                  <Td>{[r.direction, r.service].filter(Boolean).join(' / ')}</Td>
                  <Td>{r.evaluator_nom}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
