# 🔍 Guide de Débogage - Module Consommables

## Vérifications à effectuer

### 1. **Vérifier que le serveur est en cours d'exécution**
```bash
curl http://localhost:3000/api/consumable/test
# Doit retourner: {"message":"Consommables API is working"}
```

### 2. **Vérifier les logs du serveur**
Regardez la console du serveur pour ces messages:
```
[Consommables] Reading file from: C:\dev\AppDSI\BONDECOMMANDE.xlsx
[Consommables] All sheet names: [...]
[Consommables] Filtered types: [...]
```

### 3. **Ouvrir la console du navigateur** (F12)
- Onglet **Console**: Vérifiez les erreurs JavaScript
- Onglet **Network**: Vérifiez que `/api/consumable/types` retourne un statut 200 ou une erreur spécifique
  - 401: Authentification requise
  - 403: Permission refusée
  - 404: Route non trouvée
  - 500: Erreur serveur

### 4. **Token d'authentification**
Assurez-vous que:
- Vous êtes connecté au système
- Le token JWT est valide (stocké dans localStorage)
- Vous avez les permissions nécessaires

## Erreurs courantes

### "Erreur lors du chargement des types (404)"
**Cause**: L'API n'est pas enregistrée correctement
**Solution**: 
- Redémarrez le serveur
- Vérifiez que `server.js` contient:
  ```javascript
  const consommablesRouter = require('./modules/consommables/consommables.routes');
  app.use('/api/consumable', consommablesRouter);
  ```

### "Erreur lors du chargement des types (401)"
**Cause**: Token d'authentification manquant ou invalide
**Solution**:
- Reconnectez-vous
- Videz le cache et les cookies

### "Erreur lors du chargement des types (500)"
**Cause**: Erreur serveur (fichier Excel non trouvé, etc.)
**Solution**:
- Consultez les logs du serveur
- Vérifiez que `BONDECOMMANDE.xlsx` existe à `C:\dev\AppDSI\`
- Vérifiez que le fichier n'est pas corrompu

## Commandes de test rapide

```bash
# Tester le module Excel
node C:\dev\AppDSI\backend\test-consommables.js

# Voir les logs détaillés
npm start  # Lancez le serveur et observez la console
```

## Format attendu de la réponse

La route `/api/consumable/types` doit retourner:
```json
[
  "LASER MONO",
  "LASER COULEUR",
  "JET D'ENCRE COULEUR",
  "FAX",
  "DIVERS"
]
```
