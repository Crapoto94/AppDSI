import { useEffect, useRef, useState } from 'react';
import logoVille from '../assets/Ivry.png'; // embarqué dans le front : s'affiche même si le serveur est injoignable

// Si le serveur (backend) est injoignable ou en erreur, le Magasin d'applications affiche un message de maintenance au lieu d'un écran vide
// ou d'erreurs techniques. L'état est vérifié au chargement puis toutes les 30 s ; en maintenance, nouvel essai toutes les 10 s et rechargement
// automatique dès que le serveur répond.
const CHECK_MS = 30_000;
const RETRY_MS = 10_000;

async function backendIsUp(): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const r = await fetch('/api/health', { cache: 'no-store', signal: ctrl.signal });
    return r.ok; // 502/503/504 (nginx sans backend), 503 (base indisponible) = maintenance
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export default function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const [down, setDown] = useState(false);
  const failures = useRef(0);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    let first = true;
    const tick = async () => {
      const ok = await backendIsUp();
      if (!alive) return;
      if (ok) {
        failures.current = 0;
        // Retour du serveur après une maintenance : on repart d'une page propre
        setDown(prev => { if (prev) window.location.reload(); return false; });
      } else {
        failures.current += 1;
        // 1re vérification : maintenance tout de suite ; ensuite 2 échecs d'affilée (évite un faux positif sur un à-coup réseau)
        if (first || failures.current >= 2) setDown(true);
      }
      first = false;
      timer = setTimeout(tick, failures.current > 0 ? RETRY_MS : CHECK_MS);
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  if (!down) return <>{children}</>;
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f1f5f9, #e0f2fe)', padding: 24, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: 24, padding: '40px 44px', maxWidth: 520, width: '100%', textAlign: 'center', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.18)' }}>
        <img src={logoVille} alt="Ville d'Ivry-sur-Seine" style={{ height: 72, marginBottom: 18 }} />
        <div style={{ fontSize: 44, marginBottom: 6 }} aria-hidden="true">🛠️</div>
        <h1 style={{ margin: '0 0 10px', fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>Magasin d'applications en maintenance</h1>
        <p style={{ margin: 0, color: '#475569', fontSize: '1.02rem', lineHeight: 1.6 }}>Revenez dans quelques minutes, merci.</p>
        <p style={{ margin: '18px 0 0', color: '#94a3b8', fontSize: '0.82rem' }}>Cette page se rechargera automatiquement dès que le service sera de nouveau disponible.</p>
      </div>
    </div>
  );
}
