const API_BASE = '/api/pdf-tools';

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function extractErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (data && data.message) return data.message;
    }
  } catch (e) { /* ignore */ }
  return fallback;
}

/** Envoie un FormData et renvoie la réponse binaire (Blob) + nom de fichier suggéré + en-têtes utiles. */
export async function postFormForBlob(
  path: string,
  formData: FormData,
  fallbackError = 'Une erreur est survenue.',
): Promise<{ blob: Blob; filename: string; headers: Headers }> {
  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers: authHeaders(), body: formData });
  if (!res.ok) throw new Error(await extractErrorMessage(res, fallbackError));
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(disposition);
  const rawName = match ? decodeURIComponent(match[1] || match[2] || '') : '';
  const filename = rawName || 'document.pdf';
  return { blob, filename, headers: res.headers };
}

/** Envoie un FormData et renvoie une réponse JSON. */
export async function postFormForJson<T = any>(
  path: string,
  formData: FormData,
  fallbackError = 'Une erreur est survenue.',
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers: authHeaders(), body: formData });
  if (!res.ok) throw new Error(await extractErrorMessage(res, fallbackError));
  return res.json();
}

export interface SaveResult { documentId: number | null; overwritten?: boolean; dbPath: string; url: string; name?: string; filename?: string }

/**
 * Enregistre le résultat dans la PDFothèque. Lance une erreur portant
 * `.code === 'DUPLICATE'` si un document du même nom existe déjà et que
 * `overwrite` est faux (l'appelant propose alors d'écraser ou de renommer).
 */
export async function saveResultToGed(blob: Blob, filename: string, { overwrite = false } = {}): Promise<SaveResult> {
  const formData = new FormData();
  formData.append('file', blob, filename);
  formData.append('filename', filename);
  if (overwrite) formData.append('overwrite', 'true');
  const res = await fetch(`${API_BASE}/save`, { method: 'POST', headers: authHeaders(), body: formData });
  if (!res.ok) {
    let code: string | undefined;
    let message = "Échec de la sauvegarde dans la PDFothèque.";
    try { const data = await res.json(); code = data.code; if (data.message) message = data.message; } catch { /* ignore */ }
    const err: any = new Error(message);
    err.code = code;
    throw err;
  }
  return res.json();
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ─── PDFothèque ──────────────────────────────────────────────────────────────

export interface LibraryDoc {
  id: number;
  title: string;
  filename: string | null;
  originalName: string;
  mimetype: string;
  size: number | null;
  created_at: string;
  updated_at: string;
  uploaded_by: string | null;
  version: number;
  url: string | null;
}

export async function getLibrary(): Promise<LibraryDoc[]> {
  const res = await fetch(`${API_BASE}/library`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await extractErrorMessage(res, 'Échec du chargement de la PDFothèque.'));
  return res.json();
}

export async function deleteLibraryItem(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/library/${id}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) throw new Error(await extractErrorMessage(res, 'Échec de la suppression.'));
}

export async function sendLibraryItem(
  id: number,
  payload: { to: string[]; subject?: string; message?: string },
): Promise<{ ok: boolean; sent: number }> {
  const res = await fetch(`${API_BASE}/library/${id}/send`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await extractErrorMessage(res, "Échec de l'envoi du mail."));
  return res.json();
}

export async function getLibraryBlob(id: number, inline = false): Promise<Blob> {
  const res = await fetch(`${API_BASE}/library/${id}/download${inline ? '?inline=1' : ''}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await extractErrorMessage(res, 'Échec du téléchargement.'));
  return res.blob();
}

export async function downloadLibraryItem(id: number, filename: string): Promise<void> {
  const blob = await getLibraryBlob(id, false);
  downloadBlob(blob, filename);
}
