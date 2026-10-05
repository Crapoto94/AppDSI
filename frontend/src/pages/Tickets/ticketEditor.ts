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

// Quill ne préfixe JAMAIS le schéma d'une URL : Link.sanitize() valide
// « google.fr » (le navigateur le résout temporairement en https pour lire le
// protocole) puis le renvoie tel quel dans href. Le lien est donc stocké en
// relatif et, une fois la page ouverte sur /tickets/12345, le navigateur le
// résout contre la route courante → https://<domaine>/tickets/google.fr.
// On normalise en https:// les href sans schéma.
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export function withScheme(href: string): string {
  const raw = String(href || '').trim();
  if (!raw) return href;
  if (raw.startsWith('#')) return href;            // ancre interne
  if (raw.startsWith('//')) return `https:${raw}`;  // protocol-relative
  if (HAS_SCHEME.test(raw)) return href;           // http(s), mailto, tel, about:blank…
  if (raw.startsWith('/')) return href;            // chemin absolu applicatif (/api, /tickets)
  return `https://${raw}`;
}

// Normalise tous les <a href="…"> d'un HTML de commentaire. Appliqué à
// l'affichage (corrige les commentaires déjà enregistrés) et à l'enregistrement
// (corrige le contenu stocké, donc aussi les mails envoyés au demandeur).
export function normalizeLinksHtml(html: string): string {
  if (!html || !/<a\s/i.test(html)) return html;
  return html.replace(
    /(<a\b[^>]*?\shref\s*=\s*)(["'])([^"']*)\2/gi,
    (match, head: string, quote: string, href: string) => {
      const fixed = withScheme(href);
      return fixed === href ? match : `${head}${quote}${fixed}${quote}`;
    }
  );
}

// Quill renvoie '<p><br></p>' quand l'éditeur est vide.
export function isQuillEmpty(html: string): boolean {
  if (!html) return true;
  const stripped = html.replace(/<(p|br|span|div)[^>]*>/gi, '').replace(/<\/(p|span|div)>/gi, '').trim();
  return stripped === '' && !/<img|<a\b/i.test(html);
}

// Upload des images base64 (collées/insérées dans l'éditeur) en pièces jointes du
// ticket, puis renvoie le HTML avec les src réécrits vers l'URL de la PJ stockée
// (/api/tickets/{id}/attachments/{attId}) — même principe que les images inline des mails.
export async function uploadInlineImages(html: string, ticketId: number, token: string | null): Promise<string> {
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
