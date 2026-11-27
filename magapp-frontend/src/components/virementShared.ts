import type React from 'react';

// Types, états et styles partagés entre la demande de virement de crédits et l'espace de traitement des finances.

export const API = '/api/magapp/virement-credits';
export const authHeaders = (): Record<string, string> => ({ Authorization: `Bearer ${localStorage.getItem('token') || ''}` });
export const jsonHeaders = (): Record<string, string> => ({ ...authHeaders(), 'Content-Type': 'application/json' });

export interface PayloadLine { code: string; montant: number }
export type Etat = 'brouillon' | 'en_signature' | 'signee' | 'refusee' | 'annulee' | 'envoyee' | 'en_traitement' | 'faite' | 'rejetee';
export interface Rec {
  id: number; created_by_name: string | null; created_at: string; direction: string | null; service: string | null; contact: string | null;
  date_demande: string | null; section: string; sens: string; compense: boolean; montant: string | number; motivation: string | null;
  parapheur_id: number | null; para_reference: string | null; para_status: string | null;
  sent_at: string | null; sent_to: string | null; sent_cc: string | null; sent_channel?: 'mail' | 'espace' | null;
  treatment_status?: 'fait' | 'en_cours' | 'refuse' | null; treatment_comment?: string | null; treated_at?: string | null; treated_by?: string | null;
  mine?: boolean;
  etat: Etat;
  payload?: { section: string; sens: string; compense: boolean; activite: string; motivation: string; budget?: string; collectivite?: string; majorer: PayloadLine[]; minorer: PayloadLine[] };
}

export const ETATS: Record<Etat, { label: string; color: string }> = {
  brouillon: { label: 'Brouillon', color: '#64748b' },
  en_signature: { label: 'En signature', color: '#d97706' },
  signee: { label: 'Signée, à transmettre', color: '#16a34a' },
  refusee: { label: 'Signature refusée', color: '#dc2626' },
  annulee: { label: 'Parapheur annulé', color: '#dc2626' },
  envoyee: { label: 'Transmise aux finances', color: '#2563eb' },
  en_traitement: { label: 'En cours (finances)', color: '#7c3aed' },
  faite: { label: 'Faite', color: '#15803d' },
  rejetee: { label: 'Refusée par les finances', color: '#b91c1c' },
};

export const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtMoney = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
export const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('fr-FR') : '');

export const s: Record<string, React.CSSProperties> = {
  card: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.1rem' },
  input: { width: '100%', padding: '0.5rem 0.7rem', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.9rem', boxSizing: 'border-box', background: '#fff', color: '#1e293b' },
  label: { display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: 4 },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.55rem 1.1rem', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer', justifyContent: 'center' },
  th: { textAlign: 'left', padding: '0.5rem', fontSize: '0.72rem', color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' },
  td: { padding: '0.5rem', fontSize: '0.85rem', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' },
  right: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
};
