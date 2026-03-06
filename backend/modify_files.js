const fs = require('fs');

// 1. Modifier backend/server.js
let serverCode = fs.readFileSync('backend/server.js', 'utf8');
serverCode = serverCode.replace(
`const authenticateAdmin = (req, res, next) => {
    authenticateJWT(req, res, () => {
        if (req.user && req.user.role === 'admin') {
            next();
        } else {
            res.status(403).json({ message: 'Accès refusé : administrateur uniquement' });
        }
    });
};`,
`const authenticateAdmin = (req, res, next) => {
    authenticateJWT(req, res, () => {
        if (req.user && req.user.role === 'admin') {
            next();
        } else {
            res.status(403).json({ message: 'Accès refusé : administrateur uniquement' });
        }
    });
};

const authenticateAdminOrFinances = (req, res, next) => {
    authenticateJWT(req, res, () => {
        if (req.user && (req.user.role === 'admin' || req.user.role === 'finances')) {
            next();
        } else {
            res.status(403).json({ message: 'Accès refusé : administrateur ou finances uniquement' });
        }
    });
};`
);

serverCode = serverCode.replace(`app.post('/api/budget/import-lines', authenticateAdmin`, `app.post('/api/budget/import-lines', authenticateAdminOrFinances`);
serverCode = serverCode.replace(`app.post('/api/budget/import-invoices', authenticateAdmin`, `app.post('/api/budget/import-invoices', authenticateAdminOrFinances`);
serverCode = serverCode.replace(`app.post('/api/orders/import', authenticateAdmin`, `app.post('/api/orders/import', authenticateAdminOrFinances`);
serverCode = serverCode.replace(`app.get('/api/raw-data/:table', authenticateAdmin`, `app.get('/api/raw-data/:table', authenticateAdminOrFinances`);
serverCode = serverCode.replace(`app.post('/api/column-settings/:page', authenticateAdmin`, `app.post('/api/column-settings/:page', authenticateAdminOrFinances`);
serverCode = serverCode.replace(`app.post('/api/column-settings/:page/bulk', authenticateAdmin`, `app.post('/api/column-settings/:page/bulk', authenticateAdminOrFinances`);

serverCode = serverCode.replace(
`app.post('/api/tiles', authenticateAdmin, async (req, res) => {
    const { title, icon, description, sort_order } = req.body;
    const result = await db.run('INSERT INTO tiles (title, icon, description, sort_order) VALUES (?, ?, ?, ?)', [title, icon, description, sort_order || 0]);
    res.json({ id: result.lastID });
});`,
`app.post('/api/tiles', authenticateAdmin, async (req, res) => {
    const { title, icon, description, sort_order, status } = req.body;
    const result = await db.run('INSERT INTO tiles (title, icon, description, sort_order, status) VALUES (?, ?, ?, ?, ?)', [title, icon, description, sort_order || 0, status || 'normal']);
    res.json({ id: result.lastID });
});`
);

serverCode = serverCode.replace(
`app.put('/api/tiles/:id', authenticateAdmin, async (req, res) => {
    const { title, icon, description, sort_order } = req.body;
    await db.run('UPDATE tiles SET title = ?, icon = ?, description = ?, sort_order = ? WHERE id = ?', [title, icon, description, sort_order, req.params.id]);
    res.json({ message: 'Tile updated' });
});`,
`app.put('/api/tiles/:id', authenticateAdmin, async (req, res) => {
    const { title, icon, description, sort_order, status } = req.body;
    await db.run('UPDATE tiles SET title = ?, icon = ?, description = ?, sort_order = ?, status = ? WHERE id = ?', [title, icon, description, sort_order, status || 'normal', req.params.id]);
    res.json({ message: 'Tile updated' });
});`
);
fs.writeFileSync('backend/server.js', serverCode);

// 2. Modifier Admin.tsx
let adminCode = fs.readFileSync('frontend/src/pages/Admin.tsx', 'utf8');
adminCode = adminCode.replace(`const [newTile, setNewTile] = useState({ title: '', icon: 'box', description: '' });`, `const [newTile, setNewTile] = useState({ title: '', icon: 'box', description: '', status: 'normal' });`);
adminCode = adminCode.replace(
`                  <textarea 
                    placeholder="Description" 
                    value={newTile.description} 
                    onChange={e => setNewTile({...newTile, description: e.target.value})}
                    required
                  />
                  <button type="submit" className="btn btn-primary">Enregistrer</button>`,
`                  <textarea 
                    placeholder="Description" 
                    value={newTile.description} 
                    onChange={e => setNewTile({...newTile, description: e.target.value})}
                    required
                  />
                  <select
                    value={newTile.status}
                    onChange={e => setNewTile({...newTile, status: e.target.value})}
                  >
                    <option value="normal">Normal</option>
                    <option value="maintenance">En maintenance</option>
                    <option value="coming_soon">À venir</option>
                  </select>
                  <button type="submit" className="btn btn-primary">Enregistrer</button>`
);
adminCode = adminCode.replace(`setNewTile({ title: '', icon: 'box', description: '' });`, `setNewTile({ title: '', icon: 'box', description: '', status: 'normal' });`);

