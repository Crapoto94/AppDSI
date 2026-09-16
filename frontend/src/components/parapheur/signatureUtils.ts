import type SignatureCanvas from 'react-signature-canvas';

/**
 * Renvoie la signature (dataURL PNG rognée sur le tracé) d'un pad.
 *
 * On n'utilise volontairement PAS `getTrimmedCanvas()` de react-signature-canvas :
 * celui-ci s'appuie sur `trim-canvas`, dont l'import par défaut n'est pas une
 * fonction une fois bundlé par Vite (`import_trim_canvas.default is not a function`).
 * On rogne donc nous-mêmes la zone transparente du canvas.
 */
export function signatureDataUrl(pad: SignatureCanvas | null): string | null {
  if (!pad || pad.isEmpty()) return null;
  const canvas = pad.getCanvas();
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas.toDataURL('image/png');

  const { width, height } = canvas;
  let top = height, left = width, right = -1, bottom = -1;
  try {
    const { data } = ctx.getImageData(0, 0, width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 0) {
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
    }
  } catch {
    return canvas.toDataURL('image/png');
  }

  if (right < left || bottom < top) return canvas.toDataURL('image/png');

  const pad2 = 6;
  left = Math.max(0, left - pad2);
  top = Math.max(0, top - pad2);
  right = Math.min(width - 1, right + pad2);
  bottom = Math.min(height - 1, bottom + pad2);
  const w = right - left + 1;
  const h = bottom - top + 1;

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d');
  if (!octx) return canvas.toDataURL('image/png');
  octx.drawImage(canvas, left, top, w, h, 0, 0, w, h);
  return out.toDataURL('image/png');
}
