// Sécurité : retire les balises <base> et <meta http-equiv="refresh"> d'un fragment
// HTML avant de l'injecter via dangerouslySetInnerHTML. Un <base href="..."> collé
// depuis un email Outlook/Word (ou toute source externe) prend effet sur TOUTE la
// page une fois inséré dans le DOM — pas seulement le fragment — et détourne la
// résolution de tous les liens et appels relatifs de l'application (ex: navigation
// interne, appels /api/* avec le token d'auth). Un <meta refresh> peut de la même
// façon rediriger la page entière. À utiliser sur tout contenu qui peut provenir
// d'un import externe (email, copier-coller Word) plutôt que de la seule saisie
// interne via l'éditeur riche de l'app.
export function stripDangerousHtmlTags(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<base\b[^>]*>/gi, '')
    .replace(/<meta\b(?=[^>]*http-equiv\s*=\s*["']?refresh)[^>]*>/gi, '');
}
