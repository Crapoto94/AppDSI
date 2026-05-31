import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X } from 'lucide-react';

/**
 * Scanner code-barres / QR plein écran (mobile-first).
 * Appelle onResult(code) au premier scan réussi puis se ferme.
 */
export default function BarcodeScanner({ onResult, onClose }: { onResult: (code: string) => void; onClose: () => void }) {
  const ref = useRef<Html5Qrcode | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const id = 'stk-reader';
    const scanner = new Html5Qrcode(id);
    ref.current = scanner;
    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 14, color: '#fff' }}>
        <span style={{ fontWeight: 600 }}>Scanner un code</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={26} /></button>
      </div>
      <div id="stk-reader" style={{ flex: 1, width: '100%' }} />
      {err && (
        <div style={{ padding: 16, color: '#fca5a5', textAlign: 'center', fontSize: 14 }}>
          {err}<br /><span style={{ color: '#94a3b8' }}>Saisissez le code manuellement.</span>
        </div>
      )}
      <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
        Placez le code-barres / QR dans le cadre
      </div>
    </div>
  );
}
