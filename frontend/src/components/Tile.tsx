import React from 'react';
import * as Icons from 'lucide-react';
import { ExternalLink, ArrowRight } from 'lucide-react';

interface TileLink {
  id?: number;
  label: string;
  url: string;
  is_internal: boolean;
}

interface TileProps {
  title: string;
  icon: string;
  description: string;
  links: TileLink[];
  status?: 'active' | 'maintenance' | 'soon';
  orphan_orders?: number;
  orphan_invoices?: number;
}

const Tile: React.FC<TileProps> = ({ title, icon, description, links, status = 'active', orphan_orders, orphan_invoices }) => {
  // Dynamically get icon from lucide-react
  // @ts-expect-error Lucide icons dynamically loaded
  const IconComponent = Icons[icon.charAt(0).toUpperCase() + icon.slice(1)] || Icons.Box;

  const isLocked = status === 'maintenance' || status === 'soon';

  return (
    <div className={`tile ${status}`}>
      {status === 'maintenance' && (
        <div className="status-overlay">
          <Icons.Wrench size={24} />
          <span>EN MAINTENANCE</span>
        </div>
      )}
      {status === 'soon' && (
        <div className="status-overlay soon">
          <Icons.Clock size={24} />
          <span>BIENTÔT DISPONIBLE</span>
        </div>
      )}

      <div className="tile-icon">
        <IconComponent size={32} />
        {status === 'active' && (orphan_orders || orphan_invoices) ? (
          <div className="orphan-badge" title="Éléments non rapprochés">
            {(orphan_orders || 0) + (orphan_invoices || 0)}
          </div>
        ) : null}
      </div>
      <h3 className="tile-title">{title}</h3>
      <p className="tile-description">{description}</p>

      <div className="tile-links">
        {links.map((link) => (
          <a
            key={link.id}
            href={isLocked ? '#' : link.url}
            target={link.is_internal || isLocked ? '_self' : '_blank'}
            rel="noopener noreferrer"
            className={`tile-btn btn-secondary ${isLocked ? 'disabled' : ''}`}
            onClick={(e) => isLocked && e.preventDefault()}
          >
            {link.label}
            {link.is_internal ? <ArrowRight size={14} /> : <ExternalLink size={14} />}
          </a>
        ))}
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
          overflow: hidden;
        }
        .tile.maintenance { border-top-color: #f59e0b; opacity: 0.8; }
        .tile.soon { border-top-color: #64748b; opacity: 0.8; }

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
        }
        .orphan-badge {
          position: absolute;
          top: -5px;
          right: -5px;
          background: var(--primary-color);
          color: white;
          border-radius: 50%;
          width: 22px;
          height: 22px;
          font-size: 11px;
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          border: 2px solid white;
        }
        .tile.maintenance .tile-icon { color: #f59e0b; background: #fffbeb; }
        .tile.soon .tile-icon { color: #64748b; background: #f8fafc; }

        .tile-title {
          font-size: 20px;
          font-weight: 700;
          margin-bottom: 12px;
          color: var(--secondary-color);
        }
        .tile-description {
          font-size: 14px;
          color: #666;
          margin-bottom: 25px;
          flex-grow: 1;
        }
        .tile-links {
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 100%;
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
      `}</style>
    </div>
  );
};

export default Tile;
