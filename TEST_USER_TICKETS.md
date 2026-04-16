# Test Guide: GLPI User Tickets with Observer Tracking

## Implementation Summary

### 1. Database Changes
✅ **Table: `glpi_observers`** (already created in db.js)
- Stores ticket-level observer relationships
- Columns: ticket_id, user_id, name, login, email, is_active, last_sync
- UNIQUE constraint on (ticket_id, user_id) to prevent duplicates

### 2. Backend Changes

#### A. GLPI Sync Endpoint (`POST /api/glpi/sync-all-tickets`)
✅ **Modified to extract per-ticket observers**
- For each ticket, fetches full ticket details via API
- Extracts `_observers` array from ticket detail response
- For each observer, inserts into `glpi_observers` table with:
  - ticket_id: the ticket's GLPI ID
  - user_id: the observer's user_id
  - name, login, email: observer details
  - is_active: always 1
  - last_sync: current timestamp
- Uses INSERT OR REPLACE to handle duplicates gracefully
- Wrapped in try-catch to prevent breaking ticket sync if observer fetch fails

#### B. New Endpoint: GET `/api/glpi/user-tickets/:username`
✅ **Created to retrieve all tickets for a user**
- **Authentication**: Requires JWT token (authenticateJWT)
- **Parameters**: username (URL parameter)
- **Returns**:
  ```json
  {
    "username": "jean.martin",
    "userEmail": "jean.martin@ivry94.fr",
    "total": 15,
    "created_count": 8,
    "observed_count": 7,
    "tickets": [
      {
        "id": 1,
        "glpi_id": 123,
        "title": "Ticket Title",
        "status": "new",
        "priority": 3,
        "urgency": 3,
        "date_creation": "2026-04-15",
        "date_mod": "2026-04-15",
        "requester_name": "Jean Martin",
        "requester_email": "jean.martin@ivry94.fr",
        "ticket_type": "created"  // or "observed" or "created_and_observed"
      }
    ]
  }
  ```

## Testing Procedure

### Step 1: Verify Database Schema
```bash
# Check that glpi_observers table exists
sqlite3 backend/database.sqlite ".schema glpi_observers"

# Expected output:
# CREATE TABLE IF NOT EXISTS glpi_observers (
#     id INTEGER PRIMARY KEY AUTOINCREMENT,
#     ticket_id INTEGER NOT NULL,
#     user_id INTEGER NOT NULL,
#     name TEXT,
#     login TEXT,
#     email TEXT,
#     is_active INTEGER DEFAULT 1,
#     last_sync DATETIME DEFAULT CURRENT_TIMESTAMP,
#     UNIQUE(ticket_id, user_id)
# );
```

### Step 2: Verify Server is Running
```bash
curl http://localhost:3001/api/glpi/sync-all-tickets -X POST -H "Authorization: Bearer YOUR_TOKEN"
# Should return: {"success": true, "count": X, "total": Y}
```

### Step 3: Trigger GLPI Synchronization
- Ensure GLPI is configured in the admin panel
- Run sync: POST http://localhost:3001/api/glpi/sync-all-tickets
- Monitor logs for:
  - `[GLPI Sync] Début synchronisation totale. Total estimé: X`
  - `[GLPI Sync] Récupération ticket details...` (observer extraction)
  - `[GLPI Sync] INSERT observers: ticket_id=X user_id=Y`
  - `[GLPI Sync] Synchronisation terminée : X tickets.`

### Step 4: Verify Observer Data is Populated
```bash
# Check glpi_observers table has data
sqlite3 backend/database.sqlite "SELECT COUNT(*) FROM glpi_observers;"
# Should return > 0

# Check specific observer
sqlite3 backend/database.sqlite "SELECT ticket_id, user_id, name, login, email FROM glpi_observers LIMIT 5;"
```

### Step 5: Test the New Endpoint

#### Get JWT Token
```bash
# Login to get token
curl -X POST http://localhost:3001/api/login \
  -H "Content-Type: application/json" \
  -d '{"username": "your_username", "password": "your_password"}'

# Extract token from response: accessToken
export TOKEN="your_token_here"
```

#### Test Endpoint
```bash
# Get user tickets
curl -X GET http://localhost:3001/api/glpi/user-tickets/your_username \
  -H "Authorization: Bearer $TOKEN"

# Expected response:
# {
#   "username": "your_username",
#   "userEmail": "your_username@ivry94.fr",
#   "total": 15,
#   "created_count": 8,
#   "observed_count": 7,
#   "tickets": [...]
# }
```

## What's Working

✅ Observer extraction at ticket level (from GLPI API)
✅ Observer storage in glpi_observers table
✅ User tickets endpoint that combines:
  - Tickets where user is requester
  - Tickets where user is an observer
✅ Deduplication of tickets that appear in both categories

## What Still Needs Testing

- [ ] GLPI sync populates glpi_observers table correctly
- [ ] Observer login/email matching works correctly
- [ ] User tickets endpoint returns correct results
- [ ] Frontend integration to display observed tickets

## Files Modified

1. **backend/db.js** - Already contains glpi_observers table definition
2. **backend/server.js** - Two changes:
   - Added observer extraction in POST /api/glpi/sync-all-tickets (lines ~3427-3447)
   - Added new GET /api/glpi/user-tickets/:username endpoint (lines ~3196-3253)
