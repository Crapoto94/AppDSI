// MagApp n'a pas de AuthContext : le jeton est lu dans le localStorage (même source que le reste de l'application).
export function useAuth(): { token: string | null } {
  let token: string | null = null;
  try { token = localStorage.getItem('token'); } catch { /* stockage indisponible */ }
  return { token };
}
