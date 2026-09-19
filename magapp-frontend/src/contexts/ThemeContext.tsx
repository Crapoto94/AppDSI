import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'ui-theme';

function applyTheme(theme: Theme) {
    // Volontairement PAS de `color-scheme: dark` : le mode sombre est obtenu par
    // une inversion globale (cf. index.css). Laisser les contrôles natifs en
    // schéma clair garantit qu'ils s'inversent correctement eux aussi.
    document.documentElement.setAttribute('data-theme', theme);
}

function initialTheme(): Theme {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'dark' || saved === 'light') return saved;
    } catch { /* ignore */ }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

interface ThemeContextType {
    theme: Theme;
    isDark: boolean;
    setTheme: (theme: Theme) => void;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
    const [theme, setThemeState] = useState<Theme>(() => initialTheme());
    const userChangedRef = useRef(false);
    const themeRef = useRef(theme);
    // Le MagApp recharge la fenêtre après connexion : le jeton est donc présent
    // dès le montage du provider.
    const [token] = useState<string | null>(() => localStorage.getItem('token'));

    useEffect(() => {
        themeRef.current = theme;
        applyTheme(theme);
        try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
    }, [theme]);

    useEffect(() => {
        if (!token) return;
        let cancelled = false;
        fetch('/api/user-prefs/theme', { headers: { Authorization: `Bearer ${token}` } })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (cancelled || userChangedRef.current) return;
                if (data?.theme === 'light' || data?.theme === 'dark') {
                    setThemeState(data.theme);
                } else if (data) {
                    fetch('/api/user-prefs/theme', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ theme: themeRef.current }),
                    }).catch(() => { /* ignore */ });
                }
            })
            .catch(() => { /* préférence locale conservée */ });
        return () => { cancelled = true; };
    }, [token]);

    const setTheme = useCallback((next: Theme) => {
        userChangedRef.current = true;
        setThemeState(next);
        const storedToken = localStorage.getItem('token');
        if (storedToken) {
            fetch('/api/user-prefs/theme', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${storedToken}` },
                body: JSON.stringify({ theme: next }),
            }).catch(() => { /* ignore */ });
        }
    }, []);

    const toggleTheme = useCallback(() => {
        setTheme(theme === 'dark' ? 'light' : 'dark');
    }, [theme, setTheme]);

    return (
        <ThemeContext.Provider value={{ theme, isDark: theme === 'dark', setTheme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
