import { Navigate, useParams } from 'react-router-dom';

// Profil minimal du lien de partage : accès UNIQUEMENT au Transcript Manager.
// Rôle 'transcript_guest' (lien de partage, lecture seule) ou 'transcript_agent'
// (accès depuis le Magasin d'application, import/résumé autorisés). Le rôle réel
// est porté par le JWT signé par le backend et est rafraîchi par AuthContext
// via /api/auth/me. On le décode ici de façon SYNCHRONE afin que PrivateRoute
// et les composants aient le bon profil dès le premier rendu.
const GUEST_USER = {
    id: 0,
    username: 'partage-transcript',
    displayName: 'Transcript Manager',
    role: 'transcript_guest',
    is_approved: 1,
    email: undefined,
    service_code: undefined,
    service_complement: undefined,
    authorized_urls: ['/transcriptmanager', '/transcript'],
};

function decodeTokenUser(token: string) {
    try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (!payload || payload.scope !== 'transcript') return GUEST_USER;
        const role = payload.role === 'transcript_agent' ? 'transcript_agent' : 'transcript_guest';
        return {
            id: payload.id || 0,
            username: payload.username || GUEST_USER.username,
            displayName: payload.displayName || payload.username || GUEST_USER.displayName,
            role,
            is_approved: 1,
            email: payload.email || undefined,
            service_code: payload.service_code || undefined,
            service_complement: payload.service_complement || undefined,
            authorized_urls: ['/transcriptmanager', '/transcript'],
        };
    } catch {
        return GUEST_USER;
    }
}

export default function TranscriptShare() {
    const { token } = useParams<{ token: string }>();

    if (!token) {
        return (
            <div style={{ padding: 48, textAlign: 'center', fontFamily: 'sans-serif' }}>
                <p>Lien de partage invalide.</p>
                <p>
                    <a href="/transcriptmanager">Accéder au Transcript Manager</a>
                </p>
            </div>
        );
    }

    // Écriture SYNCHRONE (avant le rendu de la cible) : PrivateRoute lit le
    // localStorage au premier rendu. Même schéma que le bootstrap kiosque.
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(decodeTokenUser(token)));
    localStorage.setItem('restrictedPath', '/transcriptmanager?nomenu=1');

    return <Navigate to="/transcriptmanager?nomenu=1" replace />;
}