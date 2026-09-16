import { useEffect, useState } from 'react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import { pdfjsLib } from '../../utils/pdfjs';

export type PdfSource = { file?: File; url?: string };

export interface PageSize {
  width: number;
  height: number;
  baseWidth: number;
  baseHeight: number;
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return 'Erreur de chargement du PDF';
}

/** Charge un PDF (fichier local ou URL protégée par JWT) et expose le document pdf.js. */
export function usePdfDocument(source: PdfSource | null | undefined, authToken?: string | null) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const file = source?.file;
  const url = source?.url;

  useEffect(() => {
    let cancelled = false;
    if (!file && !url) {
      setDoc(null);
      return;
    }
    setLoading(true);
    setError(null);
    (async () => {
      try {
        let task: PDFDocumentLoadingTask;
        if (file) {
          const buf = await file.arrayBuffer();
          task = pdfjsLib.getDocument({ data: new Uint8Array(buf) });
        } else {
          // Les ressources protégées exigent le JWT : on récupère le binaire
          // nous-mêmes puis on le passe à pdf.js (qui ne pose pas d'en-tête).
          const res = await fetch(url!, { headers: authToken ? { Authorization: `Bearer ${authToken}` } : {} });
          if (!res.ok) throw new Error(res.status === 403 ? 'Accès refusé' : `Erreur ${res.status}`);
          const buf = await res.arrayBuffer();
          task = pdfjsLib.getDocument({ data: new Uint8Array(buf) });
        }
        const d = await task.promise;
        if (!cancelled) setDoc(d);
      } catch (e: unknown) {
        if (!cancelled) setError(errorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [file, url, authToken]);

  return { doc, loading, error };
}
