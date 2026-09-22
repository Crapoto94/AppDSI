import { Navigate, useParams } from 'react-router-dom';

// Accès « module seul » à Mes notes IA depuis le Magasin d'applications
// (magapp). Le JWT signé par le backend (scope 'notes') est posé de façon
// SYNCHRONE avant le rendu de la cible, car PrivateRoute lit le localStorage
// dès le premier rendu.
const RESTRICTED_PATH = '/notes?nomenu=1';

function decodeTokenUser(token: string) {
    try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        return {
            id: payload.id || 0,
            username: payload.username || 'agent',
            displayName: payload.displayName || payload.username || 'Mes notes IA',
            role: payload.role || 'user',
            is_approved: 1,
            email: payload.email || undefined,
            service_code: payload.service_code || undefined,
            service_complement: payload.service_complement || undefined,
            authorized_urls: ['/notes'],
        };
    } catch {
        return {
            id: 0,
            username: 'agent',
            displayName: 'Mes notes IA',
            role: 'user',
            is_approved: 1,
            authorized_urls: ['/notes'],
        };
    }
}

export default function NotesShare() {
    const { token } = useParams<{ token: string }>();

    if (!token) {
        return (
            <div style={{ padding: 48, textAlign: 'center', fontFamily: 'sans-serif' }}>
                <p>Lien d'accès invalide.</p>
                <p>
                    <a href="/notes">Accéder à Mes notes IA</a>
                </p>
            </div>
        );
    }

    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(decodeTokenUser(token)));
    localStorage.setItem('restrictedPath', RESTRICTED_PATH);

    return <Navigate to={RESTRICTED_PATH} replace />;
}
