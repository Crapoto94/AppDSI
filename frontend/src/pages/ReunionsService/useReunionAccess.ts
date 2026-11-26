import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Administrateur du module Réunions de service = admin global OU utilisateur
 * ayant la tuile du module cochée dans les paramètres du Hub. La décision est
 * prise par le backend (`GET /api/reunions-service/access`).
 */
export default function useReunionAccess() {
    const { token } = useAuth();
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        if (!token) return;
        let alive = true;
        axios.get('/api/reunions-service/access', {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(r => { if (alive) setIsAdmin(!!r.data?.admin); })
            .catch(() => { if (alive) setIsAdmin(false); });
        return () => { alive = false; };
    }, [token]);

    return isAdmin;
}
