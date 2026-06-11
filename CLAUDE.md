# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Start everything (Windows)
```bat
run_all.bat
```
Or start each service individually:
```bat
cd backend && npm start          # port 3001
cd frontend && npm run dev       # port 5173
cd magapp-frontend && npm run dev # port 5174
```

### Frontend
```bash
cd frontend
npm run dev      # dev server with HMR
npm run build    # tsc + vite build
npm run lint     # eslint
```

### Backend
```bash
cd backend
npm start        # node server.js (no nodemon)
```
No tests are configured (`npm test` exits with error).

---

## Architecture Overview

### Three services

| Service | Port | Stack |
|---|---|---|
| Backend | 3001 | Node.js / Express 5, CommonJS |
| Frontend (DSI Hub) | 5173 | React 19 + TypeScript, Vite, React Router v7 |
| MagApp Frontend | 5174 | React 19 + TypeScript, Vite (simpler, fewer pages) |

The frontend Vite dev server proxies `/api`, `/uploads`, `/img`, and `/file_*` paths to `http://127.0.0.1:3001`.

### Databases — dual-DB architecture

The backend uses **two databases simultaneously**:

- **SQLite** (`backend/data/database.sqlite`) — legacy local store for users (hub.users mirror), AD settings, Azure AD settings, and some Oracle-imported data. Accessed via `getSqlite()` / `db` variable in `server.js`.
- **PostgreSQL** (external at `10.103.130.106`) — primary store for all application data, organized into schemas:
  - `hub` — users (`hub.users`), certificates, calendars, backlog, email automations
  - `hub_tickets` — full ticket system (20+ tables)
  - `hub_consommables` — consumables management
  - `hub_contrats` — contracts
  - `hub_copieurs` — copier management
  - `hub_rencontres` — budget meetings
  - `hub_calendrier` — O365 calendars
  - `glpi` — GLPI sync mirror (tickets, followups, observers, sync logs)
  - `magapp` — application portal (apps, categories, users, ideas)
  - `projets` — project portfolio
  - `transcript` — meeting transcripts

**Critical**: `user.id` in the JWT comes from SQLite and **does not match** `hub.users.id` in PostgreSQL. Never use `user.id` to query PostgreSQL `hub.users`. Always join by `username` instead.

### pgDb wrapper (`backend/shared/pg_db.js`)

The `pgDb` object (`get`, `all`, `run`) is a PostgreSQL wrapper that:
1. **Auto-converts bare table names** — e.g. `users` → `hub.users`, `tickets` → `hub_tickets.tickets` (see `convertSqliteToPostgres`). Always use fully-qualified schema names (e.g. `hub_tickets.tickets`) to avoid ambiguous rewrites.
2. **Inlines parameters** — `$1`, `$2` are replaced with escaped literal values before sending to Postgres (not true prepared statements). This means `inlineParams` is called on every query.

### Backend structure

- **`backend/server.js`** — monolithic entry point (~3600 lines). Handles auth (AD, Azure AD, local), many legacy routes, `setupPgDb()` schema initialization, and mounts all module routers.
- **`backend/modules/*/`** — newer feature modules, each with a `controller.js` and `routes.js`. More complex modules (tickets, tasks) also have `services/`, `repositories/`, `middleware/`, `dtos/`.
- **`backend/shared/`** — shared utilities: `database.js` (exports `pgDb`, `pool`, `getSqlite`, `setupPgDb`), `middleware.js` (JWT auth, role helpers), `config.js` (SECRET_KEY, etc.), `pg_db.js` (PostgreSQL wrapper + full schema initialization).

All new modules should be placed in `backend/modules/` and registered in `server.js` via `app.use('/api/...', require('./modules/.../...routes'))`.

### Frontend structure

- **`frontend/src/App.tsx`** — all routes defined here with `PrivateRoute` wrapper.
- **`frontend/src/contexts/AuthContext.tsx`** — `useAuth()` hook provides `{ user, token, login, logout, refreshUser }`. `user` comes from localStorage/JWT; the role it carries (`user.role`) is the **global** role from `hub.users`, not the tickets module role.
- **`frontend/src/pages/`** — one file per page. Tickets module lives in `frontend/src/pages/Tickets/`.
- **No component library** — all UI is inline CSS-in-JS (style objects or `document.head.appendChild(style)` for class-based styles). This is the established convention; follow it.
- Icons: `lucide-react`. Charts: `recharts`. Rich text: `react-quill-new`.

