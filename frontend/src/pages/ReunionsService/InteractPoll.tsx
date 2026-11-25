import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import axios from 'axios';
import { X, Sparkles, Clock, Send, Upload, Trash2 } from 'lucide-react';

export interface PollOptionResult { label: string; count: number; percent: number; }
export interface PollResults {
    total: number;
    anonymous?: boolean;
    visibility?: string;
    by_option: PollOptionResult[];
    texts: string[];
    average: number | null;
    distribution: { value: number; count: number }[];
    /** 🧩 Classement moyen (sondage `ordering`) : rang 1 = le plus en tête. */
    ranking?: { label: string; count: number; averageRank: number | null; firstPlaces: number }[];
    responses?: { name: string; answer: unknown }[];
}
export interface Poll {
    id: number;
    meeting_id: number;
    question: string;
    type: string;
    options: string[];
    explanation?: string | null;
    image?: string | null;
    status: 'open' | 'closed' | string;
    anonymous?: boolean;
    visibility?: 'nominatif' | 'semi_anonyme' | 'totalement_anonyme';
    created_by?: string | null;
    created_by_name?: string | null;
    created_at?: string;
    /** Format d'origine dans le catalogue Interact'Ivry (affichage). */
    interact_type?: string | null;
    interact_label?: string | null;
    interact_code?: string | null;
    results?: PollResults;
    my_answer?: unknown;
}

/** Libellés natifs DSIHub (repli + affichage des sondages déjà lancés). */
const TYPE_LABELS: Record<string, string> = {
    single: 'Choix unique',
    multiple: 'Choix multiples',
    truefalse: 'Vrai ou Faux',
    ordering: 'Puzzle / classement',
    slider: 'Curseur (estimation)',
    stars: "Échelle d'avis (étoiles)",
    open: 'Réponse ouverte',
    wordcloud: 'Nuage de mots',
    idea: 'Boîte à idées',
};

interface PollTypeOption {
    /** Identifiant du format Interact'Ivry (clé du sélecteur). */
    value: string;
    /** Type natif DSIHub qui porte le rendu (null = non pris en charge). */
    pollType: string | null;
    label: string;
    icon: string;
    groupId: string;
    supported: boolean;
    note?: string;
}
interface PollTypeGroup { id: string; label: string; }

/** Repli immédiat si le catalogue Interact'Ivry est injoignable. */
const TYPE_GROUPS_FALLBACK: PollTypeGroup[] = [
    { id: 'choix', label: '🎲 Quiz & connaissances' },
    { id: 'libre', label: '✍️ Contributions libres & avis' },
];
const TYPES_FALLBACK: PollTypeOption[] = [
    { value: 'single', pollType: 'single', label: 'Choix unique', icon: '🎯', groupId: 'choix', supported: true },
    { value: 'multiple', pollType: 'multiple', label: 'Choix multiples', icon: '☑️', groupId: 'choix', supported: true },
    { value: 'true_false', pollType: 'truefalse', label: 'Vrai ou Faux', icon: '✅', groupId: 'choix', supported: true },
    { value: 'ordering', pollType: 'ordering', label: 'Puzzle / classement', icon: '🧩', groupId: 'choix', supported: true },
    { value: 'slider', pollType: 'slider', label: 'Curseur (estimation)', icon: '🎚️', groupId: 'choix', supported: true },
    { value: 'scale', pollType: 'stars', label: "Échelle d'avis (étoiles)", icon: '⭐', groupId: 'libre', supported: true },
    { value: 'text', pollType: 'open', label: 'Réponse ouverte', icon: '💬', groupId: 'libre', supported: true },
    { value: 'wordcloud', pollType: 'wordcloud', label: 'Nuage de mots', icon: '☁️', groupId: 'libre', supported: true },
    { value: 'idea', pollType: 'idea', label: 'Boîte à idées', icon: '💡', groupId: 'libre', supported: true },
];

function resizeImageFile(file: File, maxDim = 1400, quality = 0.88): Promise<string> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            try {
                const ratio = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
                const w = Math.max(1, Math.round((img.width || 1) * ratio));
                const h = Math.max(1, Math.round((img.height || 1) * ratio));
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                if (!ctx) { reject(new Error('canvas')); return; }
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, w, h);
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', quality));
            } catch (e) { reject(e); } finally { URL.revokeObjectURL(url); }
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
        img.src = url;
    });
}

