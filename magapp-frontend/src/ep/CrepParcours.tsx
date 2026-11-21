import { useEffect, useState } from 'react';
import axios from 'axios';
import { PenLine, Monitor, Printer, CheckCircle2, ChevronRight, Loader2, Lock, RefreshCw, ArrowRight } from 'lucide-react';
import { COLORS, btnGhost, btnPrimary } from './ui';
import type { Entretien } from './types';

type Mode = 'manuscrit' | 'outil';

/** Étapes du parcours (fil d'Ariane) selon le mode de saisie. */
const STEPS: Record<Mode, string[]> = {
  manuscrit: ['Mode de saisie', 'Imprimer le CREP', 'Entretien et signatures', 'Téléverser le CREP signé', 'Vérifier', 'Clôturer'],
  outil: ['Mode de saisie', 'Saisir le CREP', 'Valider la partie évaluateur', 'Imprimer', 'Signatures', 'Téléverser et vérifier', 'Clôturer'],
};

const stageKey = (id: number) => `ep_parcours_stage_${id}`;

/**
 * Parcours guidé du CREP : choix du mode de saisie (manuscrit ou dans l'outil), fil d'Ariane, et action à faire à l'étape en cours.
 * Le mode peut être changé à tout moment (tant que l'entretien n'est pas clôturé).
 */
