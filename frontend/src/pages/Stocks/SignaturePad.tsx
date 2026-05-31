import React, { useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Eraser } from 'lucide-react';

/**
 * Zone de signature tactile (smartphone/tablette).
 * Remonte la signature en PNG (data URL) via onChange à chaque trait terminé.
 */
export default function SignaturePad({ onChange, height = 180 }: { onChange: (dataUrl: string | null) => void; height?: number }) {
  const ref = useRef<SignatureCanvas | null>(null);

  const handleEnd = () => {
    const c = ref.current;
    if (!c || c.isEmpty()) { onChange(null); return; }
    onChange(c.toDataURL('image/png'));
  };
  const clear = () => { ref.current?.clear(); onChange(null); };

  return (
    <div>
      <div style={{ border: '1px dashed #94a3b8', borderRadius: 10, background: '#fff', touchAction: 'none' }}>
        <SignatureCanvas
          ref={ref}
          penColor="#0f172a"
          onEnd={handleEnd}
          canvasProps={{ style: { width: '100%', height, borderRadius: 10, display: 'block' } }}
        />
      </div>
      <button type="button" onClick={clear}
        style={{ marginTop: 8, background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: '#64748b', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Eraser size={14} /> Effacer
      </button>
    </div>
  );
}
