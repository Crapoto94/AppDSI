import { Navigate, useParams } from 'react-router-dom';

// Profil minimal du lien de partage : accès UNIQUEMENT au Transcript Manager.
// Le rôle 'transcript_guest' est généré par le backend (GET /api/transcriptmanager/share-link)
// qui signe un JWT portant `scope: 'transcript'`.
const SHARE_USER = {
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
    localStorage.setItem('user', JSON.stringify(SHARE_USER));
    localStorage.setItem('restrictedPath', '/transcriptmanager?nomenu=1');

    return <Navigate to="/transcriptmanager?nomenu=1" replace />;
}