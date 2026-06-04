// ─── Mobilité : actions cycle de vie (entrée stock, attribution, retour, stock) ─
// Réutilise les composants partagés du module /stocks (scan code-barres, signature)
// et la recherche AD. Les flux passent par la façade /api/mobilite qui orchestre
// le module /stocks et journalise dans l'historique mobilité.
import React, { useEffect, useRef, useState } from 'react';
import {
  X, ScanLine, Search, RefreshCw, FileText, Check, PackagePlus, UserCheck, ArrowDownLeft, Smartphone, Building2,
} from 'lucide-react';
import BarcodeScanner from '../Stocks/BarcodeScanner';
import SignaturePad from '../Stocks/SignaturePad';
import { mobiliteApi, type SerialItem, type MobModel, type AdUser, type OrgDirection } from './mobiliteApi';

const C = { blue: '#2563eb', slate: '#64748b', green: '#059669', amber: '#d97706', red: '#dc2626', border: '#e2e8f0', text: '#0f172a', bg: '#f8fafc' };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 11px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: '.88rem' };
const label: React.CSSProperties = { fontSize: '.78rem', fontWeight: 700, color: C.slate, marginBottom: 4, display: 'block' };
const btnP: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 9, border: 'none', background: C.blue, color: '#fff', fontWeight: 700, fontSize: '.86rem', cursor: 'pointer' };
const btnG: React.CSSProperties = { ...btnP, background: '#fff', color: C.slate, border: `1px solid ${C.border}` };

function Modal({ title, icon: I, onClose, children, wide }: any) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: wide ? 'min(760px,96vw)' : 'min(560px,96vw)', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,.3)' }}>
        <div style={{ padding: '15px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: '1.05rem', color: C.text, display: 'flex', alignItems: 'center', gap: 9 }}>{I && <I size={20} color={C.blue} />}{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.slate }}><X size={20} /></button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

// ── Recherche d'agent dans l'AD ───────────────────────────────────────────────
export function AgentPicker({ token, value, onChange }: { token: string; value: AdUser | null; onChange: (a: AdUser | null) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<AdUser[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<any>(null);

  useEffect(() => {
    if (value) return;
    if (q.trim().length < 2) { setResults([]); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try { setResults(await mobiliteApi.searchAd(token, q.trim())); setOpen(true); }
      catch { setResults([]); } finally { setLoading(false); }
    }, 350);
    return () => clearTimeout(timer.current);
  }, [q, token, value]);

  if (value) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', border: `1px solid ${C.green}`, background: '#ecfdf5', borderRadius: 8 }}>
        <UserCheck size={16} color={C.green} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, color: C.text }}>{value.displayName}</div>
          <div style={{ fontSize: '.76rem', color: C.slate }}>{value.direction || '—'} · {value.service || '—'} {value.email ? `· ${value.email}` : ''}</div>
        </div>
        <button onClick={() => { onChange(null); setQ(''); }} style={{ ...btnG, padding: '5px 10px' }}>Changer</button>
      </div>
    );
  }
  return (
    <div style={{ position: 'relative' }}>
      <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: C.slate }} />
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un agent (nom, identifiant)…" style={{ ...input, paddingLeft: 32 }} onFocus={() => results.length && setOpen(true)} />
      {loading && <RefreshCw size={14} className="spin" style={{ position: 'absolute', right: 10, top: 10, color: C.slate }} />}
      {open && results.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 8, marginTop: 4, maxHeight: 240, overflow: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,.12)' }}>
          {results.map(r => (
            <div key={r.username} onClick={() => { onChange(r); setOpen(false); }} style={{ padding: '8px 11px', cursor: 'pointer', borderBottom: `1px solid ${C.bg}` }}>
              <div style={{ fontWeight: 600, color: C.text }}>{r.displayName}</div>
              <div style={{ fontSize: '.74rem', color: C.slate }}>{r.direction || '—'} · {r.service || '—'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sélecteur d'appareil (stock ou appareils attribués) + scan IMEI ───────────
function DevicePicker({ token, source = 'stock', value, onChange }: { token: string; source?: 'stock' | 'attribue'; value: SerialItem | null; onChange: (s: SerialItem | null) => void }) {
  const [items, setItems] = useState<SerialItem[]>([]);
  const [scan, setScan] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    const p = source === 'attribue'
      ? mobiliteApi.listDevices(token, { cycle: 'attribue', limit: 500 }).then(r => r.items)
      : mobiliteApi.listStock(token).then(r => r.items);
    p.then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  };
  useEffect(load, [token, source]);

  const identOf = (i: SerialItem) => i.imei || i.serial || i.serial_number || i.etiquetage || null;
  const labelOf = (i: SerialItem) => i.modele || i.item_label || i.model || i.type_appareil || 'Appareil';
  const keyOf = (i: SerialItem) => i.device_key || String(i.id);

  const pickByScan = (code: string) => {
    setScan(false);
    const norm = (s: string) => (s || '').replace(/\s/g, '');
    const found = items.find(i => norm(identOf(i) || '') === norm(code));
    if (found) onChange(found);
    else alert(`Aucun appareil ${source === 'stock' ? 'en stock' : 'attribué'} avec l'IMEI ${code}`);
  };

  if (value) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', border: `1px solid ${C.blue}`, background: '#eff6ff', borderRadius: 8 }}>
        <Smartphone size={16} color={C.blue} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, color: C.text }}>{labelOf(value)}</div>
          <div style={{ fontSize: '.76rem', color: C.slate, fontFamily: 'monospace' }}>{identOf(value) || '(sans IMEI)'} {value.order_number ? `· cmd ${value.order_number}` : ''}</div>
        </div>
        <button onClick={() => onChange(null)} style={{ ...btnG, padding: '5px 10px' }}>Changer</button>
      </div>
    );
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 8 }}>
        <select style={{ ...input, flex: 1 }} value="" onChange={e => { const it = items.find(i => keyOf(i) === e.target.value); if (it) onChange(it); }}>
          <option value="">{loading ? 'Chargement…' : `— Choisir (${items.length} appareil${items.length > 1 ? 's' : ''}) —`}</option>
          {items.map(i => <option key={keyOf(i)} value={keyOf(i)}>{labelOf(i)} — {identOf(i) || 'sans IMEI'}</option>)}
        </select>
        <button type="button" onClick={() => setScan(true)} style={{ ...btnG, padding: '8px 12px' }} title="Scanner l'IMEI"><ScanLine size={16} /></button>
      </div>
      {scan && <BarcodeScanner onResult={pickByScan} onClose={() => setScan(false)} />}
    </div>
  );
}

