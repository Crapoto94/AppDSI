import React from 'react';
import { 
  LayoutDashboard, Users, Layers, Zap, Link2, 
  Puzzle, Settings, FileText 
} from 'lucide-react';

interface SidebarItemProps {
  icon: React.ElementType;
  label: string;
  active?: boolean;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ icon: Icon, label, active }) => (
  <div className={`sidebar-item ${active ? 'active' : ''}`}>
    <Icon size={20} className="sidebar-icon" />
    <span className="sidebar-label">{label}</span>
  </div>
);

const SidebarStudio: React.FC = () => {
  return (
    <aside className="studio-sidebar">
      <div className="sidebar-items">
        <SidebarItem icon={LayoutDashboard} label="Dashboard" />
        <SidebarItem icon={Users} label="Utilisateurs" active />
        <SidebarItem icon={Layers} label="Unités" />
        <SidebarItem icon={Zap} label="Alignements" />
        <SidebarItem icon={Link2} label="Connecteurs" />
        <SidebarItem icon={Puzzle} label="Modules" />
        <SidebarItem icon={Settings} label="Paramètres" />
        <SidebarItem icon={FileText} label="Logs" />
      </div>

      <style>{`
        .studio-sidebar {
          width: 240px;
          background-color: #f8fafc;
          border-right: 1px solid #e2e8f0;
          height: 100vh;
          padding: 24px 0;
          display: flex;
          flex-direction: column;
        }

        .sidebar-items {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 0 12px;
        }

        .sidebar-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 16px;
          border-radius: 8px;
          color: #64748b;
          cursor: pointer;
          transition: all 0.2s ease;
          font-weight: 500;
          font-size: 14px;
        }

        .sidebar-item:hover {
          background-color: #f1f5f9;
          color: #0f172a;
        }

        .sidebar-item.active {
          background-color: #ecfdf5;
          color: #065f46;
        }

        .sidebar-icon {
          flex-shrink: 0;
        }

        .sidebar-label {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>
    </aside>
  );
};

export default SidebarStudio;
