import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { X, Users, UserPlus, Search, Loader2, Check } from 'lucide-react';
import { useADSearch } from '../utils/useADSearch';

export interface MeetingParticipantInput {
    email: string;
    name: string;
    fonction?: string | null;
    direction?: string | null;
    service?: string | null;
}

interface ParticipantGroup {
    key: string;
    label: string;
    type: 'role' | 'custom' | 'ad';
    member_count?: number;
    description?: string | null;
}

interface Props {
    token: string;
    participants: MeetingParticipantInput[];
    onClose: () => void;
    onLaunch: (participants: MeetingParticipantInput[]) => void;
    onSkip: () => void;
    launching?: boolean;
}

const keyOf = (email: string) => String(email || '').trim().toLowerCase();

interface ApiErrorLike {
    response?: { data?: { error?: string } };
}

/**
 * Modale affichée AVANT l'analyse IA d'une réunion détectée comme tenue en
 * PRÉSENTIEL (transcript à un seul locuteur, celui qui a lancé l'enregistrement
 * Teams depuis la salle). Permet d'enrichir la liste des personnes présentes —
 * indispensable pour que l'IA puisse tenter d'identifier l'assistance :
 *   - recherche agent une par une (AD / RH Studio),
 *   - ajout en masse par groupe (directeurs généraux, directeurs, responsables
 *     de service définis dans /admin/ville › Encadrants, groupes particuliers,
 *     groupes AD).
 */
