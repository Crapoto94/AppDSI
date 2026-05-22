import React from 'react';
import * as Icons from 'lucide-react';
import { ExternalLink, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface TileLink {
  id?: number;
  label: string;
  url: string;
  is_internal: boolean;
}

interface TileProps {
  id: number;
  title: string;
  icon: string;
  description: string;
  links: TileLink[];
  status?: 'active' | 'maintenance' | 'soon';
  is_authorized?: boolean;
  is_public?: boolean;
  isAdmin?: boolean;
  orphan_orders?: number;
  orphan_invoices?: number;
  pending_requests?: number;
}

const Tile: React.FC<TileProps> = ({ id, title, icon, description, links, status = 'active', is_authorized = true, is_public = false, isAdmin = false, orphan_orders, orphan_invoices, pending_requests }) => {
  // Dynamically get icon from lucide-react
  // @ts-expect-error Lucide icons dynamically loaded
  const IconComponent = Icons[icon.charAt(0).toUpperCase() + icon.slice(1)] || Icons.Box;

  const isLocked = (status === 'maintenance' || status === 'soon') && !isAdmin;

  console.log(`Tile "${title}" props:`, { orphan_orders, orphan_invoices, pending_requests });

  return (
    <div className={`tile ${status} ${!is_authorized ? 'locked' : ''} ${isAdmin ? 'admin-mode' : ''}`}>
      {is_public && (
        <div className="public-badge">
          <Icons.Globe size={12} />
          <span>PUBLIC</span>
        </div>
      )}
      {status === 'soon' && isAdmin && (
        <div className="admin-soon-badge">
          <Icons.Clock size={12} />
          <span>SOON (ADMIN)</span>
        </div>
      )}
      {status === 'maintenance' && !isAdmin && (
        <div className="status-overlay">
          <Icons.Wrench size={24} />
          <span>EN MAINTENANCE</span>
        </div>
      )}
      {status === 'soon' && !isAdmin && (
        <div className="status-overlay soon">
          <Icons.Clock size={24} />
          <span>BIENTÔT DISPONIBLE</span>
        </div>
      )}
      <div className="tile-icon">
        <IconComponent size={32} />
      </div>
      {(pending_requests ?? 0) > 0 && (
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          background: '#ef4444',
          color: 'white',
          borderRadius: '50%',
          minWidth: '24px',
          height: '24px',
          fontSize: '12px',
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 5px',
          boxShadow: '0 2px 6px rgba(239,68,68,0.4)',
          border: '2px solid white',
          zIndex: 30
        }}>
          {pending_requests}
        </div>
      )}
      <h3 className="tile-title">{title}</h3>
      <p className="tile-description">{description}</p>

      <div className="tile-links">
        {is_authorized ? (
          links.map((link) => (
            <a
              key={link.id}
              href={isLocked ? '#' : link.url}
              target={link.is_internal || isLocked ? '_self' : '_blank'}
              rel="noopener noreferrer"
              className={`tile-btn btn-secondary ${isLocked ? 'disabled' : ''}`}
              onClick={(e) => isLocked && e.preventDefault()}
              draggable={false}
            >
              {link.label}
              {link.is_internal ? <ArrowRight size={14} /> : <ExternalLink size={14} />}
            </a>
          ))
        ) : status !== 'soon' ? (
          <Link
            to={`/request-access?preselect=${id}`}
            className="tile-btn btn-primary locked-btn"
            draggable={false}
          >
            <Icons.UserCheck size={16} />
            Demander l'accès
          </Link>
        ) : null}
      </div>

      <style>{`
        .tile {
          background: var(--white);
          padding: 30px;
          border-radius: 4px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          transition: var(--transition);
          box-shadow: 0 4px 6px rgba(0,0,0,0.05);
          border-top: 4px solid var(--primary-color);
          position: relative;
        }
        .tile.maintenance { border-top-color: #f59e0b; opacity: 0.8; }
        .tile.soon { border-top-color: #64748b; opacity: 0.5; filter: grayscale(100%); transition: all 0.3s ease; }
        .tile.soon.admin-mode { opacity: 0.9; filter: grayscale(30%); }
        .tile.soon.admin-mode:hover { opacity: 1; filter: grayscale(0%); }

        .public-badge {
          position: absolute;
          top: 10px;
          right: 10px;
          background: #dcfce7;
          color: #166534;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 10px;
          font-weight: 800;
          display: flex;
          align-items: center;
          gap: 4px;
          z-index: 30;
          border: 1px solid #bbf7d0;
        }

        .admin-soon-badge {
          position: absolute;
          top: 10px;
          left: 10px;
          background: #f1f5f9;
          color: #475569;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 10px;
          font-weight: 800;
          display: flex;
          align-items: center;
          gap: 4px;
          z-index: 30;
          border: 1px solid #e2e8f0;
        }

        .status-overlay {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(255, 255, 255, 0.7);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 10;
          color: #d97706;
          font-weight: 800;
          font-size: 14px;
          gap: 10px;
        }
        .status-overlay.soon { color: #475569; }
        .tile.locked {
          background: #f8fafc;
          border-top-color: #cbd5e1;
        }
        .tile.locked .tile-icon, .tile.locked .tile-title, .tile.locked .tile-description {
          opacity: 0.6;
          filter: grayscale(100%);
        }

        .tile:not(.maintenance):not(.soon):hover {
          transform: translateY(-5px);
          box-shadow: 0 10px 20px rgba(0,0,0,0.1);
        }
        .tile-icon {
          color: var(--primary-color);
          margin-bottom: 20px;
          background: rgba(227, 6, 19, 0.05);
          padding: 15px;
          border-radius: 50%;
          position: relative;
          z-index: 20;
          display: inline-block;
        }
        .orphan-badge {
          position: absolute;
          top: 5px;
          right: 5px;
          background: #f59e0b !important;
          color: white;
          border-radius: 50%;
          width: 25px;
          height: 25px;
          font-size: 12px;
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 6px rgba(0,0,0,0.3);
          border: 2px solid white;
          z-index: 100 !important;
        }
        .tile.maintenance .tile-icon { color: #f59e0b; background: #fffbeb; }
        .tile.soon .tile-icon { color: #64748b; background: #f8fafc; }

        .tile-title {
          font-size: 20px;
          font-weight: 700;
          margin-bottom: 12px;
          color: var(--secondary-color);
          position: relative;
          z-index: 20;
        }
        .tile-description {
          font-size: 14px;
          color: #666;
          margin-bottom: 25px;
          flex-grow: 1;
          position: relative;
          z-index: 20;
        }
        .tile-links {
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 100%;
          position: relative;
          z-index: 20;
        }
        .tile-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px;
          font-size: 14px;
          border-radius: 4px;
          transition: var(--transition);
        }
        .tile-btn.disabled {
          background: #e2e8f0;
          color: #94a3b8;
          border-color: #cbd5e1;
          cursor: not-allowed;
        }
        .tile-btn:not(.disabled):hover {
          opacity: 0.9;
        }
        .tile-btn.btn-primary.locked-btn {
          background: var(--primary-color);
          color: white;
          border: none;
        }
        .tile-btn.btn-primary.locked-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(227, 6, 19, 0.2);
        }
      `}</style>
    </div>
  );
};

export default Tile;