// ── 1) Entrée en stock ────────────────────────────────────────────────────────
export function EntryModal({ token, onClose, onDone }: { token: string; onClose: () => void; onDone: () => void }) {
  const [models, setModels] = useState<MobModel[]>([]);
  const [model, setModel] = useState('');
  const [category, setCategory] = useState('Smartphone');
  const [quantity, setQuantity] = useState('1');
  const [order, setOrder] = useState('');
  const [supplier, setSupplier] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { mobiliteApi.listModels(token).then(setModels).catch(() => {}); }, [token]);

  async function submit() {
    if (!model.trim()) { setErr('Modèle requis'); return; }
    if ((parseInt(quantity, 10) || 0) <= 0) { setErr('Quantité invalide'); return; }
    setBusy(true); setErr(null);
    try {
      const known = models.find(m => (m.label || '').toLowerCase() === model.trim().toLowerCase());
      await mobiliteApi.stockEntry(token, {
        item_id: known?.id, label: model.trim(), model: model.trim(), category,
        quantity: parseInt(quantity, 10), order_number: order.trim() || null, supplier: supplier.trim() || null,
      });
      onDone();
    } catch (e: any) { setErr(e.response?.data?.error || e.message); } finally { setBusy(false); }
  }

  return (
    <Modal title="Entrer des smartphones en stock" icon={PackagePlus} onClose={onClose}>
      <div style={{ display: 'grid', gap: 14 }}>
        <div>
          <label style={label}>Modèle *</label>
          <input list="mob-models" style={input} value={model} onChange={e => setModel(e.target.value)} placeholder="ex : Samsung Galaxy A55" />
          <datalist id="mob-models">{models.map(m => <option key={m.id} value={m.label} />)}</datalist>
          <div style={{ fontSize: '.72rem', color: C.slate, marginTop: 4 }}>L'IMEI de chaque appareil sera saisi plus tard (exemplarisation), via l'onglet Stock ou au scan.</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={label}>Type</label>
            <select style={input} value={category} onChange={e => setCategory(e.target.value)}>
              <option>Smartphone</option><option>Tablette</option>
            </select>
          </div>
          <div><label style={label}>Quantité *</label>
            <input type="number" min={1} style={input} value={quantity} onChange={e => setQuantity(e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={label}>N° de commande</label><input style={input} value={order} onChange={e => setOrder(e.target.value)} placeholder="ex : 2026-0142" /></div>
          <div><label style={label}>Fournisseur</label><input style={input} value={supplier} onChange={e => setSupplier(e.target.value)} /></div>
        </div>
        {err && <div style={{ color: C.red, fontSize: '.84rem' }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button style={btnG} onClick={onClose}>Annuler</button>
          <button style={btnP} onClick={submit} disabled={busy}>{busy ? <RefreshCw size={15} className="spin" /> : <Check size={15} />} Entrer en stock</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Sélecteur de service (organigramme Direction → Service) ───────────────────
export interface ServiceTarget { code: string; label: string; direction: string; direction_label: string }
function ServicePicker({ token, value, onChange }: { token: string; value: ServiceTarget | null; onChange: (s: ServiceTarget | null) => void }) {
  const [org, setOrg] = useState<OrgDirection[]>([]);
  const [dir, setDir] = useState('');
  useEffect(() => { mobiliteApi.organisation(token).then(setOrg).catch(() => setOrg([])); }, [token]);
  const services = org.find(d => d.code === dir)?.services || [];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <select style={input} value={dir} onChange={e => { setDir(e.target.value); onChange(null); }}>
        <option value="">— Direction —</option>
        {org.map(d => <option key={d.code} value={d.code}>{d.label}</option>)}
      </select>
      <select style={input} value={value?.code || ''} disabled={!dir} onChange={e => {
        const svc = services.find(s => s.code === e.target.value);
        const d = org.find(x => x.code === dir);
        onChange(svc ? { code: svc.code, label: svc.label, direction: dir, direction_label: d?.label || dir } : null);
      }}>
        <option value="">{dir ? '— Service —' : '(choisir une direction)'}</option>
        {services.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
      </select>
    </div>
  );
}

const REASONS = ['Dotation', 'Mise à disposition', 'Prêt', 'Cession'];

// ── 2) Attribution (PHASE 1) : préparation, sans signature → « en_attribution » ─
export function AttributeModal({ token, preset, onClose, onDone }: { token: string; preset?: SerialItem | null; onClose: () => void; onDone: () => void }) {
  const [device, setDevice] = useState<SerialItem | null>(preset || null);
  const [reason, setReason] = useState('Mise à disposition');
  const [targetType, setTargetType] = useState<'agent' | 'service'>('agent');
  const [agent, setAgent] = useState<AdUser | null>(null);
  const [service, setService] = useState<ServiceTarget | null>(null);
  const [dueDate, setDueDate] = useState('');
  const [etat, setEtat] = useState('NEUF');
  const [ligne, setLigne] = useState('');
  const [chargeur, setChargeur] = useState(true);
  const [cable, setCable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!device) { setErr('Sélectionnez un appareil'); return; }
    if (targetType === 'agent' && !agent) { setErr('Sélectionnez un agent'); return; }
    if (targetType === 'service' && !service) { setErr('Sélectionnez un service'); return; }
    if (reason === 'Prêt' && !dueDate) { setErr('Date de retour prévisionnelle requise pour un prêt'); return; }
    setBusy(true); setErr(null);
    try {
      await mobiliteApi.attribute(token, {
        device_key: device.device_key, reason, target_type: targetType,
        agent: targetType === 'agent' && agent ? { nom: agent.displayName, username: agent.username, email: agent.email, service: agent.service, direction: agent.direction } : undefined,
        service: targetType === 'service' && service ? service : undefined,
        due_date: reason === 'Prêt' ? dueDate : null,
        etat, numero_ligne: ligne.trim() || null, chargeur, cable,
      });
      onDone();
    } catch (e: any) { setErr(e.response?.data?.error || e.message); } finally { setBusy(false); }
  }

  return (
    <Modal title="Attribuer un appareil" icon={UserCheck} onClose={onClose} wide>
      <div style={{ display: 'grid', gap: 14 }}>
        <div><label style={label}>Appareil (depuis le stock) *</label><DevicePicker token={token} source="stock" value={device} onChange={setDevice} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={label}>Raison *</label>
            <select style={input} value={reason} onChange={e => setReason(e.target.value)}>{REASONS.map(r => <option key={r}>{r}</option>)}</select>
          </div>
          {reason === 'Prêt' && <div><label style={label}>Retour prévu le *</label><input type="date" style={input} value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>}
        </div>
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {(['agent', 'service'] as const).map(t => (
              <button key={t} onClick={() => setTargetType(t)} style={{ ...(targetType === t ? btnP : btnG), padding: '7px 14px' }}>
                {t === 'agent' ? <><UserCheck size={14} /> Agent</> : <><Building2 size={14} /> Service</>}
              </button>
            ))}
          </div>
          {targetType === 'agent'
            ? <AgentPicker token={token} value={agent} onChange={setAgent} />
            : <ServicePicker token={token} value={service} onChange={setService} />}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={label}>État</label>
            <select style={input} value={etat} onChange={e => setEtat(e.target.value)}><option>NEUF</option><option>RÉUSAGE</option><option>Autre</option></select>
          </div>
          <div><label style={label}>N° de ligne / téléphone</label><input style={input} value={ligne} onChange={e => setLigne(e.target.value)} placeholder="06 …" /></div>
        </div>
        <div style={{ display: 'flex', gap: 18 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: '.86rem', cursor: 'pointer' }}><input type="checkbox" checked={chargeur} onChange={e => setChargeur(e.target.checked)} /> Chargeur fourni</label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: '.86rem', cursor: 'pointer' }}><input type="checkbox" checked={cable} onChange={e => setCable(e.target.checked)} /> Câble fourni</label>
        </div>
        <div style={{ fontSize: '.78rem', color: C.slate, background: C.bg, borderRadius: 8, padding: '8px 11px' }}>
          Pas de signature ici : l'appareil passe « en cours d'attribution ». La fiche est signée lors de la remise (onglet « Attributions en cours »).
        </div>
        {err && <div style={{ color: C.red, fontSize: '.84rem' }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button style={btnG} onClick={onClose}>Annuler</button>
          <button style={btnP} onClick={submit} disabled={busy}>{busy ? <RefreshCw size={15} className="spin" /> : <Check size={15} />} Préparer l'attribution</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Phase 2 : remise d'un appareil « en attribution » (signature OU upload) ────
export function DeliverModal({ token, device, onClose, onDone }: { token: string; device: SerialItem; onClose: () => void; onDone: () => void }) {
  const a = device.attrib || {};
  const [mode, setMode] = useState<'sign' | 'upload'>('sign');
  const [sigAgent, setSigAgent] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const r = mode === 'upload' && file
        ? await mobiliteApi.deliverUpload(token, device.device_key, file)
        : await mobiliteApi.deliverSign(token, device.device_key, sigAgent);
      if (r.fiche_document_id) { try { await mobiliteApi.openFiche(token, r.fiche_document_id); } catch { /* noop */ } }
      onDone();
    } catch (e: any) { setErr(e.response?.data?.error || e.message); } finally { setBusy(false); }
  }

  return (
    <Modal title="Remise du matériel" icon={FileText} onClose={onClose} wide>
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ background: C.bg, borderRadius: 10, padding: '10px 14px', fontSize: '.85rem' }}>
          <b>{device.modele || device.item_label || 'Appareil'}</b> — {device.imei || device.serial || '(sans IMEI)'}<br />
          <span style={{ color: C.slate }}>{a.reason || '—'} · {a.agent_nom || a.agent_username || '—'} {a.direction ? `· ${a.direction}` : ''} {a.due_date ? `· retour prévu ${new Date(a.due_date).toLocaleDateString('fr-FR')}` : ''}</span>
        </div>
        <div style={{ fontSize: '.82rem', color: C.slate }}>Technicien remettant : <b style={{ color: C.text }}>vous</b> (utilisateur connecté).</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setMode('sign')} style={{ ...(mode === 'sign' ? btnP : btnG), padding: '7px 14px' }}>Signature à l'écran</button>
          <button onClick={() => setMode('upload')} style={{ ...(mode === 'upload' ? btnP : btnG), padding: '7px 14px' }}>Imprimer &amp; téléverser</button>
        </div>
        {mode === 'sign'
          ? <div><label style={label}>Signature de l'agent destinataire</label><SignaturePad onChange={setSigAgent} height={150} /></div>
          : <div>
            <label style={label}>Fiche de remise signée (PDF)</label>
            <input type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} />
            <div style={{ fontSize: '.74rem', color: C.slate, marginTop: 4 }}>Générez/imprimez la fiche, faites-la signer, puis téléversez le PDF scanné.</div>
          </div>}
        {err && <div style={{ color: C.red, fontSize: '.84rem' }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button style={btnG} onClick={onClose}>Annuler</button>
          <button style={btnP} onClick={submit} disabled={busy || (mode === 'upload' && !file)}>{busy ? <RefreshCw size={15} className="spin" /> : <Check size={15} />} Valider la remise</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Onglet « Attributions en cours » ──────────────────────────────────────────
export function AttributionsTab({ token, canOperate, reloadKey, onChanged }: { token: string; canOperate: boolean; reloadKey: number; onChanged: () => void }) {
  const [items, setItems] = useState<SerialItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [deliver, setDeliver] = useState<SerialItem | null>(null);

  const load = () => { setLoading(true); mobiliteApi.listAttributions(token).then(r => setItems(r.items)).catch(() => setItems([])).finally(() => setLoading(false)); };
  useEffect(load, [token, reloadKey]);

  const cancel = async (key: string) => { if (!confirm('Annuler cette attribution (retour au stock) ?')) return; try { await mobiliteApi.cancelAttribution(token, key); load(); onChanged(); } catch (e: any) { alert(e.response?.data?.error || e.message); } };

  return (
    <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, fontSize: '.82rem', color: C.slate, display: 'flex', justifyContent: 'space-between' }}>
        <span><b style={{ color: C.text }}>{items.length}</b> attribution(s) en cours</span>{loading && <RefreshCw size={13} className="spin" />}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
          <thead style={{ background: C.bg }}><tr>{['Modèle', 'IMEI', 'Raison', 'Destinataire', 'Préparé', ''].map((h, i) => <th key={i} style={{ textAlign: 'left', padding: '10px 12px', fontSize: '.74rem', fontWeight: 800, color: C.slate, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
          <tbody>
            {items.map(it => { const a = it.attrib || {}; return (
              <tr key={it.device_key} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ padding: '9px 12px', fontWeight: 600 }}>{it.modele || it.item_label || 'Appareil'}</td>
                <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: '.8rem' }}>{it.imei || it.serial || '—'}</td>
                <td style={{ padding: '9px 12px' }}>{a.reason || '—'}{a.due_date ? <span style={{ color: C.amber }}> · {new Date(a.due_date).toLocaleDateString('fr-FR')}</span> : ''}</td>
                <td style={{ padding: '9px 12px' }}>{a.agent_nom || a.agent_username || '—'}<div style={{ fontSize: '.74rem', color: C.slate }}>{a.direction || ''} {a.service ? `· ${a.service}` : ''}</div></td>
                <td style={{ padding: '9px 12px', color: C.slate }}>{a.prepared_by || '—'}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {canOperate && <>
                    <button onClick={() => setDeliver(it)} style={{ ...btnP, padding: '5px 11px', marginRight: 6 }}><FileText size={13} /> Remettre</button>
                    <button onClick={() => cancel(it.device_key)} style={{ ...btnG, padding: '5px 9px' }}>Annuler</button>
                  </>}
                </td>
              </tr>
            ); })}
            {!loading && items.length === 0 && <tr><td colSpan={6} style={{ padding: 36, textAlign: 'center', color: C.slate }}>Aucune attribution en cours.</td></tr>}
          </tbody>
        </table>
      </div>
      {deliver && <DeliverModal token={token} device={deliver} onClose={() => setDeliver(null)} onDone={() => { setDeliver(null); load(); onChanged(); }} />}
    </div>
  );
}

// ── 3) Retour d'un agent (fiche retour) ───────────────────────────────────────
export function ReturnModal({ token, preset, onClose, onDone }: { token: string; preset?: SerialItem | null; onClose: () => void; onDone: () => void }) {
  const [device, setDevice] = useState<SerialItem | null>(preset || null);
  const [etat, setEtat] = useState('Fonctionnel');
  const [motif, setMotif] = useState('');
  const [sigDsi, setSigDsi] = useState<string | null>(null);
  const [sigAgent, setSigAgent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!device) { setErr('Sélectionnez un appareil'); return; }
    setBusy(true); setErr(null);
    try {
      const r = await mobiliteApi.returnDevice(token, {
        device_key: device.device_key, etat_retour: etat, motif: motif.trim() || null,
        preparer_signature: sigDsi, recipient_signature: sigAgent,
      });
      if (r.fiche_document_id) { try { await mobiliteApi.openFiche(token, r.fiche_document_id); } catch { /* noop */ } }
      onDone();
    } catch (e: any) { setErr(e.response?.data?.error || e.message); } finally { setBusy(false); }
  }

  return (
    <Modal title="Enregistrer un retour (avec fiche)" icon={ArrowDownLeft} onClose={onClose} wide>
      <div style={{ display: 'grid', gap: 14 }}>
        <div><label style={label}>Appareil rendu *</label><DevicePicker token={token} source="attribue" value={device} onChange={setDevice} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
          <div><label style={label}>État au retour</label>
            <select style={input} value={etat} onChange={e => setEtat(e.target.value)}><option>Fonctionnel</option><option>Défectueux</option><option>Écran cassé</option><option>Hors service</option></select>
          </div>
          <div><label style={label}>Motif / observations</label><input style={input} value={motif} onChange={e => setMotif(e.target.value)} placeholder="départ, mutation, panne…" /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div><label style={label}>Signature représentant DSI</label><SignaturePad onChange={setSigDsi} height={130} /></div>
          <div><label style={label}>Signature de l'agent</label><SignaturePad onChange={setSigAgent} height={130} /></div>
        </div>
        {err && <div style={{ color: C.red, fontSize: '.84rem' }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button style={btnG} onClick={onClose}>Annuler</button>
          <button style={btnP} onClick={submit} disabled={busy}>{busy ? <RefreshCw size={15} className="spin" /> : <FileText size={15} />} Enregistrer &amp; générer la fiche</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Onglet Stock : appareils en stock (non attribués) + exemplarisation IMEI ──
export function StockTab({ token, canOperate, onAttribute, reloadKey }: { token: string; canOperate: boolean; onAttribute: (s: SerialItem) => void; reloadKey: number }) {
  const [items, setItems] = useState<SerialItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [edit, setEdit] = useState<{ id: number; value: string } | null>(null);
  const [scanId, setScanId] = useState<number | null>(null);

  const load = () => { setLoading(true); mobiliteApi.listStock(token, { status: 'in_stock' }).then(r => setItems(r.items)).catch(() => setItems([])).finally(() => setLoading(false)); };
  useEffect(load, [token, reloadKey]);

  const saveSerial = async (id: number, value: string) => {
    try { await mobiliteApi.setSerial(token, id, value.trim()); setEdit(null); load(); } catch (e: any) { alert(e.response?.data?.error || e.message); }
  };

  return (
    <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, fontSize: '.82rem', color: C.slate, display: 'flex', justifyContent: 'space-between' }}>
        <span><b style={{ color: C.text }}>{items.length}</b> appareil(s) en stock (non attribués)</span>
        {loading && <RefreshCw size={13} className="spin" />}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
          <thead style={{ background: C.bg }}>
            <tr>{['Modèle', 'IMEI / N° série', 'N° commande', 'Entré le', 'Dernier état', 'Action', 'Date', ''].map((h, i) => <th key={i} style={{ textAlign: 'left', padding: '10px 12px', fontSize: '.74rem', fontWeight: 800, color: C.slate, textTransform: 'uppercase' }}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {items.map(it => {
              const ident = it.imei || it.serial || it.serial_number || it.etiquetage || null;
              const entered = it.first_date || it.created_at || it.updated_at || null;
              const sid = it.serial_item_id ?? (typeof it.id === 'number' ? it.id : null); // exemplarisation : seulement pour les unités stock liées
              const canEditSerial = canOperate && sid != null;
              return (
              <tr key={it.device_key || it.id} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ padding: '9px 12px', fontWeight: 600 }}>
                  {it.modele || it.item_label || it.model || it.type_appareil || 'Appareil'}
                  {it.famille && <span style={{ marginLeft: 6, fontSize: '.68rem', color: C.slate, background: C.bg, borderRadius: 6, padding: '1px 6px', fontWeight: 600 }}>{it.famille}</span>}
                </td>
                <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: '.8rem' }}>
                  {edit && sid != null && edit.id === sid ? (
                    <span style={{ display: 'inline-flex', gap: 6 }}>
                      <input autoFocus value={edit.value} onChange={e => setEdit({ id: sid, value: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') saveSerial(sid, edit.value); if (e.key === 'Escape') setEdit(null); }} style={{ ...input, padding: '4px 8px', width: 180 }} />
                      <button onClick={() => saveSerial(sid, edit.value)} style={{ ...btnP, padding: '4px 9px' }}><Check size={13} /></button>
                      <button onClick={() => setScanId(sid)} style={{ ...btnG, padding: '4px 9px' }}><ScanLine size={13} /></button>
                    </span>
                  ) : ident
                    ? <span>{ident} {canEditSerial && <button onClick={() => setEdit({ id: sid as number, value: ident })} style={{ ...btnG, padding: '2px 7px', marginLeft: 6, fontSize: '.7rem' }}>modifier</button>}</span>
                    : (canEditSerial ? <button onClick={() => setEdit({ id: sid as number, value: '' })} style={{ ...btnG, padding: '3px 9px', color: C.amber, borderColor: C.amber }}>+ saisir l'IMEI</button> : <span style={{ color: '#cbd5e1' }}>—</span>)}
                </td>
                <td style={{ padding: '9px 12px', color: C.slate }}>{it.order_number || '—'}</td>
                <td style={{ padding: '9px 12px', color: C.slate }}>{entered ? new Date(entered).toLocaleDateString('fr-FR') : '—'}</td>
                <td style={{ padding: '9px 12px' }}>
                  {it.last_statut
                    ? <span style={{ fontSize: '.74rem', fontWeight: 700, color: /defect|hs|cass|panne/i.test(it.last_statut) ? C.red : C.slate, background: C.bg, borderRadius: 6, padding: '2px 8px' }}>{it.last_statut}</span>
                    : <span style={{ color: '#cbd5e1' }}>—</span>}
                </td>
                <td style={{ padding: '9px 12px', color: C.slate, fontSize: '.8rem' }}>{it.last_action || '—'}</td>
                <td style={{ padding: '9px 12px', color: C.slate, fontFamily: 'monospace', fontSize: '.78rem' }}>{it.last_date ? new Date(it.last_date).toLocaleDateString('fr-FR') : '—'}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                  {canOperate && <button onClick={() => onAttribute(it)} style={{ ...btnP, padding: '5px 11px' }}><UserCheck size={13} /> Attribuer</button>}
                </td>
              </tr>
              );
            })}
            {!loading && items.length === 0 && <tr><td colSpan={8} style={{ padding: 36, textAlign: 'center', color: C.slate }}>Aucun appareil en stock. Utilisez « Entrer en stock ».</td></tr>}
          </tbody>
        </table>
      </div>
      {scanId != null && <BarcodeScanner onResult={code => { saveSerial(scanId, code); setScanId(null); }} onClose={() => setScanId(null)} />}
    </div>
  );
}