const typeLabel = (t: string) => TYPE_LABELS[t] || t;

function formatAnswer(poll: Poll, answer: unknown): string {
    if (answer === null || answer === undefined || answer === '') return '—';
    if (poll.type === 'single') return poll.options[Number(answer)] ?? String(answer);
    if (poll.type === 'truefalse') return answer ? 'Vrai' : 'Faux';
    if (poll.type === 'multiple') {
        return Array.isArray(answer)
            ? answer.map(v => poll.options[Number(v)] ?? String(v)).join(', ')
            : String(answer);
    }
    if (poll.type === 'ordering') {
        return Array.isArray(answer)
            ? answer.map(v => poll.options[Number(v)] ?? String(v)).join(' → ')
            : String(answer);
    }
    if (poll.type === 'stars') return `${answer} ★`;
    return String(answer);
}
const needsOptions = (t: string) => t === 'single' || t === 'multiple' || t === 'ordering';

export function PollComposerModal({
    token, meetingId, onClose, onCreated,
}: {
    token: string;
    meetingId: number;
    onClose: () => void;
    onCreated: () => void;
}) {
    const [type, setType] = useState('single');
    const [question, setQuestion] = useState('');
    const [options, setOptions] = useState<string[]>(['', '']);
    const [explanation, setExplanation] = useState('');
    const [image, setImage] = useState('');
    const [visibility, setVisibility] = useState<'nominatif' | 'semi_anonyme' | 'totalement_anonyme'>('nominatif');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    // 📚 Catalogue dynamique : DSIHub lit les formats d'Interact'Ivry à
    // l'ouverture. Un nouveau format y apparaît sans redéploiement de DSIHub.
    const [types, setTypes] = useState<PollTypeOption[]>(TYPES_FALLBACK);
    const [typeGroups, setTypeGroups] = useState<PollTypeGroup[]>(TYPE_GROUPS_FALLBACK);

    const headers = { headers: { Authorization: `Bearer ${token}` } };

    useEffect(() => {
        let cancelled = false;
        axios.get('/api/reunions-service/interact/formats', headers)
            .then(({ data }) => {
                if (cancelled || !Array.isArray(data?.types) || data.types.length === 0) return;
                // Chaque format Interact'Ivry reste VISIBLE et distinct ; sa
                // `family` est projetée sur un type natif DSIHub pour le
                // rendu. Les familles inconnues restent désactivées
                // (mise à jour de DSIHub requise).
                const options: PollTypeOption[] = [];
                const seen = new Set<string>();
                for (const t of data.types) {
                    if (!t.id || seen.has(t.id)) continue;
                    seen.add(t.id);
                    options.push({
                        value: t.id,
                        pollType: t.pollType || null,
                        label: String(t.label || t.id),
                        icon: String(t.icon || '•'),
                        groupId: String(t.group || 'choix'),
                        supported: !!t.supported,
                        note: t.note,
                    });
                }
                setTypes(options);
                if (Array.isArray(data.groups) && data.groups.length) {
                    setTypeGroups(data.groups);
                }
                // Le type courant a disparu/est devenu non supporté : on
                // bascule sur le premier format utilisable.
                setType(prev => {
                    if (options.find(o => o.value === prev)?.supported) return prev;
                    return options.find(o => o.supported)?.value || prev;
                });
            })
            .catch(() => { /* repli local : DSIHub reste utilisable */ });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Format sélectionné dans le catalogue (id Interact) → type natif DSIHub.
    const selectedType = types.find(t => t.value === type) || null;
    const selectedPollType = selectedType?.pollType || null;
    const selectedNeedsOptions = !!selectedPollType && needsOptions(selectedPollType);

    const launch = async () => {
        if (!question.trim()) { setError('Énoncé requis.'); return; }
        if (!selectedType?.supported || !selectedPollType) {
            setError('Ce format nécessite une mise à jour de DSIHub.');
            return;
        }
        if (selectedNeedsOptions && options.filter(o => o.trim()).length < 2) {
            setError('Ajoutez au moins deux propositions.');
            return;
        }
        setBusy(true);
        setError('');
        try {
            await axios.post(`/api/reunions-service/meetings/${meetingId}/polls`, {
                question: question.trim(),
                // Type natif (rendu DSIHub) + format Interact d'origine :
                // le libellé exact du catalogue est conservé pour l'affichage.
                type: selectedPollType,
                interactType: selectedType.value,
                interactLabel: selectedType.label,
                options: selectedNeedsOptions ? options.map(o => o.trim()).filter(Boolean) : [],
                explanation,
                image: image || null,
                visibility,
            }, headers);
            onCreated();
            onClose();
        } catch (e) {
            const err = e as { response?: { data?: { error?: string } }; message?: string };
            setError(err?.response?.data?.error || err?.message || 'Impossible de lancer l\'INTERACT');
        } finally {
            setBusy(false);
        }
    };

    const onImage = async (file: File | null) => {
        if (!file) return;
        try {
            setImage(await resizeImageFile(file));
        } catch {
            const reader = new FileReader();
            reader.onload = () => setImage(String(reader.result || ''));
            reader.readAsDataURL(file);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1350, padding: 16 }}>
            <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.3rem .4rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Sparkles size={18} color="#7c3aed" /> Nouvel INTERACT
                    </h3>
                    <button onClick={onClose} disabled={busy} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={18} /></button>
                </div>
                <div style={{ padding: '.4rem 1.3rem 1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                        <label style={labelStyle}>Type de question</label>
                        <select value={type} onChange={e => setType(e.target.value)} style={inputStyle} disabled={busy}>
                            {typeGroups.map(g => {
                                const opts = types.filter(t => t.groupId === g.id);
                                if (opts.length === 0) return null;
                                return (
                                    <optgroup key={g.id} label={g.label}>
                                        {opts.map(t => (
                                            <option key={t.value} value={t.value} disabled={!t.supported} title={t.note}>
                                                {t.icon} {t.label}{t.supported ? '' : ' — mise à jour DSIHub requise'}
                                            </option>
                                        ))}
                                    </optgroup>
                                );
                            })}
                        </select>
                        {types.some(t => !t.supported) && (
                            <div style={{ fontSize: '.72rem', color: '#b45309', marginTop: 4 }}>
                                Certains formats d’Interact’Ivry nécessitent une mise à jour de DSIHub pour être lancés ici.
                            </div>
                        )}
                    </div>
                    <div>
                        <label style={labelStyle}>Énoncé / consigne</label>
                        <input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Quelle est la question ?" style={inputStyle} disabled={busy} />
                    </div>
                    {selectedNeedsOptions && (
                        <div>
                            <label style={labelStyle}>
                                {selectedPollType === 'ordering' ? 'Éléments à classer' : 'Propositions'}
                            </label>
                            {options.map((o, i) => (
                                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                                    <input value={o} onChange={e => setOptions(prev => prev.map((x, j) => j === i ? e.target.value : x))} placeholder={`Proposition ${i + 1}`} style={{ ...inputStyle, flex: 1 }} disabled={busy} />
                                    <button onClick={() => setOptions(prev => prev.filter((_, j) => j !== i))} disabled={busy || options.length <= 2} style={iconBtn} title="Supprimer"><X size={14} /></button>
                                </div>
                            ))}
                            <button onClick={() => setOptions(prev => [...prev, ''])} disabled={busy || options.length >= 8} style={{ ...secondaryBtn, padding: '.35rem .7rem', fontSize: '.78rem' }}>+ Ajouter une proposition</button>
                        </div>
                    )}
                    <div>
                        <label style={labelStyle}>Explication affichée à la réponse (optionnel)</label>
                        <textarea value={explanation} onChange={e => setExplanation(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} disabled={busy} />
                    </div>
                    <div>
                        <label style={labelStyle}>Confidentialité des réponses</label>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button type="button" onClick={() => setVisibility('nominatif')} disabled={busy}
                                style={{ flex: '1 1 150px', textAlign: 'left', padding: '.55rem .7rem', borderRadius: 9, border: `1.5px solid ${visibility === 'nominatif' ? '#0078a4' : '#e2e8f0'}`, background: visibility === 'nominatif' ? '#f0f9ff' : '#fff', cursor: 'pointer' }}>
                                <b style={{ fontSize: '.82rem', color: visibility === 'nominatif' ? '#0078a4' : '#334155' }}>Nominatif</b>
                                <div style={{ fontSize: '.72rem', color: '#64748b' }}>Tout le monde voit qui a répondu et ce qu’il a répondu.</div>
                            </button>
                            <button type="button" onClick={() => setVisibility('semi_anonyme')} disabled={busy}
                                style={{ flex: '1 1 150px', textAlign: 'left', padding: '.55rem .7rem', borderRadius: 9, border: `1.5px solid ${visibility === 'semi_anonyme' ? '#0078a4' : '#e2e8f0'}`, background: visibility === 'semi_anonyme' ? '#f0f9ff' : '#fff', cursor: 'pointer' }}>
                                <b style={{ fontSize: '.82rem', color: visibility === 'semi_anonyme' ? '#0078a4' : '#334155' }}>Semi-anonyme</b>
                                <div style={{ fontSize: '.72rem', color: '#64748b' }}>Résultats globaux pour les participants ; le lanceur, le maître du temps et les admins peuvent voir qui a répondu.</div>
                            </button>
                            <button type="button" onClick={() => setVisibility('totalement_anonyme')} disabled={busy}
                                style={{ flex: '1 1 150px', textAlign: 'left', padding: '.55rem .7rem', borderRadius: 9, border: `1.5px solid ${visibility === 'totalement_anonyme' ? '#0078a4' : '#e2e8f0'}`, background: visibility === 'totalement_anonyme' ? '#f0f9ff' : '#fff', cursor: 'pointer' }}>
                                <b style={{ fontSize: '.82rem', color: visibility === 'totalement_anonyme' ? '#0078a4' : '#334155' }}>Totalement anonyme</b>
                                <div style={{ fontSize: '.72rem', color: '#64748b' }}>Personne ne voit qui a répondu, pas même les administrateurs.</div>
                            </button>
                        </div>
                    </div>
                    <div>
                        <label style={labelStyle}>Image (optionnel)</label>
                        <label
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => { e.preventDefault(); void onImage(e.dataTransfer.files?.[0] || null); }}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '.7rem .8rem', border: '1.5px dashed #cbd5e1', borderRadius: 9, background: '#fbfdff', color: '#64748b', fontSize: '.85rem', cursor: busy ? 'default' : 'pointer' }}
                        >
                            <Upload size={16} />
                            <span style={{ fontWeight: 700, color: '#334155' }}>{image ? "Remplacer l'image" : 'Choisir une image'}</span>
                            <span style={{ fontSize: '.74rem' }}>ou glisser-déposer</span>
                            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => void onImage(e.target.files?.[0] || null)} disabled={busy} />
                        </label>
                        {image && (
                            <div style={{ marginTop: 6, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                <img src={image} alt="" style={{ display: 'block', maxWidth: 220, maxHeight: 140, width: 'auto', height: 'auto', objectFit: 'contain', borderRadius: 8, border: '1px solid #e2e8f0' }} />
                                <button onClick={() => setImage('')} disabled={busy} style={iconBtn} title="Retirer l'image"><X size={14} /></button>
                            </div>
                        )}
                    </div>
                    {error && <div style={{ color: '#b91c1c', fontSize: '.82rem' }}>{error}</div>}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '.85rem 1.3rem', borderTop: '1px solid #f1f5f9', background: '#fbfdff' }}>
                    <button onClick={onClose} disabled={busy} style={{ ...secondaryBtn }}>Annuler</button>
                    <button onClick={launch} disabled={busy} style={{ ...primaryBtn, opacity: busy ? .7 : 1 }}>
                        <Sparkles size={15} /> {busy ? 'Lancement…' : "Lancer l'INTERACT"}
                    </button>
                </div>
            </div>
        </div>
    );
}

