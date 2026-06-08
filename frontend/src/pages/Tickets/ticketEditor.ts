import axios from 'axios';

// Barre d'outils WYSIWYG pour la description d'un ticket (avec insertion d'image).
export const QUILL_MODULES = {
  toolbar: [
    ['bold', 'italic', 'underline'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link', 'image'],
    ['clean'],
  ],
};

// Quill renvoie '<p><br></p>' quand l'éditeur est vide.
export function isQuillEmpty(html: string): boolean {
  if (!html) return true;
  const stripped = html.replace(/<(p|br|span|div)[^>]*>/gi, '').replace(/<\/(p|span|div)>/gi, '').trim();
  return stripped === '' && !/<img|<a\b/i.test(html);
}

// Upload des images base64 (collées/insérées dans l'éditeur) en pièces jointes du
// ticket, puis renvoie le HTML avec les src réécrits vers l'URL de la PJ stockée
// (/api/tickets/{id}/attachments/{attId}) — même principe que les images inline des mails.
export async function uploadInlineImages(html: string, ticketId: number, token: string): Promise<string> {
  if (!html || !html.includes('data:image/')) return html;
  let result = html;
  const matches = [...html.matchAll(/src="(data:(image\/[a-zA-Z0-9+.-]+);base64,([^"]+))"/g)];
  let n = 0;
  for (const m of matches) {
    const fullSrc = m[1], mime = m[2], b64 = m[3];
    try {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const ext = (mime.split('/')[1] || 'png').replace('+xml', '');
      const file = new File([arr], `image_${Date.now()}_${n++}.${ext}`, { type: mime });
      const fd = new FormData();
      fd.append('file', file);
      const up = await axios.post(`/api/tickets/${ticketId}/attachments`, fd, { headers: { Authorization: `Bearer ${token}` } });
      if (up.data?.id) result = result.split(fullSrc).join(`/api/tickets/${ticketId}/attachments/${up.data.id}`);
    } catch (e) {
      console.error('Upload image inline échoué:', e);
    }
  }
  return result;
}
