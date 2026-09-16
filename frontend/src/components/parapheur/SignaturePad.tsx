import React from 'react';
import SignatureCanvas from 'react-signature-canvas';

interface Props {
  sigRef: React.MutableRefObject<SignatureCanvas | null>;
  height?: number;
  penColor?: string;
  /** Largeur maximale de la zone de dessin (px). */
  maxWidth?: number;
}

/** Zone de dessin de signature (souris / tactile). */
export default function SignaturePad({ sigRef, height = 240, penColor = '#0f172a', maxWidth = 520 }: Props) {
  return (
    <div style={{ border: '2px dashed #cbd5e1', borderRadius: 10, background: '#fff', padding: 4, maxWidth, width: '100%' }}>
      <SignatureCanvas
        ref={(r) => { sigRef.current = r; }}
        penColor={penColor}
        canvasProps={{
          style: { width: '100%', height, borderRadius: 8, touchAction: 'none', cursor: 'crosshair', display: 'block' },
        }}
      />
    </div>
  );
}
