# 🚀 Démarrage du serveur backend

## Option 1 : Démarrage normal
```bash
cd C:\dev\AppDSI\backend
npm start
```

## Option 2 : Avec nodemon (développement)
```bash
cd C:\dev\AppDSI\backend
npm run dev
```

## Vérifier que le serveur est prêt

### Test simple
```bash
curl http://localhost:3000/api/consumable/test
# Devrait retourner: {"message":"Consommables API is working"}
```

### Vérifier les logs
Vous devriez voir dans la console :
```
[PG DB] Schema and tables initialized successfully
[Consommables] ...
Server is running on port 3000
```

## Importer les données Excel

Une fois le serveur démarré et vous connecté (authentifié):

### Via le formulaire web:
1. Allez sur http://localhost:3000 (l'app web)
2. Connectez-vous avec vos identifiants
3. Ouvrez la console navigateur (F12)
4. Allez sur l'onglet Application > Local Storage
5. Copiez la valeur de la clé `token`

### Via curl (remplacez YOUR_TOKEN):
```bash
curl -X POST http://localhost:3000/api/consumable/import \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

Vous devriez voir:
```json
{
  "message": "Import réussi",
  "types_imported": 5,
  "articles_imported": 156
}
```

## Vérifier l'import

```bash
curl http://localhost:3000/api/consumable/types \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Devrait retourner les types de consommables.