export function PollAnswerForm({ poll, onSubmit, busy }: { poll: Poll; onSubmit: (answer: unknown) => void; busy?: boolean }) {
    const [single, setSingle] = useState<number | null>(null);
    const [multiple, setMultiple] = useState<number[]>([]);
    const [text, setText] = useState('');
    const [value, setValue] = useState(50);
    // 🧩 Classement : indices des éléments dans l'ordre choisi.
    const [order, setOrder] = useState<number[]>(() => poll.options.map((_, i) => i));

    useEffect(() => {
        setOrder(poll.options.map((_, i) => i));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [poll.id, poll.options.length]);

    const move = (pos: number, delta: number) => {
        const target = pos + delta;
        if (target < 0 || target >= order.length) return;
        setOrder(prev => {
            const next = [...prev];
            [next[pos], next[target]] = [next[target], next[pos]];
            return next;
        });
    };

    const submit = () => {
        if (poll.type === 'single') { if (single === null) return; onSubmit(single); }
        else if (poll.type === 'multiple') { if (!multiple.length) return; onSubmit(multiple); }
        else if (poll.type === 'truefalse') { if (single === null) return; onSubmit(single === 0); }
        else if (poll.type === 'ordering') { if (order.length < 2) return; onSubmit(order); }
        else if (poll.type === 'open' || poll.type === 'wordcloud' || poll.type === 'idea') { if (!text.trim()) return; onSubmit(text.trim()); }
        else if (poll.type === 'stars') { if (single === null) return; onSubmit(single + 1); }
        else if (poll.type === 'slider') { onSubmit(value); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {poll.image && (
                <img
                    src={poll.image}
                    alt=""
                    style={{ display: 'block', margin: '0 auto', maxWidth: '100%', maxHeight: 220, width: 'auto', height: 'auto', objectFit: 'contain', borderRadius: 8, alignSelf: 'center' }}
                />
            )}
            {(poll.type === 'single' || poll.type === 'truefalse') && (
                (poll.type === 'truefalse' ? ['Vrai', 'Faux'] : poll.options).map((label, i) => (
                    <label key={i} style={choiceStyle(single === i)}>
                        <input type="radio" checked={single === i} onChange={() => setSingle(i)} disabled={busy} /> {label}
                    </label>
                ))
            )}
            {poll.type === 'multiple' && poll.options.map((label, i) => (
                <label key={i} style={choiceStyle(multiple.includes(i))}>
                    <input type="checkbox" checked={multiple.includes(i)} onChange={e => setMultiple(prev => e.target.checked ? [...prev, i] : prev.filter(x => x !== i))} disabled={busy} /> {label}
                </label>
            ))}
            {poll.type === 'ordering' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: '.78rem', color: '#64748b' }}>
                        Classez du 1ᵉʳ au dernier :
                    </div>
                    {order.map((optIdx, pos) => (
                        <div key={optIdx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '.45rem .6rem', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }}>
                            <span style={{ width: 22, fontWeight: 800, color: '#0078a4' }}>{pos + 1}</span>
                            <span style={{ flex: 1, fontSize: '.85rem' }}>{poll.options[optIdx]}</span>
                            <button type="button" aria-label={`Monter « ${poll.options[optIdx]} »`} disabled={busy || pos === 0} onClick={() => move(pos, -1)} style={iconBtn}>↑</button>
                            <button type="button" aria-label={`Descendre « ${poll.options[optIdx]} »`} disabled={busy || pos === order.length - 1} onClick={() => move(pos, 1)} style={iconBtn}>↓</button>
                        </div>
                    ))}
                </div>
            )}
            {(poll.type === 'open' || poll.type === 'wordcloud' || poll.type === 'idea') && (
                <textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder="Votre réponse…" style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} disabled={busy} />
            )}
            {poll.type === 'stars' && (
                <div style={{ display: 'flex', gap: 6, fontSize: 24 }}>
                    {[1, 2, 3, 4, 5].map(n => (
                        <button key={n} onClick={() => setSingle(n - 1)} disabled={busy} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 26, color: (single ?? -1) >= n - 1 ? '#f59e0b' : '#cbd5e1' }}>★</button>
                    ))}
                </div>
            )}
            {poll.type === 'slider' && (
                <div>
                    <input type="range" min={0} max={100} step={1} value={value} onChange={e => setValue(Number(e.target.value))} style={{ width: '100%' }} disabled={busy} />
                    <div style={{ textAlign: 'center', fontWeight: 800, color: '#0078a4' }}>{value}</div>
                </div>
            )}
            <button onClick={submit} disabled={busy} style={{ ...primaryBtn, alignSelf: 'flex-start' }}>
                <Send size={15} /> Envoyer ma réponse
            </button>
        </div>
    );
}