export default function PhysicalMeetingParticipantsModal({ token, participants, onClose, onLaunch, onSkip, launching }: Props) {
    const [selected, setSelected] = useState<Map<string, MeetingParticipantInput>>(() => {
        const m = new Map<string, MeetingParticipantInput>();
        for (const p of participants || []) {
            const k = keyOf(p.email);
            if (k.includes('@')) m.set(k, { email: k, name: p.name || k });
        }
        return m;
    });
    const [tab, setTab] = useState<'agent' | 'group'>('agent');

    // Recherche agent (même outil que le reste du Hub)
    const ad = useADSearch(token);

    // Groupes
    const [groups, setGroups] = useState<ParticipantGroup[]>([]);
    const [groupsLoading, setGroupsLoading] = useState(false);
    const [groupsError, setGroupsError] = useState('');
    const [adGroups, setAdGroups] = useState<ParticipantGroup[]>([]);
    const [adGroupsLoading, setAdGroupsLoading] = useState(false);
    const [showAdGroups, setShowAdGroups] = useState(false);
    const [openGroupKey, setOpenGroupKey] = useState<string | null>(null);
    const [groupMembers, setGroupMembers] = useState<Record<string, MeetingParticipantInput[]>>({});
    const [membersLoading, setMembersLoading] = useState<string | null>(null);
    const [membersError, setMembersError] = useState('');

    useEffect(() => {
        let cancelled = false;
        setGroupsLoading(true);
        axios.get('/api/transcriptmanager/participant-groups', { headers: { Authorization: `Bearer ${token}` } })
            .then(res => { if (!cancelled) setGroups(Array.isArray(res.data?.groups) ? res.data.groups : []); })
            .catch(err => { if (!cancelled) setGroupsError(err?.response?.data?.error || 'Impossible de charger les groupes'); })
            .finally(() => { if (!cancelled) setGroupsLoading(false); });
        return () => { cancelled = true; };
    }, [token]);

    const addPerson = (p: MeetingParticipantInput) => {
        const k = keyOf(p.email);
        if (!k.includes('@')) return;
        setSelected(prev => {
            const next = new Map(prev);
            if (next.has(k)) next.delete(k);
            else next.set(k, { email: k, name: p.name || k, fonction: p.fonction, direction: p.direction, service: p.service });
            return next;
        });
    };

    const toggleGroupMember = (member: MeetingParticipantInput) => addPerson(member);

    const loadGroupMembers = async (group: ParticipantGroup) => {
        if (openGroupKey === group.key) { setOpenGroupKey(null); return; }
        setOpenGroupKey(group.key);
        setMembersError('');
        if (groupMembers[group.key]) return;
        setMembersLoading(group.key);
        try {
            const res = await axios.get('/api/transcriptmanager/participant-groups/members', {
                params: { key: group.key },
                headers: { Authorization: `Bearer ${token}` },
            });
            setGroupMembers(prev => ({ ...prev, [group.key]: Array.isArray(res.data?.members) ? res.data.members : [] }));
        } catch (err) {
            const e = err as ApiErrorLike;
            setMembersError(e?.response?.data?.error || 'Impossible de charger les membres du groupe');
        } finally {
            setMembersLoading(null);
        }
    };

    const addWholeGroup = (group: ParticipantGroup) => {
        const members = groupMembers[group.key] || [];
        setSelected(prev => {
            const next = new Map(prev);
            for (const m of members) {
                const k = keyOf(m.email);
                if (k.includes('@')) next.set(k, { email: k, name: m.name || k, fonction: m.fonction, direction: m.direction, service: m.service });
            }
            return next;
        });
    };

    const loadAdGroups = async () => {
        if (adGroups.length > 0) { setShowAdGroups(true); return; }
        setShowAdGroups(true);
        setAdGroupsLoading(true);
        try {
            const res = await axios.get('/api/transcriptmanager/participant-ad-groups', { headers: { Authorization: `Bearer ${token}` } });
            setAdGroups(Array.isArray(res.data?.groups) ? res.data.groups : []);
        } catch (err) {
            const e = err as ApiErrorLike;
            setMembersError(e?.response?.data?.error || 'Impossible de charger les groupes AD');
        } finally {
            setAdGroupsLoading(false);
        }
    };

    const selectedList = useMemo(() => Array.from(selected.values()), [selected]);

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300 }}>
            <div style={{ background: 'white', borderRadius: 16, width: '94%', maxWidth: 760, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem 0.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Users size={18} /> Réunion en présentiel — participants
                    </h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}><X size={18} /></button>
                </div>

                <div style={{ padding: '0 1.5rem 0.5rem', fontSize: '0.82rem', color: '#475569', lineHeight: 1.6 }}>
                    Cette réunion a été enregistrée depuis un <strong>seul compte Teams</strong> : elle s'est tenue <strong>en présentiel</strong> et plusieurs personnes y ont participé.
                    Ajoutez les personnes présentes pour aider l'IA à identifier l'assistance et produire un compte rendu fiable.
                </div>

                <div style={{ display: 'flex', gap: 8, padding: '0 1.5rem 0.75rem' }}>
                    <button
                        onClick={() => setTab('agent')}
                        style={{ flex: 1, padding: '0.5rem', borderRadius: 8, border: '1px solid ' + (tab === 'agent' ? '#0078A4' : '#E2E8F0'), background: tab === 'agent' ? '#F0F9FF' : 'white', color: tab === 'agent' ? '#0078A4' : '#64748B', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    >
                        <Search size={14} /> Rechercher un agent
                    </button>
                    <button
                        onClick={() => setTab('group')}
                        style={{ flex: 1, padding: '0.5rem', borderRadius: 8, border: '1px solid ' + (tab === 'group' ? '#0078A4' : '#E2E8F0'), background: tab === 'group' ? '#F0F9FF' : 'white', color: tab === 'group' ? '#0078A4' : '#64748B', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    >
                        <Users size={14} /> Par groupe
                    </button>
                </div>

                <div style={{ padding: '0 1.5rem', overflowY: 'auto', flex: 1, minHeight: 0 }}>
                    {tab === 'agent' && (
                        <div style={{ position: 'relative', marginBottom: 12 }}>
                            <input
                                type="text"
                                value={ad.query}
                                onChange={e => ad.setQuery(e.target.value)}
                                placeholder="Nom, prénom ou email de l'agent…"
                                style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #CBD5E1', borderRadius: 8, fontSize: '0.85rem', boxSizing: 'border-box' }}
                            />
                            {ad.searching && <span style={{ position: 'absolute', right: 10, top: 8, fontSize: '0.72rem', color: '#94A3B8' }}>…</span>}
                            {ad.results.length > 0 && (
                                <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, marginTop: 6, maxHeight: 220, overflowY: 'auto' }}>
                                    {ad.results.map(u => {
                                        const isSel = selected.has(keyOf(u.email));
                                        return (
                                            <button
                                                key={u.username || u.email}
                                                onClick={() => addPerson({ email: u.email, name: u.displayName, fonction: u.fonction, direction: u.direction, service: u.service })}
                                                style={{ width: '100%', textAlign: 'left', padding: '7px 10px', border: 'none', borderBottom: '1px solid #F1F5F9', background: isSel ? '#F0FDF4' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
                                            >
                                                <span>
                                                    <span style={{ display: 'block', fontWeight: 600, color: '#1E293B', fontSize: '0.82rem' }}>{u.displayName}</span>
                                                    <span style={{ display: 'block', color: '#64748B', fontSize: '0.72rem' }}>{u.email || "Pas d'email AD"}{u.service ? ` · ${u.service}` : ''}</span>
                                                </span>
                                                {isSel ? <Check size={15} color="#15803D" /> : <UserPlus size={15} color="#94A3B8" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                            {ad.error && <div style={{ color: '#B91C1C', fontSize: '0.78rem', marginTop: 6 }}>{ad.error}</div>}
                        </div>
                    )}

                    {tab === 'group' && (
                        <div>
                            {groupsLoading && <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748B', fontSize: '0.82rem' }}><Loader2 size={14} className="animate-spin" /> Chargement des groupes…</div>}
                            {groupsError && <div style={{ color: '#B91C1C', fontSize: '0.8rem' }}>{groupsError}</div>}
                            {!groupsLoading && !groupsError && (
                                <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
                                    {groups.map(g => {
                                        const open = openGroupKey === g.key;
                                        const members = groupMembers[g.key] || [];
                                        return (
                                            <div key={g.key} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                <button
                                                    onClick={() => loadGroupMembers(g)}
                                                    style={{ width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', background: open ? '#F8FAFC' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
                                                >
                                                    <span style={{ fontWeight: 600, color: '#1E293B', fontSize: '0.82rem' }}>
                                                        {g.label}
                                                        {typeof g.member_count === 'number' && <span style={{ fontWeight: 500, color: '#94A3B8' }}> · {g.member_count}</span>}
                                                    </span>
                                                    <span style={{ fontSize: '0.72rem', color: '#0078A4', fontWeight: 700 }}>{open ? 'Réduire' : 'Voir les membres'}</span>
                                                </button>
                                                {open && (
                                                    <div style={{ padding: '4px 10px 10px', background: '#F8FAFC' }}>
                                                        {membersLoading === g.key && <div style={{ fontSize: '0.78rem', color: '#64748B' }}>Chargement des membres…</div>}
                                                        {members.length > 0 && (
                                                            <>
                                                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                                                                    <button onClick={() => addWholeGroup(g)} style={{ background: '#0078A4', color: 'white', border: 'none', borderRadius: 6, padding: '3px 10px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>
                                                                        + Ajouter tout le groupe
                                                                    </button>
                                                                </div>
                                                                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                                                                    {members.map(m => {
                                                                        const isSel = selected.has(keyOf(m.email));
                                                                        return (
                                                                            <button
                                                                                key={m.email}
                                                                                onClick={() => toggleGroupMember(m)}
                                                                                style={{ width: '100%', textAlign: 'left', padding: '5px 6px', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
                                                                            >
                                                                                <span style={{ fontSize: '0.8rem', color: '#334155' }}>
                                                                                    <strong>{m.name || m.email}</strong>
                                                                                    {(m.fonction || m.service) && <span style={{ color: '#94A3B8' }}> — {[m.fonction, m.service].filter(Boolean).join(' · ')}</span>}
                                                                                </span>
                                                                                {isSel ? <Check size={14} color="#15803D" /> : <UserPlus size={14} color="#94A3B8" />}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </>
                                                        )}
                                                        {membersLoading !== g.key && members.length === 0 && <div style={{ fontSize: '0.78rem', color: '#94A3B8', padding: '4px 0' }}>Aucun membre exploitable (email) dans ce groupe.</div>}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {groups.length === 0 && <div style={{ padding: 10, fontSize: '0.8rem', color: '#94A3B8' }}>Aucun groupe disponible.</div>}
                                </div>
                            )}

                            <div style={{ marginTop: 10 }}>
                                {!showAdGroups ? (
                                    <button onClick={loadAdGroups} style={{ background: 'none', border: '1px dashed #CBD5E1', borderRadius: 8, padding: '6px 10px', width: '100%', color: '#64748B', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                                        Voir aussi les groupes / listes de diffusion AD…
                                    </button>
                                ) : adGroupsLoading ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748B', fontSize: '0.8rem' }}><Loader2 size={14} className="animate-spin" /> Chargement des groupes AD…</div>
                                ) : (
                                    <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, maxHeight: 220, overflowY: 'auto' }}>
                                        {adGroups.length === 0 && <div style={{ padding: 10, fontSize: '0.8rem', color: '#94A3B8' }}>Aucun groupe AD disponible.</div>}
                                        {adGroups.map(g => {
                                            const open = openGroupKey === g.key;
                                            const members = groupMembers[g.key] || [];
                                            return (
                                                <div key={g.key} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                    <button
                                                        onClick={() => loadGroupMembers(g)}
                                                        style={{ width: '100%', textAlign: 'left', padding: '7px 10px', border: 'none', background: open ? '#F8FAFC' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
                                                    >
                                                        <span style={{ fontWeight: 600, color: '#1E293B', fontSize: '0.8rem' }}>{g.label}</span>
                                                        <span style={{ fontSize: '0.7rem', color: '#0078A4', fontWeight: 700 }}>{open ? 'Réduire' : 'Membres'}</span>
                                                    </button>
                                                    {open && (
                                                        <div style={{ padding: '4px 10px 10px', background: '#F8FAFC' }}>
                                                            {membersLoading === g.key && <div style={{ fontSize: '0.78rem', color: '#64748B' }}>Chargement des membres…</div>}
                                                            {members.length > 0 && (
                                                                <>
                                                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                                                                        <button onClick={() => addWholeGroup(g)} style={{ background: '#0078A4', color: 'white', border: 'none', borderRadius: 6, padding: '3px 10px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>+ Ajouter tout le groupe</button>
                                                                    </div>
                                                                    <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                                                                        {members.map(m => {
                                                                            const isSel = selected.has(keyOf(m.email));
                                                                            return (
                                                                                <button key={m.email} onClick={() => toggleGroupMember(m)} style={{ width: '100%', textAlign: 'left', padding: '5px 6px', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                                                                    <span style={{ fontSize: '0.8rem', color: '#334155' }}><strong>{m.name || m.email}</strong></span>
                                                                                    {isSel ? <Check size={14} color="#15803D" /> : <UserPlus size={14} color="#94A3B8" />}
                                                                                </button>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </>
                                                            )}
                                                            {membersLoading !== g.key && members.length === 0 && <div style={{ fontSize: '0.78rem', color: '#94A3B8', padding: '4px 0' }}>Aucun membre exploitable dans ce groupe.</div>}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            {membersError && <div style={{ color: '#B91C1C', fontSize: '0.78rem', marginTop: 6 }}>{membersError}</div>}
                        </div>
                    )}
                </div>

                <div style={{ borderTop: '1px solid #F1F5F9', marginTop: 10, padding: '0.75rem 1.5rem', maxHeight: 160, overflowY: 'auto' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#334155', marginBottom: 6 }}>
                        Participants présents ({selectedList.length})
                    </div>
                    {selectedList.length === 0 && <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>Aucun participant ajouté pour l'instant.</div>}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {selectedList.map(p => (
                            <span key={p.email} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1D4ED8', borderRadius: 999, padding: '2px 6px 2px 10px', fontSize: '0.75rem', fontWeight: 600 }}>
                                {p.name}
                                <button onClick={() => addPerson(p)} title="Retirer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1D4ED8', display: 'flex', alignItems: 'center' }}><X size={12} /></button>
                            </span>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.85rem 1.5rem', borderTop: '1px solid #F1F5F9', background: '#FBFDFF' }}>
                    <button onClick={onSkip} disabled={launching} style={{ background: 'none', border: 'none', padding: 0, color: '#64748B', fontSize: '0.78rem', fontWeight: 600, cursor: launching ? 'default' : 'pointer', textDecoration: 'underline' }}>
                        Lancer sans ajouter de participant
                    </button>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button onClick={onClose} disabled={launching} style={{ background: '#F1F5F9', color: '#475569', border: 'none', padding: '0.55rem 1.15rem', borderRadius: 8, fontWeight: 600, cursor: launching ? 'default' : 'pointer', fontSize: '0.85rem' }}>
                            Plus tard
                        </button>
                        <button onClick={() => onLaunch(selectedList)} disabled={launching} style={{ background: '#DC2626', color: 'white', border: 'none', padding: '0.55rem 1.25rem', borderRadius: 8, fontWeight: 700, cursor: launching ? 'default' : 'pointer', fontSize: '0.85rem', opacity: launching ? 0.7 : 1 }}>
                            {launching ? 'Lancement…' : "Lancer l'analyse IA"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
