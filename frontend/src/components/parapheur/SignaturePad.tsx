import React from 'react';
import SignatureCanvas from 'react-signature-canvas';

interface Props {
  sigRef: React.MutableRefObject<SignatureCanvas | null>;
  height?: number;
  penColor?: string;
}

/** Zone de dessin de signature (souris / tactile). */
export default function SignaturePad({ sigRef, height = 180, penColor = '#0f172a' }: Props) {
  return (
    <div style={{ border: '2px dashed #cbd5e1', borderRadius: 10, background: '#fff', padding: 4 }}>
      <SignatureCanvas
        ref={(r) => { sigRef.current = r; }}
        penColor={penColor}
        canvasProps={{
          style: { width: '100%', height, borderRadius: 8, touchAction: 'none', cursor: 'crosshair' },
        }}
      />
    </div>
  );
}