export function PollResultsView({ poll }: { poll: Poll }) {
    const r = poll.results;
    if (!r) return null;
    const vis = poll.visibility || (poll.anonymous ? 'semi_anonyme' : 'nominatif');
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: '.75rem', color: '#64748b' }}>{r.total} réponse{r.total > 1 ? 's' : ''}</div>
            {r.by_option.map((o, i) => (
                <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', color: '#334155' }}>
                        <span>{o.label}</span><span style={{ fontWeight: 700 }}>{o.percent} % ({o.count})</span>
                    </div>
                    <div style={{ height: 6, background: '#eef2f7', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${o.percent}%`, background: '#0078a4' }} />
                    </div>
                </div>
            ))}
            {poll.type === 'ordering' && (r.ranking?.length || 0) > 0 && (
                <div>
                    <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', marginBottom: 4 }}>
                        Classement moyen
                    </div>
                    {r.ranking!.map((row, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '.8rem', color: '#334155', padding: '2px 0' }}>
                            <span><b style={{ color: '#0078a4' }}>#{i + 1}</b> {row.label}</span>
                            <span>
                                {row.averageRank !== null ? `rang moyen ${row.averageRank}` : '—'}
                                {row.firstPlaces ? ` · ${row.firstPlaces}× 1ᵉʳ` : ''}
                            </span>
                        </div>
                    ))}
                </div>
            )}
            {(poll.type === 'open' || poll.type === 'wordcloud' || poll.type === 'idea') && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {r.texts.map((t, i) => (
                        <span key={i} style={{ fontSize: '.78rem', background: poll.type === 'wordcloud' ? '#ede9fe' : '#f1f5f9', color: poll.type === 'wordcloud' ? '#6d28d9' : '#334155', borderRadius: 999, padding: '2px 9px' }}>{t}</span>
                    ))}
                </div>
            )}
            {r.average !== null && (
                <div style={{ fontSize: '.85rem', fontWeight: 800, color: '#0078a4' }}>
                    Moyenne : {r.average}{poll.type === 'stars' ? ' / 5' : ''} ({r.total} réponse{r.total > 1 ? 's' : ''})
                </div>
            )}
            {vis === 'semi_anonyme' && (
                <div style={{ fontSize: '.74rem', color: '#94a3b8' }}>Semi-anonyme : résultats globaux ; le lanceur, le maître du temps et les admins peuvent voir qui a répondu.</div>
            )}
            {vis === 'totalement_anonyme' && (
                <div style={{ fontSize: '.74rem', color: '#94a3b8' }}>Totalement anonyme : personne ne peut voir qui a répondu.</div>
            )}
            {vis === 'nominatif' && (r.responses?.length || 0) > 0 && (
                <div style={{ marginTop: 4, borderTop: '1px dashed #e2e8f0', paddingTop: 6 }}>
                    <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', marginBottom: 4 }}>Qui a répondu</div>
                    {r.responses!.map((resp, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '.78rem', color: '#334155', padding: '1px 0' }}>
                            <span style={{ fontWeight: 600 }}>{resp.name}</span>
                            <span style={{ color: '#0078a4', fontWeight: 700 }}>{formatAnswer(poll, resp.answer)}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function PollCard({
    poll, canManage, myAnswer, onAnswer, onClose, busy, token, canDelete, onDelete,
}: {
    poll: Poll;
    canManage: boolean;
    myAnswer: unknown;
    onAnswer: (answer: unknown) => void;
    onClose: () => void;
    busy?: boolean;
    token: string;
    canDelete?: boolean;
    onDelete?: () => void;
}) {
    const open = poll.status === 'open';
    const vis = poll.visibility || (poll.anonymous ? 'semi_anonyme' : 'nominatif');
    const canReveal = canManage && vis !== 'totalement_anonyme'
        && (vis !== 'nominatif' || !(poll.results?.responses?.length));
    const answered = myAnswer !== null && myAnswer !== undefined;
    const [revealed, setRevealed] = useState<{ name: string; answer: unknown }[] | null>(null);
    const [revealBusy, setRevealBusy] = useState(false);
    const [revealError, setRevealError] = useState('');
    const reveal = async () => {
        setRevealBusy(true);
        try {
            const res = await axios.get(`/api/reunions-service/polls/${poll.id}/responses`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setRevealed(Array.isArray(res.data?.responses) ? res.data.responses : []);
        } catch (e) {
            const err = e as { response?: { status?: number; data?: { error?: string } } };
            setRevealed([]);
            setRevealError(err?.response?.status === 404
                ? 'Liste des noms indisponible : redémarrez le backend pour activer cet endpoint.'
                : (err?.response?.data?.error || 'Impossible de charger les noms.'));
        } finally {
            setRevealBusy(false);
        }
    };
    return (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '.85rem 1rem', background: '#fff', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '.92rem' }}>{poll.question}</div>
                    <div style={{ fontSize: '.72rem', color: '#94a3b8' }}>
                        {poll.interact_label || typeLabel(poll.type)} · lancé par {poll.created_by_name || poll.created_by || '—'}
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '.68rem', fontWeight: 800, borderRadius: 999, padding: '2px 8px', background: open ? '#dcfce7' : '#f1f5f9', color: open ? '#15803d' : '#64748b' }}>
                        {open ? 'ouvert' : 'clos'}
                    </span>
                    {canDelete && onDelete && (
                        <button onClick={onDelete} disabled={busy} title="Supprimer l'INTERACT" style={iconBtn}>
                            <Trash2 size={14} />
                        </button>
                    )}
                </div>
            </div>
            {poll.explanation && <div style={{ fontSize: '.78rem', color: '#64748b', marginBottom: 6 }}>{poll.explanation}</div>}
            {open && !answered ? (
                <PollAnswerForm poll={poll} onSubmit={onAnswer} busy={busy} />
            ) : (
                <PollResultsView poll={poll} />
            )}
            {canReveal && (
                <div style={{ marginTop: 8 }}>
                    {!revealed && (
                        <button onClick={reveal} disabled={revealBusy} style={{ ...secondaryBtn, padding: '.35rem .7rem', fontSize: '.75rem' }}>
                            {revealBusy ? 'Chargement…' : 'Voir qui a répondu'}
                        </button>
                    )}
                    {revealError && <div style={{ fontSize: '.75rem', color: '#b45309', marginTop: 4 }}>{revealError}</div>}
                    {revealed && (
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '.5rem .6rem' }}>
                            <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', marginBottom: 4 }}>Réponses nominatives (visible lanceur / maître / admin)</div>
                            {revealed.length === 0 && <div style={{ fontSize: '.78rem', color: '#94a3b8' }}>Aucune réponse.</div>}
                            {revealed.map((resp, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '.78rem', color: '#334155' }}>
                                    <span style={{ fontWeight: 600 }}>{resp.name}</span>
                                    <span style={{ color: '#0078a4', fontWeight: 700 }}>{formatAnswer(poll, resp.answer)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {open && canManage && (
                <button onClick={onClose} disabled={busy} style={{ ...secondaryBtn, marginTop: 8, padding: '.35rem .7rem', fontSize: '.75rem' }}>
                    <Clock size={13} /> Clôturer l'INTERACT
                </button>
            )}
        </div>
    );
}

const labelStyle: CSSProperties = { display: 'block', fontSize: '.76rem', fontWeight: 700, color: '#334155', marginBottom: 4 };
const inputStyle: CSSProperties = { width: '100%', padding: '.55rem .7rem', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '.88rem', boxSizing: 'border-box', outline: 'none' };
const primaryBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 9, padding: '.55rem 1rem', fontWeight: 700, fontSize: '.84rem', cursor: 'pointer' };
const secondaryBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', color: '#334155', border: '1px solid #e2e8f0', borderRadius: 9, padding: '.55rem 1rem', fontWeight: 700, fontSize: '.84rem', cursor: 'pointer' };
const iconBtn: CSSProperties = { background: '#f1f5f9', border: 'none', borderRadius: 7, width: 30, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b', flexShrink: 0 };
const choiceStyle = (active: boolean): CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 8, padding: '.45rem .6rem', border: `1px solid ${active ? '#0078a4' : '#e2e8f0'}`, background: active ? '#f0f9ff' : '#fff', borderRadius: 8, cursor: 'pointer', fontSize: '.85rem' });
