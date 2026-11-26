# 📋 Configuration du Module Consommables

## Étape 1 : Importer les données Excel

### Option A : Via l'API (Recommandé)

Une fois le serveur démarré, exécutez :

```bash
curl -X POST http://localhost:3000/api/consumable/import \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

### Option B : Via la ligne de commande

```bash
node -e "
const axios = require('axios');
axios.post('http://localhost:3000/api/consumable/import', {}, {
  headers: { 'Authorization': 'Bearer YOUR_ADMIN_TOKEN' }
}).then(r => console.log(r.data))
  .catch(e => console.error(e.response?.data || e.message));
"
```

## Étape 2 : Vérifier l'import

Vérifiez que les données ont été importées :

```bash
# Types importés
curl http://localhost:3000/api/consumable/types \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Articles d'un type (remplacer TYPE_ID par l'ID d'un type)
curl http://localhost:3000/api/consumable/articles/1 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

## Étape 3 : Automatiser l'import

Vous pouvez ajouter ceci au serveur pour importer automatiquement au démarrage :

```javascript
// Dans server.js, après setupPgDb():
const performConsumablesImport = async () => {
  try {
    const axios = require('axios');
    const mockReq = { user: { role: 'admin' } };
    const mockRes = {
      json: (data) => console.log('[Consommables] Import:', data),
      status: (code) => ({
        json: (data) => console.error('[Consommables] Error:', data)
      })
    };
    
    const controller = require('./modules/consommables/consommables.controller');
    await controller.importFromExcel(mockReq, mockRes);
  } catch (error) {
    console.error('[Consommables] Auto-import error:', error);
  }
};

// Après setupPgDb, exécuter :
// performConsumablesImport();
```

## Données attendues

Le fichier BONDECOMMANDE.xlsx doit contenir :

**Onglets (types de consommables) :**
- LASER MONO
- LASER COULEUR
- JET D'ENCRE COULEUR
- FAX
- DIVERS

**Colonnes par onglet :**
- Colonne B : Article (description du produit)
- Colonne C : Code fabricant
- Colonne D : Référence de commande
- Colonne E : Nombre (utilisé uniquement dans les demandes)

## Statut de l'API

- ✅ `/api/consumable/types` - GET types depuis BD
- ✅ `/api/consumable/articles/:typeId` - GET articles depuis BD
- ✅ `/api/consumable/requests` - GET mes demandes
- ✅ `/api/consumable/requests` - POST créer demande
- ✅ `/api/consumable/import` - POST importer depuis Excel (admin)
- ✅ `/api/consumable/admin/all` - GET toutes demandes (admin)
- ✅ `/api/consumable/admin/:requestId/status` - PUT statut (admin)
