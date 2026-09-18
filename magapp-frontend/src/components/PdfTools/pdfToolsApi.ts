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

export async function saveResultToGed(blob: Blob, filename: string): Promise<{ dbPath: string; url: string }> {
  const formData = new FormData();
  formData.append('file', blob, filename);
  formData.append('filename', filename);
  return postFormForJson('/save', formData, "Échec de la sauvegarde dans la GED.");
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

export function openBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
