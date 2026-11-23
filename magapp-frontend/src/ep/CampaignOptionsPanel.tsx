import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { ShieldCheck, QrCode, ClipboardCheck, Loader2, CheckCircle2, AlertCircle, Power } from 'lucide-react';
import { useAuth } from './useAuth';
import type { Campaign } from './types';
import { COLORS, btnDanger, btnPrimary, card, input } from './ui';

type Key = 'analyse_coherence' | 'qr_code' | 'mode_simple';

interface Opt { key: Key; title: string; icon: React.ReactNode; defaultOn: boolean; on: React.ReactNode; off: React.ReactNode }

const OPTIONS: Opt[] = [
  {
    key: 'analyse_coherence', title: 'Analyse de cohérence', icon: <ShieldCheck size={17} color={COLORS.primary} />, defaultOn: false,
    on: <>Le bouton de l’évaluateur s’appelle « Vérifier la cohérence » : il contrôle le <strong>fond</strong> du compte rendu (adéquation entre les commentaires et les évaluations de la grille, relecture automatique si elle est ouverte à l’évaluateur).</>,
    off: <>Le bouton devient « Vérifier la <strong>complétude</strong> » : il contrôle seulement que les rubriques obligatoires sont renseignées (elles bloquent la validation) et alerte sur les rubriques facultatives vides, sans IA. <em>(par défaut)</em></>,
  },
  {
    key: 'qr_code', title: 'QR code sur les CREP imprimés', icon: <QrCode size={17} color={COLORS.primary} />, defaultOn: true,
    on: <>Un QR code est imprimé en haut à gauche de chaque page du CREP : à la numérisation, il rattache automatiquement chaque page à l’agent et au bon numéro de page, même dans le désordre. <em>(par défaut)</em></>,
    off: <>Aucun QR code n’est imprimé. À la numérisation (téléversement ou boîte mail), l’outil <strong>lit le nom de l’agent</strong> sur la page, <strong>propose l’agent avec un taux de certitude</strong> (vous pouvez l’affecter à un autre agent) et <strong>remet les pages dans l’ordre</strong> d’après leurs titres quand il le peut.</>,
  },
  {
    key: 'mode_simple', title: 'Mode simple', icon: <ClipboardCheck size={17} color={COLORS.primary} />, defaultOn: false,
    on: <>Les évaluateurs <strong>ne téléversent pas le CREP signé</strong> : ils le réalisent (dans l’outil ou sur papier), l’envoient à la DRH puis signalent l’envoi. Le CREP signé est numérisé par les administrateurs (menu « Suivi des retours »), puis l’entretien est clôturé et l’agent·e et l’évaluateur sont notifiés. Pas de demande de réouverture.</>,
    off: <>Les évaluateurs téléversent le CREP signé (scan ou photos) et clôturent eux-mêmes l’entretien. <em>(par défaut)</em></>,
  },
];

/**
 * Options propres à une campagne (Paramétrage → Options) : analyse de cohérence, QR code, mode simple.
 * Elles s'appliquent à la campagne choisie (la campagne ouverte par défaut) et s'enregistrent immédiatement.
 */
export default function CampaignOptionsPanel() {
  const { token } = useAuth();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [campaignId, setCampaignId] = useState(0);
  const [busy, setBusy] = useState<Key | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async (keepId?: number) => {
    try {
      const r = await axios.get('/api/entretiens/campaigns', { headers });
      const list: Campaign[] = r.data || [];
      setCampaigns(list);
      setCampaignId(keepId || (list.find(c => c.statut === 'ouverte') || list[0])?.id || 0);
    } catch { setCampaigns([]); }
  }, [headers]);
  useEffect(() => { load(); }, [load]);

  const campaign = campaigns?.find(c => c.id === campaignId) || null;
  const value = (o: Opt) => {
    const v = campaign ? (campaign as any)[o.key] : undefined;
    return v === undefined || v === null ? o.defaultOn : !!v;
  };

  const toggle = async (o: Opt) => {
    if (!campaign) return;
    setBusy(o.key); setMsg(null);
    try {
      await axios.put(`/api/entretiens/campaigns/${campaign.id}`, { [o.key]: !value(o) }, { headers });
      await load(campaign.id);
      setMsg({ ok: true, text: `${o.title} : ${!value(o) ? 'activée' : 'désactivée'} pour ${campaign.libelle || `la campagne ${campaign.annee}`}.` });
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.message || 'Enregistrement impossible.' }); } finally { setBusy(null); }
  };

  return (
    <div style={{ ...card, padding: 18, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.text }}>Options de la campagne</div>
        {campaigns && campaigns.length > 1 && (
          <select style={{ ...input, width: 'auto' }} value={campaignId} onChange={e => setCampaignId(Number(e.target.value))}>
            {campaigns.map(c => <option key={c.id} value={c.id}>{c.libelle || `Campagne ${c.annee}`}{c.statut === 'ouverte' ? ' (ouverte)' : ''}</option>)}
          </select>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 10 }}>Ces options sont propres à chaque campagne et s’enregistrent immédiatement.</div>
      {!campaigns && <Loader2 size={18} className="spin" />}
      {campaigns && !campaign && <div style={{ fontSize: 12.5, color: COLORS.muted }}>Aucune campagne : créez-en une dans l’onglet « Général ».</div>}
      {campaign && OPTIONS.map(o => {
        const on = value(o);
        return (
          <div key={o.key} style={{ borderTop: `1px solid ${COLORS.border}`, padding: '12px 0' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, fontWeight: 800, color: COLORS.text }}>
                {o.icon} {o.title}
                <span style={{ fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '2px 9px', background: on ? '#dcfce7' : '#f1f5f9', color: on ? '#166534' : '#64748b' }}>{on ? 'Activée' : 'Désactivée'}</span>
              </div>
              <button style={on ? btnDanger : btnPrimary} disabled={busy !== null} onClick={() => toggle(o)}>
                {busy === o.key ? <Loader2 size={14} className="spin" /> : <Power size={14} />} {on ? 'Désactiver' : 'Activer'}
              </button>
            </div>
            <div style={{ fontSize: 12.5, color: COLORS.muted, marginTop: 6, lineHeight: 1.6 }}>
              <strong>{on ? 'Activée' : 'Désactivée'}</strong> : {on ? o.on : o.off}
            </div>
          </div>
        );
      })}
      {msg && <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginTop: 8, fontSize: 12.5, fontWeight: 600, color: msg.ok ? COLORS.success : COLORS.danger }}>{msg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {msg.text}</div>}
    </div>
  );
}
