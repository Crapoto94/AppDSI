import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

// Jeton kiosque DSI Dashboard : ?device_token=... permet un affichage automatisé
// sans passer par l'écran de connexion (poste en mode kiosque). Exécuté à
// l'évaluation du module — donc AVANT le tout premier rendu React — car
// `PrivateRoute` (App.tsx) lit le localStorage de façon synchrone : si on
// n'écrivait le token que dans un useEffect, ce premier rendu le verrait vide
// et redirigerait vers /login (reproductible en fenêtre de navigation privée).
(function bootstrapKioskDeviceToken() {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const deviceToken = urlParams.get('device_token');
    if (!deviceToken) return;
    localStorage.setItem('token', deviceToken);
    localStorage.removeItem('user');
    urlParams.delete('device_token');
    const cleanQuery = urlParams.toString();
    window.history.replaceState(null, '', window.location.pathname + (cleanQuery ? `?${cleanQuery}` : '') + window.location.hash);
})();

interface User {
    id: number;
    username: string;
    displayName?: string;
    role: string;
    email?: string;
    is_approved?: number;
    service_code?: string;
    service_complement?: string;
    authorized_urls?: string[];
    est_pmo?: boolean;
    est_manager?: boolean;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    pendingApproval: { username: string; message: string } | null;
    login: (newToken: string, newUser: User) => void;
    refreshUser: () => Promise<void>;
    setPendingApproval: (data: { username: string; message: string } | null) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [pendingApproval, setPendingApproval] = useState<{ username: string; message: string } | null>(null);

    const refreshUser = async () => {
        const storedToken = token || localStorage.getItem('token');
        if (!storedToken) {
            logout();
            return;
        }

        try {
            const res = await fetch('/api/auth/me', {
                headers: { 'Authorization': `Bearer ${storedToken}` }
            });
            if (res.ok) {
                let updatedUser = await res.json();

                // Sécurité : Forcer l'approbation si admin
                if (['admin', 'superadmin'].includes(updatedUser.role) || updatedUser.username?.toLowerCase() === 'admin') {
                    updatedUser.is_approved = 1;
                }

                setUser(updatedUser);
                localStorage.setItem('user', JSON.stringify(updatedUser));
                setToken(storedToken);
            } else if (res.status === 401 || res.status === 403) {
                // Le serveur a explicitement rejeté le token : vraie déconnexion.
                console.error('Token rejeté par le serveur, déconnexion.');
                logout();
            } else {
                // Erreur serveur (5xx, etc.) : ne pas effacer la session locale.
                console.error('Échec du rafraîchissement du profil (erreur serveur), session locale conservée.');
            }
        } catch (error) {
            // Erreur réseau (serveur/DNS pas encore joignable au démarrage, etc.) :
            // ne pas effacer le token, la session locale reste valide en attendant.
            console.error('Erreur réseau lors du rafraîchissement du profil, session locale conservée :', error);
        }
    };

    useEffect(() => {
        const checkAuthStatus = async () => {
            const storedToken = localStorage.getItem('token');
            const storedUser = localStorage.getItem('user');

            if (!storedToken) {
                logout();
                return;
            }

            if (storedUser) {
                try {
                    let parsedUser = JSON.parse(storedUser);

                    // Sécurité : Forcer l'approbation si admin au chargement
                    if (['admin', 'superadmin'].includes(parsedUser.role) || parsedUser.username?.toLowerCase() === 'admin') {
                        parsedUser.is_approved = 1;
                    }

                    setUser(parsedUser);
                } catch (error) {
                    console.error('Failed to parse stored user data:', error);
                }
            }
            setToken(storedToken);
            await refreshUser();
        };
        checkAuthStatus();
    }, []);

    const login = (newToken: string, newUser: User) => {
        // Sécurité : Forcer l'approbation si admin lors du login
        if (['admin', 'superadmin'].includes(newUser.role) || newUser.username?.toLowerCase() === 'admin') {
            newUser.is_approved = 1;
        }
        
        localStorage.setItem('token', newToken);
        localStorage.setItem('user', JSON.stringify(newUser));
        setToken(newToken);
        setUser(newUser);
        setPendingApproval(null);
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('restrictedPath');
        setToken(null);
        setUser(null);
        setPendingApproval(null);
    };

    return (
        <AuthContext.Provider value={{ user, token, pendingApproval, login, refreshUser, setPendingApproval, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
