import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface User {
    id: number;
    username: string;
    role: string;
    is_approved?: number;
    service_code?: string;
    service_complement?: string;
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
                if (updatedUser.role === 'admin' || updatedUser.username?.toLowerCase() === 'admin') {
                    updatedUser.is_approved = 1;
                }

                setUser(updatedUser);
                localStorage.setItem('user', JSON.stringify(updatedUser));
                setToken(storedToken);
            } else {
                console.error('Failed to fetch refreshed user profile, logging out.');
                logout();
            }
        } catch (error) {
            console.error('Error refreshing user profile:', error);
            logout();
        }
    };

    useEffect(() => {
        const checkAuthStatus = async () => {
            const storedToken = localStorage.getItem('token');
            const storedUser = localStorage.getItem('user');

            if (storedToken && storedUser) {
                try {
                    let parsedUser = JSON.parse(storedUser);
                    
                    // Sécurité : Forcer l'approbation si admin au chargement
                    if (parsedUser.role === 'admin' || parsedUser.username?.toLowerCase() === 'admin') {
                        parsedUser.is_approved = 1;
                    }

                    setUser(parsedUser);
                    setToken(storedToken);
                } catch (error) {
                    console.error('Failed to parse stored user data, logging out:', error);
                    logout();
                    return;
                }
                await refreshUser();
            } else {
                logout();
            }
        };
        checkAuthStatus();
    }, []);

    const login = (newToken: string, newUser: User) => {
        // Sécurité : Forcer l'approbation si admin lors du login
        if (newUser.role === 'admin' || newUser.username?.toLowerCase() === 'admin') {
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