adminCode = adminCode.replace(
`                  <div className="tile-actions">
                    <button className="btn-icon" title="Supprimer" onClick={() => handleDeleteTile(tile.id)}>
                      <Trash2 size={20} color="var(--primary-color)" />
                    </button>
                  </div>`,
`                  <div className="tile-actions">
                    <select
                      value={(tile as any).status || 'normal'}
                      onChange={async (e) => {
                        await fetch(\`http://localhost:3001/api/tiles/\${tile.id}\`, {
                          method: 'PUT',
                          headers: { 'Authorization': \`Bearer \${token}\`, 'Content-Type': 'application/json' },
                          body: JSON.stringify({ ...tile, status: e.target.value })
                        });
                        fetchTiles();
                      }}
                      style={{ marginRight: '10px', padding: '5px', borderRadius: '4px', border: '1px solid #ddd' }}
                    >
                      <option value="normal">Normal</option>
                      <option value="maintenance">Maintenance</option>
                      <option value="coming_soon">À venir</option>
                    </select>
                    <button className="btn-icon" title="Supprimer" onClick={() => handleDeleteTile(tile.id)}>
                      <Trash2 size={20} color="var(--primary-color)" />
                    </button>
                  </div>`
);

adminCode = adminCode.replace(
`<option value="user">Utilisateur</option>
                    <option value="admin">Administrateur</option>`,
`<option value="user">Utilisateur</option>
                    <option value="finances">Finances</option>
                    <option value="admin">Administrateur</option>`
);
adminCode = adminCode.replace(
`<option value="user">Utilisateur</option>
                    <option value="admin">Administrateur</option>`,
`<option value="user">Utilisateur</option>
                    <option value="finances">Finances</option>
                    <option value="admin">Administrateur</option>`
);
adminCode = adminCode.replace(`.role-badge.admin { background: #ffebeb; color: var(--primary-color); }`, `.role-badge.admin { background: #ffebeb; color: var(--primary-color); }
        .role-badge.finances { background: #e8f5e9; color: #2e7d32; }`);
fs.writeFileSync('frontend/src/pages/Admin.tsx', adminCode);

// 3. Modifier Tile.tsx
let tileCode = fs.readFileSync('frontend/src/components/Tile.tsx', 'utf8');
tileCode = tileCode.replace(
`interface TileProps {
  title: string;
  icon: string;
  description: string;
  links: TileLink[];
}`,
`interface TileProps {
  title: string;
  icon: string;
  description: string;
  links: TileLink[];
  status?: string;
}`
);

tileCode = tileCode.replace(
`const Tile: React.FC<TileProps> = ({ title, icon, description, links }) => {`,
`const Tile: React.FC<TileProps> = ({ title, icon, description, links, status = 'normal' }) => {`
);

tileCode = tileCode.replace(
`return (
    <div className="tile">`,
`return (
    <div className={\`tile \${status !== 'normal' ? 'tile-' + status : ''}\`}>
      {status === 'maintenance' && <div className="tile-badge badge-maintenance">En maintenance</div>}
      {status === 'coming_soon' && <div className="tile-badge badge-coming">À venir</div>}`
);

tileCode = tileCode.replace(
`        .tile-btn:hover {
          opacity: 0.9;
        }`,
`        .tile-btn:hover {
          opacity: 0.9;
        }
        .tile { position: relative; overflow: hidden; }
        .tile-badge {
          position: absolute;
          top: 15px;
          right: -30px;
          background: var(--primary-color);
          color: white;
          padding: 4px 30px;
          font-size: 11px;
          font-weight: bold;
          text-transform: uppercase;
          transform: rotate(45deg);
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .badge-coming { background: var(--secondary-color); }
        .tile-maintenance { opacity: 0.7; filter: grayscale(80%); pointer-events: none; }
        .tile-coming_soon .tile-links { pointer-events: none; opacity: 0.5; }`
);
fs.writeFileSync('frontend/src/components/Tile.tsx', tileCode);

// 4. Modifier Budget.tsx
let budgetCode = fs.readFileSync('frontend/src/pages/Budget.tsx', 'utf8');
budgetCode = budgetCode.replace(
`{view !== 'summary' && user.role === 'admin' && (`,
`{view !== 'summary' && ['admin', 'finances'].includes(user.role) && (`
);
budgetCode = budgetCode.replace(
`{user.role === 'admin' && view !== 'summary' && (`,
`{['admin', 'finances'].includes(user.role) && view !== 'summary' && (`
);
budgetCode = budgetCode.replace(
`{user.role === 'admin' && <span className="drag-handle"`,
`{['admin', 'finances'].includes(user.role) && <span className="drag-handle"`
);
budgetCode = budgetCode.replace(
`draggable={user.role === 'admin'}`,
`draggable={['admin', 'finances'].includes(user.role)}`
);
budgetCode = budgetCode.replace(
`style={{ cursor: user.role === 'admin' ? 'grab' : 'default', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}`,
`style={{ cursor: ['admin', 'finances'].includes(user.role) ? 'grab' : 'default', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}`
);
budgetCode = budgetCode.replace(
`{user.role === 'admin' && (
                          <>
                            <input`,
`{['admin', 'finances'].includes(user.role) && (
                          <>
                            <input`
);
budgetCode = budgetCode.replace(
`disabled={user.role !== 'admin'}`,
`disabled={!['admin', 'finances'].includes(user.role)}`
);
fs.writeFileSync('frontend/src/pages/Budget.tsx', budgetCode);

// 5. Modifier Dashboard.tsx
let dashboardCode = fs.readFileSync('frontend/src/pages/Dashboard.tsx', 'utf8');
dashboardCode = dashboardCode.replace(
`icon: string;
  description: string;
  links: any[];
}`,
`icon: string;
  description: string;
  links: any[];
  status?: string;
}`
);
dashboardCode = dashboardCode.replace(
`title={tile.title}
                icon={tile.icon}
                description={tile.description}
                links={tile.links}`,
`title={tile.title}
                icon={tile.icon}
                description={tile.description}
                links={tile.links}
                status={tile.status}`
);
fs.writeFileSync('frontend/src/pages/Dashboard.tsx', dashboardCode);

console.log("Modifications appliquées.");
