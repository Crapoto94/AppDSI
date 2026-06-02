// Page autonome des paramètres du module Tickets, accessible hors du menu /admin
// (réservé aux admins globaux). Permet aux superviseurs d'accéder aux paramètres
// tickets via /tickets/admin. L'accès réel est vérifié par le rôle de module résolu.
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Header from '../../components/Header';
import TicketAdmin from './TicketAdmin';

const ALLOWED_ROLES = ['supervisor', 'superviseur', 'admin', 'superadmin', 'superadmins'];

export default function TicketAdminPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    axios.get('/api/tickets/my-role', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setAllowed(ALLOWED_ROLES.includes(String(r.data?.role || '').toLowerCase().trim())))
      .catch(() => setAllowed(false));
  }, []);

  return (
    <>
      <Header />
      {allowed === null && (
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: 40, color: '#94a3b8', fontFamily: 'system-ui, sans-serif' }}>Chargement…</div>
      )}
      {allowed === false && (
        <div style={{ maxWidth: 700, margin: '40px auto', padding: 24, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, color: '#b91c1c', fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Accès refusé</div>
          <div style={{ fontSize: 14 }}>La configuration des tickets est réservée aux superviseurs et administrateurs.</div>
        </div>
      )}
      {allowed === true && <TicketAdmin />}
    </>
  );
}
