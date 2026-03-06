import React from 'react';
import * as Icons from 'lucide-react';
import { ExternalLink, ArrowRight } from 'lucide-react';

interface TileLink {
  id: number;
  label: string;
  url: string;
  is_internal: boolean;
}

interface TileProps {
  title: string;
  icon: string;
  description: string;
  links: TileLink[];
}

const Tile: React.FC<TileProps> = ({ title, icon, description, links, status = 'normal' }) => {
  // Dynamically get icon from lucide-react
  // @ts-ignore
  const IconComponent = Icons[icon.charAt(0).toUpperCase() + icon.slice(1)] || Icons.Box;

  return (
    <div className="tile">
      <div className="tile-icon">
        <IconComponent size={32} />
      </div>
      <h3 className="tile-title">{title}</h3>
      <p className="tile-description">{description}</p>
      
      <div className="tile-links">
        {links.map((link) => (
          <a
            key={link.id}
            href={link.url}
            target={link.is_internal ? '_self' : '_blank'}
            rel="noopener noreferrer"
            className="tile-btn btn-secondary"
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
        }
        .tile:hover {
          transform: translateY(-5px);
          box-shadow: 0 10px 20px rgba(0,0,0,0.1);
        }
        .tile-icon {
          color: var(--primary-color);
          margin-bottom: 20px;
          background: rgba(227, 6, 19, 0.05);
          padding: 15px;
          border-radius: 50%;
        }
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
        .tile-btn:hover {
          opacity: 0.9;
        }
      `}</style>
    </div>
  );
};

export default Tile;