### Authentication & roles

- JWT has no expiry. Payload: `{ id, username, role, email, is_approved, service_code, service_complement }`.
- Global roles: `superadmin`, `admin`, `user`, `magapp`, `readonly`.
- **Tickets module roles** are resolved via `resolveTicketRole(user)` in `backend/modules/tickets/middleware/ticket-permissions.js`. This checks `hub_tickets.technician_profiles.module_role` by **username** (not id) when the global role is `user`. Module roles: `supervisor`, `technician`, `admin`, `superadmin`.
- `GET /api/tickets/my-role` returns the resolved module role for the current user.

### Tasks module (`/api/tasks`)

- `GET /api/tasks/by-context?source=ticket&id=<glpi_id>` — fetches tasks linked to a ticket.
- `PATCH /api/tasks/personal/:id` with `{ statut }` — updates task status. Cycle: `a_faire` → `en_cours` → `terminé` → `a_faire`.

### GLPI sync (`backend/modules/glpi/`)

GLPI is **no longer connected** — the app is now autonomous. The `glpi.*` schema is a legacy mirror; `hub_tickets.*` is the live system. Routes under `/api/glpi/` remain for historical imports only.

### Mail collector (`backend/modules/mail_collector/`)

Tickets are created from O365 emails via `MailCollectorService`. Key behavior:
- `downloadAttachments()` fetches email attachments from Microsoft Graph — **including inline images even when `email.hasAttachments === false`** (Graph reports false for purely inline images, but the attachments API still returns them). Always check `email.hasAttachments || bodyContent.includes('cid:')`.
- `rewriteInlineImages()` rewrites `cid:xxx@yyy` refs in ticket content to `/api/tickets/{id}/attachments/{attId}`.
- `rewriteCommentInlineImages()` does the same for followup/comment content.
- To re-import attachments for an existing ticket: `POST /api/mail-collector/reprocess-ticket/:ticket_id` (admin).

### File storage (`backend/shared/storage.js`)

All uploaded files use a unified storage service. Config is stored in SQLite `app_settings` table:

| Key | Description |
|---|---|
| `storage.root_path` | UNC or local root — currently `\\10.103.131.136\editions$\DSIHUB` |
| `storage.backend` | `filesystem` (only supported value) |
| `storage.login` / `storage.password` | SMB credentials (if Linux server needs to write to UNC) |

Files are stored at `{root}/{module}/{id}/{timestamp-random-name}`. DB paths use prefix `storage/` (e.g. `storage/tickets/44155/xxx.png`) — the frontend route `/storage/*` serves them. `isStoragePath()` distinguishes new storage paths from legacy `uploads/` paths.

On Windows the OS handles UNC paths directly (no SMB credentials needed). On Linux, provide credentials to activate the SMB client (`smb_client.js`).

### Ticket soft-delete

Tickets are never hard-deleted. `status = 8` ("Rejeté") is used as soft-delete.

### Schema initialization

All PostgreSQL tables are created/migrated in `backend/shared/pg_db.js` inside `setupPgDb()`, called at server startup. Add new `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements there for safe non-destructive migrations.

---

## Key conventions

- **Never commit** `backend/seed_o365.js` or `backend/changelog.json` (contain sensitive data).
- All API routes require JWT (`authenticateJWT` middleware). Admin routes additionally require `authenticateAdmin` or `requireTicketPermission(...)`.
- Route ordering matters in Express: specific paths (e.g. `/bulk`, `/my-role`) must be declared **before** parameterized routes (e.g. `/:id`).
- The `PATCH /api/tasks/:source/:id` pattern uses `source` = `personal` for `hub.user_tasks`, other values for other task origins.
- **SQLite is not available in standalone Node scripts** — `getSqlite()` returns null unless the full server has initialized it via `setupDb()`. Use `await setupSqlite()` directly in scripts that need SQLite config (e.g. storage settings).
