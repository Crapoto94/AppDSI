// Les images d'imprimante/désignation (module consommables) sont stockées via
// le service GED unifié côté backend (shared/storage.js) : image_path vaut
// "storage/consommables/<désignation>/<fichier>", servi par le mount public
// /api/storage/... — visible depuis le DSI Hub ET le MagApp, contrairement à
// l'ancien chemin statique /images/designations/... propre au seul build du
// frontend 5173 (conservé ici par compatibilité descendante).
export function resolveDesignationImageUrl(imagePath?: string | null): string {
  if (!imagePath) return '';
  return imagePath.startsWith('storage/') ? `/api/storage/${imagePath.slice('storage/'.length)}` : imagePath;
}
