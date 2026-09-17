import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Activity, CheckCircle2, FileSignature, Loader2, RefreshCw, ShieldCheck, XCircle } from 'lucide-react'
import SignatureSignataire from './pages/Parapheur/SignatureSignataire'
import ParapheurVerification from './pages/Parapheur/ParapheurVerification'

/**
 * Front minimal du parapheur (instance autonome DMZ) :
 *  - /                               → état de santé du backend ;
 *  - /signature/:token               → signature (lien personnel reçu par e-mail) ;
 *  - /parapheur/verification/:token  → vérification publique (QR code).
 */
export default function App() {
  return (
    <Routes>
      <Route path="/signature/:token" element={<SignatureSignataire />} />
      <Route path="/parapheur/verification/:token" element={<ParapheurVerification />} />
      <Route path="/" element={<Health />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

interface HealthData {
  status?: string
  service?: string
  time?: string
  uptime_seconds?: number
  database?: string
}

function formatUptime(s?: number): string {
  if (s == null || s < 0) return '—'
  const days = Math.floor(s / 86400)
  const hours = Math.floor((s % 86400) / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const parts: string[] = []
  if (days) parts.push(`${days} j`)
  if (hours) parts.push(`${hours} h`)
  parts.push(`${minutes} min`)
  return parts.join(' ')
}

function Health() {
  const [loading, setLoading] = useState(true)
  const [reachable, setReachable] = useState(false)
  const [data, setData] = useState<HealthData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checkedAt, setCheckedAt] = useState<Date | null>(null)

  const check = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/health', { cache: 'no-store' })
      let body: HealthData | null = null
      try { body = await r.json() } catch { body = null }
      setReachable(r.ok)
      setData(body)
      setError(r.ok ? null : (body?.status === 'degraded' ? 'Base de données indisponible' : `Réponse ${r.status}`))
    } catch {
      setReachable(false)
      setData(null)
      setError('Backend injoignable')
    } finally {
      setCheckedAt(new Date())
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    check()
    const id = setInterval(check, 15000)
    return () => clearInterval(id)
  }, [check])

  const ok = reachable && data?.status === 'ok'
  const degraded = reachable && !ok
  const color = ok ? '#15803d' : degraded ? '#b45309' : '#b91c1c'
  const bg = ok ? '#f0fdf4' : degraded ? '#fffbeb' : '#fef2f2'
  const border = ok ? '#bbf7d0' : degraded ? '#fde68a' : '#fecaca'
  const label = !checkedAt && loading
    ? 'Vérification…'
    : ok ? 'Service opérationnel' : degraded ? 'Service dégradé' : 'Service indisponible'

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileSignature size={24} color="#7c3aed" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a' }}>Parapheur électronique</h1>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: '#64748b' }}>État du service</p>
          </div>
        </div>

        <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {loading && !checkedAt
              ? <Loader2 size={22} className="spin" color={color} />
              : ok ? <CheckCircle2 size={22} color={color} /> : <XCircle size={22} color={color} />}
            <span style={{ fontSize: 16, fontWeight: 800, color }}>{label}</span>
            <button
              onClick={check}
              disabled={loading}
              title="Revérifier maintenant"
              style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: '#fff', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 9, fontWeight: 700, fontSize: 12, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1 }}
            >
              <RefreshCw size={13} className={loading ? 'spin' : undefined} /> Revérifier
            </button>
          </div>

          <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
            <Row label="API backend" value={reachable ? 'Accessible' : 'Injoignable'} good={reachable} />
            <Row
              label="Base de données"
              value={!reachable ? 'Inconnue' : data?.database === 'ok' ? 'Opérationnelle' : 'Erreur'}
              good={reachable ? data?.database === 'ok' : null}
            />
            <Row label="Disponibilité" value={formatUptime(data?.uptime_seconds)} />
            <Row label="Dernière vérification" value={checkedAt ? checkedAt.toLocaleTimeString('fr-FR') : '—'} />
          </div>

          {error && <p style={{ margin: '12px 0 0', fontSize: 12, color }}>{error}</p>}
        </div>

        <div style={{ marginTop: 16, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 18px', fontSize: 13, color: '#475569' }}>
          <p style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <ShieldCheck size={16} color="#7c3aed" style={{ marginTop: 1, flexShrink: 0 }} />
            <span>
              La <strong>signature</strong> se fait via le lien personnel reçu par e-mail ; la{' '}
              <strong>vérification</strong> d'un document signé via le QR code apposé dessus.
            </span>
          </p>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <Activity size={12} /> Actualisation automatique toutes les 15 secondes
        </p>
      </div>
    </div>
  )
}

function Row({ label, value, good }: { label: string; value: string; good?: boolean | null }) {
  const color = good === true ? '#15803d' : good === false ? '#b91c1c' : '#334155'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 9, padding: '9px 12px' }}>
      <span style={{ fontSize: 12, color: '#64748b', flex: 1 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color }}>{value}</span>
    </div>
  )
}