export default function CrepParcours({ entretien, headers, busy, onChanged, onPrint, onValidate, onClose, formVisible, setFormVisible }: {
  entretien: Entretien;
  headers: Record<string, string>;
  busy: boolean;
  onChanged: (e: Entretien) => void;
  onPrint: () => void;
  onValidate: () => void;
  onClose: () => void;
  formVisible: boolean;
  setFormVisible: (v: boolean) => void;
}) {
  const mode = (entretien.crep_mode as Mode | null | undefined) || null;
  const closed = entretien.statut === 'cloture';
  const validated = entretien.evaluation_statut === 'soumis';
  const scans = entretien.crep_scans || [];
  const verified = scans.some(s => (s as any).signatures_ok === true) || !!entretien.crep_signed_at;
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  // Étapes « hors outil » (impression, entretien, signatures) : l'évaluateur avance à la main, la progression est mémorisée sur ce poste
  const [stage, setStage] = useState<number>(() => { try { return Number(localStorage.getItem(stageKey(entretien.id))) || 0; } catch { return 0; } });
  useEffect(() => { try { setStage(Number(localStorage.getItem(stageKey(entretien.id))) || 0); } catch { setStage(0); } }, [entretien.id]);
  const advance = (n: number) => { setStage(n); try { localStorage.setItem(stageKey(entretien.id), String(n)); } catch { /* ignore */ } };

  const chooseMode = async (m: Mode) => {
    if (m === mode) return;
    setSaving(true); setErr('');
    try {
      const r = await axios.put(`/api/entretiens/${entretien.id}/crep/mode`, { mode: m }, { headers });
      onChanged(r.data.entretien);
      advance(0);
      setFormVisible(m === 'outil');
    } catch (e: any) { setErr(e?.response?.data?.message || 'Changement de mode impossible.'); } finally { setSaving(false); }
  };

  // Étape en cours (index dans STEPS[mode])
  let current = 0;
  if (mode === 'manuscrit') current = closed ? 6 : verified ? 5 : Math.min(3, 1 + stage);
  if (mode === 'outil') current = closed ? 7 : verified ? 6 : validated ? Math.min(5, 3 + stage) : 1;
  const steps = mode ? STEPS[mode] : [];

  const card: React.CSSProperties = { border: '1px solid #c7d2fe', background: '#f8faff', borderRadius: 12, padding: '14px 16px', marginTop: 12 };
  const big = (m: Mode, icon: React.ReactNode, title: string, text: string) => (
    <button type="button" disabled={saving || busy} onClick={() => chooseMode(m)}
      style={{ flex: '1 1 260px', textAlign: 'left', cursor: 'pointer', border: `2px solid ${mode === m ? COLORS.primary : '#e2e8f0'}`, background: mode === m ? '#eef2ff' : '#fff', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 14, color: COLORS.text }}>{icon}{title}</div>
      <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.55, marginTop: 4 }}>{text}</div>
    </button>
  );

  // ─── Choix du mode (au début, puis modifiable)
  if (!mode) {
    return (
      <div style={card}>
        <div style={{ fontWeight: 800, fontSize: 14.5, color: COLORS.text, marginBottom: 4 }}>Comment allez-vous tenir le compte rendu (CREP) ?</div>
        <div style={{ fontSize: 12.5, color: '#475569', marginBottom: 10 }}>Vous pourrez changer d’avis à tout moment, sans rien perdre.</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {big('manuscrit', <PenLine size={17} color="#d97706" />, 'À la main (manuscrit)', 'Vous imprimez le CREP, vous le remplissez avec l’agent et vous le faites signer. Vous le téléversez ensuite (scan ou photos) : l’outil lit le document et vérifie les 2 signatures. Vous vérifiez, puis vous clôturez.')}
          {big('outil', <Monitor size={17} color="#16a34a" />, 'Dans l’outil (saisie informatisée)', 'Vous saisissez les rubriques et la grille dans l’outil, vous validez votre partie, puis vous imprimez. L’agent complète ses 2 cadres et signe, vous signez, puis vous téléversez le CREP signé. Vous vérifiez et vous clôturez.')}
        </div>
        {err && <div style={{ color: COLORS.danger, fontSize: 12.5, marginTop: 8 }}>{err}</div>}
      </div>
    );
  }

  // ─── Fil d'Ariane + action de l'étape en cours
  const label = steps[Math.min(current, steps.length - 1)];
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {steps.map((s, i) => {
          const done = i < current || closed;
          const cur = i === current && !closed;
          return (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 800,
                background: cur ? COLORS.primary : done ? '#dcfce7' : '#f1f5f9', color: cur ? '#fff' : done ? '#166534' : '#64748b' }}>
                {done ? <CheckCircle2 size={12} /> : <span>{i + 1}</span>} {s}
              </span>
              {i < steps.length - 1 && <ChevronRight size={13} color="#94a3b8" />}
            </span>
          );
        })}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#64748b' }}>
          Mode : <strong>{mode === 'manuscrit' ? 'à la main' : 'dans l’outil'}</strong>
          {!closed && (
            <button type="button" style={{ ...btnGhost, padding: '2px 8px', fontSize: 11.5 }} disabled={saving || busy} onClick={() => chooseMode(mode === 'manuscrit' ? 'outil' : 'manuscrit')}
              title="Passer à l’autre mode de saisie, sans rien perdre">
              <RefreshCw size={11} /> Passer en mode {mode === 'manuscrit' ? 'outil' : 'manuscrit'}
            </button>
          )}
        </span>
      </div>

      {closed ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 700, color: '#166534' }}>
          <Lock size={15} /> Entretien clôturé : le CREP signé est archivé. Tout est terminé.
        </div>
      ) : (
        <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.65 }}>
          <div style={{ fontWeight: 800, color: COLORS.text, marginBottom: 3 }}>Étape en cours : {label}</div>

          {mode === 'manuscrit' && current <= 1 && <>
            <div>Imprimez le CREP vierge. Vous le remplirez à la main avec l’agent pendant l’entretien.</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button style={btnPrimary} disabled={busy} onClick={onPrint}><Printer size={14} /> Imprimer le CREP</button>
              <button style={btnGhost} onClick={() => advance(1)}>Imprimé, passer à l’entretien <ArrowRight size={13} /></button>
            </div>
          </>}
          {mode === 'manuscrit' && current === 2 && <>
            <div>Menez l’entretien et remplissez le CREP à la main. L’<strong>agent renseigne ses 2 cadres et signe</strong>, puis <strong>vous le contresignez</strong>.</div>
            <div style={{ marginTop: 8 }}><button style={btnPrimary} onClick={() => advance(2)}>Le CREP est signé par les deux, passer au téléversement <ArrowRight size={13} /></button></div>
          </>}
          {mode === 'manuscrit' && current === 3 && <>
            <div><strong>Téléversez le CREP signé</strong> (scan ou photos des pages) avec le bouton « Importer un compte rendu papier » ci-dessous. L’outil lit le document et contrôle la présence des <strong>2 signatures</strong> ; il vous demandera de tout vérifier.</div>
          </>}
          {mode === 'manuscrit' && current === 5 && <>
            <div>Le contenu et les 2 signatures ont été vérifiés. Cliquez sur <strong>Clôturer l’entretien</strong> : le compte rendu est validé et le CREP signé est archivé.</div>
            <div style={{ marginTop: 8 }}><button style={{ ...btnPrimary, background: COLORS.success }} disabled={busy} onClick={onClose}><Lock size={14} /> Clôturer l’entretien</button></div>
          </>}

          {mode === 'outil' && current === 1 && <>
            <div>Saisissez les rubriques et <strong>la grille d’appréciation</strong>, puis cliquez sur <strong>Valider la partie évaluateur</strong>. Rien n’est envoyé à l’agent.</div>
            <div style={{ marginTop: 8 }}><button style={{ ...btnPrimary, background: COLORS.success }} disabled={busy} onClick={onValidate}><CheckCircle2 size={14} /> Valider la partie évaluateur</button></div>
          </>}
          {mode === 'outil' && current === 3 && <>
            <div>Imprimez le CREP : l’agent y renseignera ses 2 cadres et le signera, puis vous le signerez.</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button style={btnPrimary} disabled={busy} onClick={onPrint}><Printer size={14} /> Imprimer le CREP</button>
              <button style={btnGhost} onClick={() => advance(1)}>Imprimé, passer aux signatures <ArrowRight size={13} /></button>
            </div>
          </>}
          {mode === 'outil' && current === 4 && <>
            <div>L’<strong>agent renseigne ses 2 cadres</strong> (observations sur les conditions de travail et sur l’entretien) <strong>et signe à la main</strong> ; <strong>vous contresignez</strong>.</div>
            <div style={{ marginTop: 8 }}><button style={btnPrimary} onClick={() => advance(2)}>Le CREP est signé par les deux, passer au téléversement <ArrowRight size={13} /></button></div>
          </>}
          {mode === 'outil' && current === 5 && <>
            <div><strong>Téléversez le CREP signé</strong> (scan ou photos) avec « Importer un compte rendu papier » ci-dessous. L’outil lit <strong>les 2 cadres de l’agent</strong> et contrôle les <strong>2 signatures</strong> ; vous vérifiez ces éléments.</div>
          </>}
          {mode === 'outil' && current === 6 && <>
            <div>Les 2 cadres de l’agent et les 2 signatures ont été vérifiés. Cliquez sur <strong>Clôturer l’entretien</strong> : le CREP signé est archivé.</div>
            <div style={{ marginTop: 8 }}><button style={{ ...btnPrimary, background: COLORS.success }} disabled={busy} onClick={onClose}><Lock size={14} /> Clôturer l’entretien</button></div>
          </>}

          {mode === 'manuscrit' && (
            <div style={{ marginTop: 8, fontSize: 12 }}>
              <button type="button" style={{ ...btnGhost, padding: '2px 8px', fontSize: 11.5 }} onClick={() => setFormVisible(!formVisible)}>
                {formVisible ? 'Masquer le formulaire de saisie' : 'Afficher le formulaire de saisie'}
              </button>
              <span style={{ color: '#64748b', marginLeft: 8 }}>En mode manuscrit, le contenu vient du document scanné ; le formulaire sert à corriger.</span>
            </div>
          )}
        </div>
      )}
      {(saving || busy) && <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}><Loader2 size={12} /> …</div>}
      {err && <div style={{ color: COLORS.danger, fontSize: 12.5, marginTop: 8 }}>{err}</div>}
    </div>
  );
}
