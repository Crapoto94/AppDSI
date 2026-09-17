import { Navigate, useParams } from 'react-router-dom';

/**
 * Accès « module seul » au Parapheur depuis le Magasin d'applications. Le JWT
 * signé par le backend (scope 'parapheur', rôle 'parapheur_agent') est posé de
 * façon SYNCHRONE avant le rendu de la cible, car PrivateRoute lit le
 * localStorage dès le premier rendu.
 */
const RESTRICTED_PATH = '/parapheur?nomenu=1';

function decodeTokenUser(token: string) {
    try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        return {
            id: payload.id || 0,
            username: payload.username || 'parapheur-agent',
            displayName: payload.displayName || payload.username || 'Parapheur',
            role: 'parapheur_agent',
            is_approved: 1,
            email: payload.email || undefined,
            service_code: payload.service_code || undefined,
            service_complement: payload.service_complement || undefined,
            authorized_urls: ['/parapheur'],
        };
    } catch {
        return {
            id: 0,
            username: 'parapheur-agent',
            displayName: 'Parapheur',
            role: 'parapheur_agent',
            is_approved: 1,
            authorized_urls: ['/parapheur'],
        };
    }
}

export default function ParapheurShare() {
    const { token } = useParams<{ token: string }>();

    if (!token) {
        return (
            <div style={{ padding: 48, textAlign: 'center', fontFamily: 'sans-serif' }}>
                <p>Lien d'accès invalide.</p>
                <p>
                    <a href="/parapheur">Accéder au parapheur</a>
                </p>
            </div>
        );
    }

    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(decodeTokenUser(token)));
    localStorage.setItem('restrictedPath', RESTRICTED_PATH);

    return <Navigate to={RESTRICTED_PATH} replace />;
}
