import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, ChevronUp, ChevronDown, FileText, GitBranch, Loader2, MapPin, Paperclip, Send, ShieldCheck, Smartphone, Trash2, Upload, Users, X, UserPlus } from 'lucide-react';
import Header from '../../components/Header';
import ParapheurAgentHeader from '../../components/parapheur/ParapheurAgentHeader';
import AgentPickerRH, { type AgentRef } from '../../components/parapheur/AgentPickerRH';
import PdfThumb from '../../components/parapheur/PdfThumb';
import SignaturePlacementEditor, { type Placement } from '../../components/parapheur/SignaturePlacementEditor';
import AgentPresenceBadge from '../../components/AgentPresenceBadge';
import { useAuth } from '../../contexts/AuthContext';

interface DocFile { id: string; file: File; name: string; }
type Mode = 'sequentiel' | 'parallele' | 'alternative';
type SignMode = 'simple' | 'securise' | 'sms';

const MODE_LABEL: Record<Mode, string> = {
  sequentiel: 'Séquentiel',
  parallele: 'Parallèle',
  alternative: 'Alternatif',
};

let fileSeq = 0;
const nextFileId = () => `f${Date.now()}_${fileSeq++}`;

export default function ParapheurCreate() {
  const { token, user } = useAuth();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [deadline, setDeadline] = useState('');
  const [mode, setMode] = useState<Mode>('parallele');
  const [modeChosen, setModeChosen] = useState(false);
  const [showModeModal, setShowModeModal] = useState(false);
  const [documents, setDocuments] = useState<DocFile[]>([]);
  const [annexes, setAnnexes] = useState<DocFile[]>([]);
  const [pages, setPages] = useState<Record<string, number>>({});
  const [signataires, setSignataires] = useState<AgentRef[]>([]);
  const [signerKind, setSignerKind] = useState<'agent' | 'externe'>('agent');
  const [extName, setExtName] = useState('');
  const [extEmail, setExtEmail] = useState('');
  const [extPhone, setExtPhone] = useState('');
  const [modeMap, setModeMap] = useState<Record<string, SignMode>>({});
  const [phoneMap, setPhoneMap] = useState<Record<string, string>>({});
  const [titleMap, setTitleMap] = useState<Record<string, string>>({});
  const [includeTitleMap, setIncludeTitleMap] = useState<Record<string, boolean>>({});
  const [titleLoading, setTitleLoading] = useState<Record<string, boolean>>({});
  const titleFetched = React.useRef<Set<string>>(new Set());
  const [eligible, setEligible] = useState<Set<string>>(new Set());
  const [positions, setPositions] = useState<Record<string, Placement>>({});
  const [editing, setEditing] = useState<{ email: string; di: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!token) return;
    fetch('/api/parapheur/eligible-secure', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setEligible(new Set((Array.isArray(d) ? d : []).map((x: { email?: string }) => String(x.email).toLowerCase()))))
      .catch(() => setEligible(new Set()));
  }, [token]);

  const key = (email: string, di: number) => `${email}::${di}`;
  const signModeOf = (s: AgentRef): SignMode => modeMap[s.email.toLowerCase()] || 'simple';
  const isSecure = (s: AgentRef) => signModeOf(s) === 'securise';
  const isSms = (s: AgentRef) => signModeOf(s) === 'sms';

  const toPdfList = (files: FileList | null): DocFile[] => {
    if (!files) return [];
    const list: DocFile[] = [];
    Array.from(files).forEach(f => {
      if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) list.push({ id: nextFileId(), file: f, name: f.name });
    });
    return list;
  };
  const docInputRef = React.useRef<HTMLInputElement | null>(null);
  const annexeInputRef = React.useRef<HTMLInputElement | null>(null);
  const handlePick = (target: 'docs' | 'annexes') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    const added = toPdfList(files);
    if (files && files.length > 0 && added.length === 0) setError('Seuls les fichiers PDF sont acceptés.');
    if (target === 'docs') setDocuments(prev => [...prev, ...added]);
    else setAnnexes(prev => [...prev, ...added]);
    e.target.value = '';
  };
  const handleDrop = (target: 'docs' | 'annexes') => (e: React.DragEvent) => {
    e.preventDefault();
    const list = e.dataTransfer?.files || null;
    const added = toPdfList(list);
    if (list && list.length > 0 && added.length === 0) setError('Seuls les fichiers PDF sont acceptés.');
    if (target === 'docs') setDocuments(prev => [...prev, ...added]);
    else setAnnexes(prev => [...prev, ...added]);
  };
  const removeDoc = (idx: number) => setDocuments(prev => prev.filter((_, i) => i !== idx));
  const removeAnnexe = (idx: number) => setAnnexes(prev => prev.filter((_, i) => i !== idx));
  const setPageCount = (id: string, n: number) => setPages(prev => (prev[id] === n ? prev : { ...prev, [id]: n }));

  // Récupère (une fois par agent) l'intitulé de poste par défaut depuis le référentiel RH.
  const ensureTitles = (list: AgentRef[]) => {
    list.forEach(s => {
      const k = s.email.toLowerCase();
      if (titleFetched.current.has(k)) return;
      titleFetched.current.add(k);
      // Toujours interroger le référentiel RH (le libellé `poste` du picker peut
      // être la fonction générique, pas l'intitulé de fonction attendu).
      if (!s.matricule) {
        const prefill = (s.poste || '').trim();
        if (prefill) {
          setTitleMap(m => ({ ...m, [k]: prefill }));
          setIncludeTitleMap(m => ({ ...m, [k]: true }));
        }
        return;
      }
      setTitleLoading(m => ({ ...m, [k]: true }));
      fetch(`/api/parapheur/agent-titre?matricule=${encodeURIComponent(s.matricule)}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => (r.ok ? r.json() : null))
        .then((d: { titre?: string } | null) => {
          if (d && d.titre) {
            setTitleMap(m => ({ ...m, [k]: d.titre as string }));
            setIncludeTitleMap(m => ({ ...m, [k]: true }));
          }
        })
        .catch(() => { /* titre optionnel */ })
        .finally(() => setTitleLoading(m => ({ ...m, [k]: false })));
    });
  };

  const handleSignatairesChange = (next: AgentRef[]) => {
    ensureTitles(next);
    setSignataires(next);
    if (next.length < 2) {
      setModeChosen(false);
      setMode('parallele');
      setShowModeModal(false);
    } else if (next.length === 2 && !modeChosen) {
      setShowModeModal(true);
    }
  };

  /** Ajoute un signataire extérieur (hors collectivité) : e-mail + téléphone. */
  const addExternalSigner = () => {
    const email = extEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Adresse e-mail invalide pour le signataire extérieur.'); return; }
    if (signataires.some(s => s.email.toLowerCase() === email)) { setError('Ce signataire est déjà ajouté.'); return; }
    const name = extName.trim() || email;
    const next = [...signataires, { displayName: name, email, external: true } as AgentRef];
    setSignataires(next);
    if (extPhone.trim()) setPhoneMap(m => ({ ...m, [email]: extPhone.trim() }));
    setExtName(''); setExtEmail(''); setExtPhone(''); setError(null);
    if (next.length < 2) {
      setModeChosen(false); setMode('parallele'); setShowModeModal(false);
    } else if (next.length === 2 && !modeChosen) {
      setShowModeModal(true);
    }
  };

  const moveSignataire = (idx: number, dir: -1 | 1) => {
    setSignataires(prev => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const smsMissingPhone = signataires.some(s => isSms(s) && !(phoneMap[s.email.toLowerCase()] || '').replace(/\D/g, ''));
  const canSubmit = title.trim().length > 0 && documents.length > 0 && signataires.length > 0 && !smsMissingPhone && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true); setError(null);
    try {
      const fd = new FormData();
      documents.forEach(d => fd.append('documents', d.file, d.name));
      annexes.forEach(a => fd.append('annexes', a.file, a.name));
      const effectiveMode: Mode = signataires.length >= 2 ? mode : 'parallele';
      const payload = {
        title, message, mode: effectiveMode, deadline: deadline || null,
        signataires: signataires.map((s) => ({
          agentId: s.id,
          nom: s.displayName,
          email: s.email,
          service: s.service,
          external: !!s.external,
          signatureMode: signModeOf(s),
          smsPhone: isSms(s) ? (phoneMap[s.email.toLowerCase()] || null) : null,
          title: (includeTitleMap[s.email.toLowerCase()] !== false && (titleMap[s.email.toLowerCase()] || '').trim())
            ? titleMap[s.email.toLowerCase()].trim()
            : null,
          positions: documents.map((doc, di) => {
            // Par défaut : dernière page du document.
            const p = positions[key(s.email, di)] || { page: pages[doc.id] || 1, x: 75, y: 85, w: 150, h: 60 };
            return { documentIndex: di, page: p.page, x: p.x, y: p.y, w: p.w, h: p.h };
          }),
        })),
      };
      fd.append('payload', JSON.stringify(payload));
      const r = await fetch('/api/parapheur', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || 'Erreur lors de la création');
      navigate(`/parapheur/${d.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la création');
      setSubmitting(false);
    }
  };

  const editingSignataire = editing ? signataires.find(s => s.email === editing.email) : null;
  const editingOthers = editing
    ? signataires
      .filter(s => s.email !== editing.email)
      .map(s => ({ name: s.displayName, pos: positions[key(s.email, editing.di)] }))
      .filter((o): o is { name: string; pos: Placement } => !!o.pos)
    : [];

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {user?.role === 'parapheur_agent' ? <ParapheurAgentHeader user={user} /> : <Header />}
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 20px 120px' }}>
        <button onClick={() => navigate('/parapheur')} style={ghostBtn}><ArrowLeft size={15} /> Retour</button>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '16px 0 20px' }}>Nouveau parapheur</h1>

        {error && <div style={errBox}>{error}</div>}

        {/* 1. Informations */}
        <Section icon={<FileText size={17} />} title="Informations">
          <Field label="Titre du parapheur *">
            <input value={title} onChange={e => setTitle(e.target.value)} style={input} />
          </Field>
          <Field label="Message aux signataires (optionnel)">
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} style={{ ...input, resize: 'vertical' }} placeholder="Consigne ou contexte…" />
          </Field>
          <Field label="Échéance (optionnel)">
            <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} style={{ ...input, maxWidth: 240 }} />
          </Field>
        </Section>

        {/* 2. Documents à signer */}
        <Section icon={<Upload size={17} />} title={`Documents à signer (PDF) * (${documents.length})`}>
          <div
            onClick={() => docInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop('docs')}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 22, border: '2px dashed #cbd5e1', borderRadius: 12, cursor: 'pointer', color: '#64748b', background: '#f8fafc' }}
          >
            <Upload size={22} />
            <span style={{ fontWeight: 700, fontSize: 13 }}>Cliquez ou déposez des PDF à signer</span>
            <input ref={docInputRef} type="file" accept="application/pdf,.pdf" multiple style={{ display: 'none' }} onChange={handlePick('docs')} />
          </div>
          {documents.length > 0 && (
            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              {documents.map((d, i) => (
                <div key={d.id} style={{ ...row, padding: '10px 14px' }}>
                  <PdfThumb file={d.file} width={64} onPages={(n) => setPageCount(d.id, n)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{d.name}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{pages[d.id] ? `${pages[d.id]} page(s)` : 'Lecture…'}</div>
                  </div>
                  <button onClick={() => removeDoc(i)} style={iconBtn}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* 2bis. Annexes (non signées) */}
        <Section icon={<Paperclip size={17} />} title={`Annexes — PDF complémentaires (${annexes.length})`}>
          <div
            onClick={() => annexeInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop('annexes')}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 18, border: '2px dashed #cbd5e1', borderRadius: 12, cursor: 'pointer', color: '#64748b', background: '#f8fafc' }}
          >
            <Paperclip size={20} />
            <span style={{ fontWeight: 700, fontSize: 13 }}>Cliquez ou déposez des annexes PDF</span>
            <input ref={annexeInputRef} type="file" accept="application/pdf,.pdf" multiple style={{ display: 'none' }} onChange={handlePick('annexes')} />
          </div>
          <p style={hint}>Les annexes sont proposées en consultation au signataire mais ne sont pas signées.</p>
          {annexes.length > 0 && (
            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              {annexes.map((a, i) => (
                <div key={a.id} style={{ ...row, padding: '10px 14px' }}>
                  <PdfThumb file={a.file} width={64} onPages={(n) => setPageCount(a.id, n)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{a.name}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{pages[a.id] ? `${pages[a.id]} page(s)` : 'Lecture…'} — non signé</div>
                  </div>
                  <button onClick={() => removeAnnexe(i)} style={iconBtn}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* 3. Signataires */}
        <Section icon={<Users size={17} />} title={`Signataires * (${signataires.length})`}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {([['agent', 'Agent / élu'], ['externe', 'Extérieur']] as ['agent' | 'externe', string][]).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setSignerKind(k)}
                style={{
                  padding: '8px 16px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  border: `1px solid ${signerKind === k ? '#7c3aed' : '#e2e8f0'}`,
                  background: signerKind === k ? '#f5f3ff' : '#fff',
                  color: signerKind === k ? '#6d28d9' : '#475569',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {signerKind === 'agent' ? (
            <AgentPickerRH value={signataires.filter(s => !s.external)} onChange={(list) => handleSignatairesChange([...signataires.filter(s => s.external), ...list])} token={token} />
          ) : (
            <div style={{ display: 'grid', gap: 8, background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 10, padding: 14 }}>
              <p style={{ ...hint, marginTop: 0 }}>Signataire hors collectivité : renseignez au minimum l'adresse e-mail ; le numéro de portable est requis pour une signature sécurisée par SMS.</p>
              <input value={extName} onChange={e => setExtName(e.target.value)} placeholder="Nom et prénom" style={input} />
              <input value={extEmail} onChange={e => setExtEmail(e.target.value)} placeholder="Adresse e-mail *" style={input} />
              <input value={extPhone} onChange={e => setExtPhone(e.target.value)} placeholder="N° de portable (06…)" style={input} />
              <div>
                <button type="button" onClick={addExternalSigner} style={primaryBtn}><UserPlus size={15} /> Ajouter ce signataire extérieur</button>
              </div>
            </div>
          )}
          {signataires.length > 0 && (
            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              {signataires.map((s, i) => {
                const isEligible = eligible.has(s.email.toLowerCase());
                return (
                  <div key={s.email} style={{ ...row, padding: '10px 14px' }}>
                    {signataires.length >= 2 && mode === 'sequentiel' && (
                      <span style={{ fontWeight: 800, color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, minWidth: 26, textAlign: 'center', padding: '2px 0', fontSize: 13 }}>{i + 1}</span>
                    )}
                    {s.external
                      ? <span title="Signataire extérieur (hors collectivité)" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', padding: '2px 7px', borderRadius: 10, flexShrink: 0 }}>Extérieur</span>
                      : <AgentPresenceBadge email={s.email} name={s.displayName} size={13} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{s.displayName}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{s.email}{s.service ? ` — ${s.service}` : ''}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                        <input
                          value={titleMap[s.email.toLowerCase()] || ''}
                          onChange={e => setTitleMap(m => ({ ...m, [s.email.toLowerCase()]: e.target.value }))}
                          placeholder={titleLoading[s.email.toLowerCase()] ? 'Recherche du titre…' : 'Titre / fonction sous la signature'}
                          style={{ flex: '1 1 220px', minWidth: 160, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                        />
                        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#64748b', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={includeTitleMap[s.email.toLowerCase()] !== false}
                            onChange={e => setIncludeTitleMap(m => ({ ...m, [s.email.toLowerCase()]: e.target.checked }))}
                          />
                          Afficher le titre
                        </label>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <select
                        value={signModeOf(s)}
                        onChange={e => setModeMap(m => ({ ...m, [s.email.toLowerCase()]: e.target.value as SignMode }))}
                        style={{ padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#334155' }}
                      >
                        <option value="simple">Simple</option>
                        <option value="securise" disabled={!isEligible}>Sécurisée (P12){!isEligible ? ' — DG/directeurs' : ''}</option>
                        <option value="sms">Sécurisée (SMS)</option>
                      </select>
                      {isSms(s) && (
                        <input
                          value={phoneMap[s.email.toLowerCase()] || ''}
                          onChange={e => setPhoneMap(m => ({ ...m, [s.email.toLowerCase()]: e.target.value }))}
                          placeholder="N° portable (06…)"
                          style={{ padding: '6px 8px', border: `1px solid ${(phoneMap[s.email.toLowerCase()] || '').replace(/\D/g, '') ? '#e2e8f0' : '#fca5a5'}`, borderRadius: 8, fontSize: 12 }}
                        />
                      )}
                    </div>
                    {signataires.length >= 2 && mode === 'sequentiel' && (
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <button onClick={() => moveSignataire(i, -1)} style={miniBtn} disabled={i === 0}><ChevronUp size={13} /></button>
                        <button onClick={() => moveSignataire(i, 1)} style={miniBtn} disabled={i === signataires.length - 1}><ChevronDown size={13} /></button>
                      </div>
                    )}
                    <button onClick={() => handleSignatairesChange(signataires.filter(x => x.email !== s.email))} style={iconBtn}><Trash2 size={15} /></button>
                  </div>
                );
              })}
            </div>
          )}

          <p style={hint}>
            Signature simple ou SMS : pour des documents dont la validité juridique est interne à la collectivité.
            Si la signature doit avoir une valeur probante externe, le signataire doit disposer d'un certificat personnel
            et utiliser le mode « Sécurisée (P12) ».
          </p>

          {/* Workflow — uniquement à partir de 2 signataires */}
          {signataires.length >= 2 && (
            <div style={{ marginTop: 16, background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <GitBranch size={15} color="#7c3aed" />
                <span style={{ fontSize: 12, fontWeight: 800, color: '#6d28d9', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  Circuit {MODE_LABEL[mode]}
                </span>
                <button onClick={() => setShowModeModal(true)} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: '#7c3aed', fontSize: 12, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
                  Modifier
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {signataires.map((s, i) => (
                  <React.Fragment key={s.email}>
                    {i > 0 && (mode === 'sequentiel'
                      ? <ArrowRight size={16} color="#a78bfa" />
                      : <span style={{ color: '#a78bfa', fontWeight: 800 }}>{mode === 'alternative' ? 'ou' : '+'}</span>)}
                    <span style={{ padding: '5px 12px', borderRadius: 16, background: '#fff', border: '1px solid #ddd6fe', fontSize: 12, fontWeight: 700, color: '#5b21b6' }}>
                      {mode === 'sequentiel' ? `${i + 1}. ` : ''}{s.displayName}
                    </span>
                  </React.Fragment>
                ))}
                {mode === 'parallele' && <span style={{ fontSize: 11, color: '#7c3aed', fontStyle: 'italic' }}>tous doivent signer</span>}
                {mode === 'alternative' && <span style={{ fontSize: 11, color: '#7c3aed', fontStyle: 'italic' }}>l'un ou l'autre suffit</span>}
              </div>
            </div>
          )}
          {signataires.length === 1 && (
            <p style={hint}>Un seul signataire : le mode séquentiel/parallèle n'a pas d'objet.</p>
          )}
        </Section>

        {/* 4. Positionnement */}
        {signataires.length > 0 && documents.length > 0 && (
          <Section icon={<MapPin size={17} />} title="Positionnement des signatures">
            <p style={{ ...hint, marginBottom: 12 }}>Pour chaque signataire et chaque document, placez le cadre de signature (les positions des autres signataires apparaissent en pointillé).</p>
            <div style={{ display: 'grid', gap: 10 }}>
              {signataires.map((s) => (
                <div key={s.email} style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '8px 14px', background: '#f8fafc', fontWeight: 700, fontSize: 13, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {mode === 'sequentiel' && signataires.length >= 2 && <span style={{ color: '#7c3aed' }}>{signataires.indexOf(s) + 1}.</span>}
                    {s.displayName}
                    {s.external
                      ? <span title="Signataire extérieur (hors collectivité)" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', padding: '2px 7px', borderRadius: 10, flexShrink: 0 }}>Extérieur</span>
                      : <AgentPresenceBadge email={s.email} name={s.displayName} size={12} />}
                    {isSecure(s) && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6d28d9', fontWeight: 700 }}><ShieldCheck size={12} /> P12</span>}
                    {isSms(s) && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#0e7490', fontWeight: 700 }}><Smartphone size={12} /> SMS</span>}
                  </div>
                  {documents.map((d, di) => {
                    const p = positions[key(s.email, di)];
                    return (
                      <div key={di} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderTop: '1px solid #f1f5f9' }}>
                        <FileText size={15} color="#ef4444" />
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                        <span style={{ fontSize: 11, color: p ? '#64748b' : '#f59e0b' }}>{p ? `p.${p.page} · ${p.x.toFixed(0)}% / ${p.y.toFixed(0)}%` : 'position par défaut'}</span>
                        <button onClick={() => setEditing({ email: s.email, di })} style={{ ...ghostBtn, padding: '6px 12px' }}><MapPin size={13} /> Positionner</button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </Section>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
          <button onClick={() => navigate('/parapheur')} style={ghostBtn} disabled={submitting}>Annuler</button>
          <button onClick={submit} disabled={!canSubmit} style={{ ...primaryBtn, opacity: canSubmit ? 1 : 0.5 }}>
            {submitting ? <Loader2 className="spin" size={16} /> : <Send size={15} />} Envoyer le parapheur
          </button>
        </div>
      </div>

      {showModeModal && (
        <ModeModal
          value={mode}
          count={signataires.length}
          onCancel={() => { setShowModeModal(false); if (!modeChosen) { /* garder défaut parallèle */ setMode('parallele'); } }}
          onConfirm={(m) => { setMode(m); setModeChosen(true); setShowModeModal(false); }}
        />
      )}

      {editing && editingSignataire && (
        <SignaturePlacementEditor
          key={`${editing.email}-${editing.di}`}
          open
          source={{ file: documents[editing.di]?.file }}
          signataireName={editingSignataire.displayName}
          documentName={documents[editing.di]?.name}
          initial={positions[key(editing.email, editing.di)] || { page: pages[documents[editing.di]?.id] || 1, x: 75, y: 85, w: 150, h: 60 }}
          others={editingOthers}
          onClose={() => setEditing(null)}
          onValidate={(p) => { setPositions(prev => ({ ...prev, [key(editing.email, editing.di)]: p })); setEditing(null); }}
        />
      )}
    </div>
  );
}

function ModeModal({ value, count, onCancel, onConfirm }: { value: Mode; count: number; onCancel: () => void; onConfirm: (m: Mode) => void }) {
  const [choice, setChoice] = useState<Mode>(value);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <GitBranch size={20} color="#7c3aed" />
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>Mode de signature</h3>
          <button onClick={onCancel} style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={18} /></button>
        </div>
        <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 16px' }}>Vous avez {count} signataires. Comment doivent-ils signer ?</p>
        {([
           ['sequentiel', 'Puis', 'Circuit séquentiel : l\'un après l\'autre, dans l\'ordre défini.'],
           ['parallele', 'Et', 'Circuit parallèle : tous les signataires doivent signer, peu importe l\'ordre.'],
           ['alternative', 'Ou', 'Circuit alternatif : la signature d\'un seul signataire suffit à valider le document.'],
        ] as [Mode, string, string][]).map(([m, label, desc]) => (
          <button key={m} onClick={() => setChoice(m)} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', textAlign: 'left',
            padding: '12px 14px', marginBottom: 10, borderRadius: 10, cursor: 'pointer',
            border: `2px solid ${choice === m ? '#7c3aed' : '#e2e8f0'}`, background: choice === m ? '#faf5ff' : '#fff',
          }}>
            <span style={{ width: 18, height: 18, borderRadius: 9, border: `2px solid ${choice === m ? '#7c3aed' : '#cbd5e1'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
              {choice === m && <span style={{ width: 8, height: 8, borderRadius: 4, background: '#7c3aed' }} />}
            </span>
            <span>
              <span style={{ display: 'block', fontWeight: 800, fontSize: 14, color: '#1e293b' }}>{label}</span>
              <span style={{ display: 'block', fontSize: 12, color: '#64748b' }}>{desc}</span>
            </span>
          </button>
        ))}
        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <button onClick={onCancel} style={{ ...ghostBtn, flex: 1, justifyContent: 'center' }}>Plus tard</button>
          <button onClick={() => onConfirm(choice)} style={{ ...primaryBtn, flex: 1, justifyContent: 'center' }}>
            <Check size={15} /> Valider
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 22, marginBottom: 16 }}>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px', fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{icon} {title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

const input: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
const primaryBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 20px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: 'pointer' };
const ghostBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', background: '#fff', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 9, background: '#fff' };
const iconBtn: React.CSSProperties = { display: 'flex', border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 };
const miniBtn: React.CSSProperties = { display: 'flex', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#64748b', padding: 1, borderRadius: 4, lineHeight: 1 };
const errBox: React.CSSProperties = { padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: 13, marginBottom: 14 };
const hint: React.CSSProperties = { fontSize: 12, color: '#94a3b8', marginTop: 8 };
