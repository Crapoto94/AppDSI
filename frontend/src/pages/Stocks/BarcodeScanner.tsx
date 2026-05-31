import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X } from 'lucide-react';

/**
 * Scanner code-barres / QR plein écran (mobile-first).
 * Appelle onResult(code) au premier scan réussi puis se ferme.
 *
 * - La vidéo remplit tout le conteneur (object-fit: cover) — pas de bandes noires
 *   même si la caméra est en paysage et l'écran en portrait.
 * - La zone de scan est une bande horizontale large, adaptée aux codes-barres 1D.
 */
export default function BarcodeScanner({ onResult, onClose }: { onResult: (code: string) => void; onClose: () => void }) {
  const ref = useRef<Html5Qrcode | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const id = 'stk-reader';
    const scanner = new Html5Qrcode(id);
    ref.current = scanner;

    // Bande horizontale large adaptée au viseur réel (≈90% largeur, 35% hauteur).
    const qrbox = (viewfinderWidth: number, viewfinderHeight: number) => {
      const width = Math.floor(viewfinderWidth * 0.9);
      const height = Math.floor(Math.min(viewfinderHeight * 0.4, width * 0.55));
      return { width, height };
    };

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox, aspectRatio: window.innerHeight / window.innerWidth },
        (decoded) => {
          if (doneRef.current) return;
          doneRef.current = true;
          onResult(decoded);
          scanner.stop().then(() => scanner.clear()).catch(() => {});
        },
        () => { /* ignore per-frame decode errors */ }
      )
      .catch((e) => setErr(e?.message || "Impossible d'accéder à la caméra"));

    return () => {
      try {
        if (scanner.isScanning) scanner.stop().then(() => scanner.clear()).catch(() => {});
        else scanner.clear();
      } catch { /* noop */ }
    };
  }, [onResult]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 1100, display: 'flex', flexDirection: 'column' }}>
      {/* Force la vidéo injectée par html5-qrcode à remplir tout l'espace */}
      <style>{`
        #stk-reader { width: 100%; height: 100%; position: relative; overflow: hidden; }
        #stk-reader video { width: 100% !important; height: 100% !important; object-fit: cover !important; }
        #stk-reader > div:first-child { border: none !important; }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 14, color: '#fff', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2, background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)' }}>
        <span style={{ fontWeight: 600 }}>Scanner un code</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={26} /></button>
      </div>
      <div id="stk-reader" style={{ flex: 1, width: '100%' }} />
      {err ? (
        <div style={{ padding: 16, color: '#fca5a5', textAlign: 'center', fontSize: 14, position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 2, background: 'rgba(0,0,0,0.7)' }}>
          {err}<br /><span style={{ color: '#94a3b8' }}>Saisissez le code manuellement.</span>
        </div>
      ) : (
        <div style={{ padding: 16, textAlign: 'center', color: '#e2e8f0', fontSize: 13, position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 2, background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)' }}>
          Placez le code-barres dans le cadre
        </div>
      )}
    </div>
  );
}
