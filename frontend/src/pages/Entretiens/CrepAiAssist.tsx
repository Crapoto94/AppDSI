import React, { useState } from 'react';
import axios from 'axios';
import { Sparkles, Loader2, Check, RefreshCw, X, CornerDownLeft, Plus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { COLORS, btnGhost, btnPrimary, textarea } from './ui';

/**
 * Aide à la rédaction par l'IA locale (Ollama) : l'évaluateur indique en substance ce que le
 * commentaire doit exprimer, l'IA rédige une proposition qu'il peut utiliser, compléter ou refuser.
 */
export default function CrepAiAssist({ entretienId, rubrique, contexte, crep, value, disabled, onApply }: {
  entretienId: number;
  rubrique: string;
  /** Éléments factuels fournis à l'IA (objectif, saisie de l'agent…). */
  contexte?: string;
  /** Compte rendu complet (appréciation générale) : l'IA reçoit tout ce qui a été saisi et reste cohérente avec l'ensemble. */
  crep?: unknown;
  /** Texte actuellement saisi dans la rubrique. */
  value: string;
  disabled?: boolean;
  onApply: (text: string) => void;
}) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState('');
  const [error, setError] = useState('');

  if (disabled) return null;

  const generate = async () => {
    if (!notes.trim()) { setError('Indiquez en quelques mots ce que le commentaire doit exprimer.'); return; }
    setBusy(true); setError('');
    try {
      const r = await axios.post(`/api/entretiens/${entretienId}/ai-draft`,
        { rubrique, notes, contexte, crep, existant: value }, { headers: { Authorization: `Bearer ${token}` } });
      setProposal(r.data.text || '');
    } catch (e: any) {
      setError(e.response?.data?.message || 'L’IA interne n’a pas pu rédiger de proposition.');
    } finally { setBusy(false); }
  };

  const close = () => { setOpen(false); setProposal(''); setError(''); setNotes(''); };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', color: COLORS.primary, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
        <Sparkles size={13} /> Rédiger avec l’IA
      </button>
    );
  }

  return (
    <div style={{ marginTop: 6, padding: '10px 12px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 9 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12, fontWeight: 800, color: '#5b21b6' }}>
          <Sparkles size={14} /> Rédaction assistée (IA interne de la Ville)
        </span>
        <button type="button" onClick={close} title="Fermer" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#7c3aed' }}><X size={15} /></button>
      </div>
      <div style={{ fontSize: 11.5, color: '#6d28d9', marginBottom: 5 }}>
        Indiquez en substance ce que ce commentaire doit exprimer : l’IA rédige, vous relisez et validez.
      </div>
      <textarea style={{ ...textarea, background: '#fff' }} rows={2} value={notes} placeholder="Ex. : très bon bilan, projet livré dans les délais, doit encore gagner en autonomie sur le suivi budgétaire…"
        onChange={e => setNotes(e.target.value)} />
      <div style={{ display: 'flex', gap: 8, marginTop: 7, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" style={{ ...btnPrimary, padding: '6px 12px', fontSize: 12 }} disabled={busy} onClick={generate}>
          {busy ? <Loader2 size={13} /> : <Sparkles size={13} />} {proposal ? 'Régénérer' : 'Proposer un texte'}
        </button>
        {busy && <span style={{ fontSize: 11.5, color: '#6d28d9' }}>Rédaction en cours…</span>}
      </div>
      {error && <div style={{ marginTop: 7, fontSize: 12, color: COLORS.danger }}>{error}</div>}

      {proposal && (
        <div style={{ marginTop: 9 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6d28d9', marginBottom: 4 }}>Proposition (modifiable) :</div>
          <textarea style={{ ...textarea, background: '#fff' }} rows={5} value={proposal} onChange={e => setProposal(e.target.value)} />
          <div style={{ display: 'flex', gap: 7, marginTop: 7, flexWrap: 'wrap' }}>
            <button type="button" style={{ ...btnPrimary, padding: '6px 12px', fontSize: 12, background: COLORS.success }}
              onClick={() => { onApply(proposal); close(); }}>
              <Check size={13} /> Utiliser ce texte
            </button>
            {value.trim() && (
              <button type="button" style={{ ...btnGhost, padding: '6px 12px', fontSize: 12 }}
                onClick={() => { onApply(`${value.trim()}\n${proposal}`); close(); }}>
                <Plus size={13} /> Ajouter à la suite
              </button>
            )}
            <button type="button" style={{ ...btnGhost, padding: '6px 12px', fontSize: 12 }} onClick={generate} disabled={busy}>
              <RefreshCw size={13} /> Autre formulation
            </button>
            <button type="button" style={{ ...btnGhost, padding: '6px 12px', fontSize: 12 }} onClick={close}>
              <CornerDownLeft size={13} /> Ignorer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
