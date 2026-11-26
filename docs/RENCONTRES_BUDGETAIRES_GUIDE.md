# Guide d'Utilisation : Brique "Rencontres Budgétaires"

## 📋 Résumé de l'Implémentation

Une nouvelle fonctionnalité "Rencontres Budgétaires" a été créée pour gérer les demandes budgétaires avec :
- **Import Excel** : Intégration automatique du fichier "Demandes Directions.xlsx"
- **Suivi par direction et année** : Filtrage et gestion des réunions
- **Gestion des participants et actions** : Ajout de suivi sur les décisions

---

## 🗄️ Fichiers Créés/Modifiés

### Backend
- **`backend/db.js`** : 3 nouvelles tables SQLite
  - `rencontres_budgetaires` : Données principales
  - `rencontres_participants` : Participants aux réunions
  - `rencontres_suivi` : Actions de suivi

- **`backend/server.js`** : 13 nouveaux endpoints
  - `GET /api/rencontres-budgetaires` - Liste avec filtres
  - `GET /api/rencontres-budgetaires/:id` - Détail complet
  - `POST /api/rencontres-budgetaires/import` - Import Excel
  - `POST /api/rencontres-budgetaires` - Créer manuel
  - `PUT /api/rencontres-budgetaires/:id` - Mettre à jour
  - `DELETE /api/rencontres-budgetaires/:id` - Supprimer
  - `GET /api/rencontres-budgetaires/stats/directions` - Stats par direction
  - `GET /api/rencontres-budgetaires/stats/annees` - Stats par année
  - `POST/DELETE /api/rencontres-budgetaires/:id/participants` - Gestion participants
  - `POST/PUT/DELETE /api/rencontres-suivi/:id` - Gestion actions

### Frontend
- **`frontend/src/pages/RencontresBudgetaires.tsx`** (NOUVEAU)
  - Page complète avec tableau, filtres, modales
  - Import Excel avec progression
  - Détail rencontre avec participants et suivi
  - 480 lignes de code React/TypeScript

- **`frontend/src/App.tsx`** (MODIFIÉ)
  - Ajout import: `import RencontresBudgetaires from './pages/RencontresBudgetaires'`
  - Ajout route: `<Route path="/rencontres-budgetaires" ... />`

- **`frontend/src/pages/Dashboard.tsx`** (MODIFIÉ)
  - Ajout tuile "Rencontres Budgétaires" (visible pour admins/finances)
  - Accessible directement depuis le tableau de bord

---

## 🚀 Guide de Démarrage

### 1. Redémarrer l'Application

Le serveur backend et frontend doivent être redémarrés pour charger les nouvelles tables et endpoints.

```bash
# Terminal 1 : Backend
cd backend
npm start

# Terminal 2 : Frontend
cd frontend
npm run dev
```

### 2. Accéder à la Brique

**URL** : `http://localhost:5173/rencontres-budgetaires` (ou votre domaine)

**Rôles autorisés** :
- Admin
- Finances

**Accessibilité** : Tuile visible sur le Dashboard pour les admins/finances

---

## 📊 Fonctionnalités

### Import Excel
1. Cliquer sur **"Importer Excel"**
2. Sélectionner le fichier `Demandes Directions.xlsx`
3. Confirmer l'import
4. **Résultat** : 218 demandes importées avec :
   - Direction, Date, Description
   - Montant TTC, Arbitrage, Responsable DSI
   - Statut automatique : "importée"

### Filtres et Recherche
- **Direction** : Toutes les directions depuis le fichier
- **Année** : Années extraites des dates
- **Statut** : importée, planifiée, effectuée
- **Recherche** : Texte libre sur titre/description

### Détail d'une Rencontre
1. Cliquer sur une ligne du tableau
2. Voir tous les détails :
   - Informations principales (direction, date, montant)
   - Arbitage et commentaires
   - Lien GLPI (ticket)

### Gestion des Participants
- Ajouter des participants avec nom, rôle, email
- Statut de présence : "en attente", "confirmé", etc.

### Suivi des Actions
- Ajouter des actions à suivre
- Date d'échéance
- Statut : "en cours", "complétée", etc.

---

## 📈 Données Import Excel

Le fichier `Demandes Directions.xlsx` contient :

| Colonne | Description | Type |
|---------|-------------|------|
| Direction | Code direction (DIRCOM, DAC, etc.) | Text |
| Date | Date de la réunion | Excel date |
| Quoi ? | Description de la demande | Text |
| Type | Type de demande | Text |
| Service | Code service DSI/autre | Text |
| Cout TTC | Montant en euros | Number |
| Arbitrage | Décision (OK DSI, En attente, etc.) | Text |
| Commentaire ? | Notes additionnelles | Text |
| TICKET | Référence GLPI | Text |
| LIEN | URL de référence | Text |
| DSI | Responsable DSI | Text |
| Fait | Colonne dynamique (si présente) | Variable |
| SUIVI | Colonne dynamique (si présente) | Variable |

**Résultat** : 218 lignes importées = 218 rencontres créées

---

## 🔐 Sécurité & Authentification

- ✅ Endpoints protégés : JWT required
- ✅ Import : Admin ou Finances seulement
- ✅ Suppression : Admin seulement
- ✅ Audit : Logs dans `backend/logs/mouchard.log`

---

## 🧪 Tests à Effectuer

### Test 1 : Import Excel
```
1. Se connecter avec un compte admin/finances
2. Aller à /rencontres-budgetaires
3. Cliquer "Importer Excel"
4. Sélectionner Demandes Directions.xlsx
5. Confirmer
✓ Vérifier : 218 rencontres importées
✓ Vérifier : Tableau remplit avec les données
✓ Vérifier : Log dans mouchard.log
```

### Test 2 : Filtres
```
1. Tableau chargé avec les rencontres
2. Sélectionner une Direction (ex: DIRCOM)
✓ Vérifier : Tableau filtré
3. Ajouter Année (2025)
✓ Vérifier : Double filtrage fonctionne
4. Rechercher "Wifi" dans la barre de recherche
✓ Vérifier : Résultats filtrés
```

### Test 3 : Détail Rencontre
```
1. Cliquer sur une ligne du tableau
2. Modale détail s'ouvre
✓ Vérifier : Tous les détails visibles
3. Ajouter un participant (nom, rôle)
✓ Vérifier : Participant ajouté
4. Ajouter une action (description, date)
✓ Vérifier : Action ajoutée à la liste
```

### Test 4 : Supprimer
```
1. Depuis le tableau, cliquer l'icône poubelle
2. Confirmer la suppression
✓ Vérifier : Rencontre supprimée du tableau
✓ Vérifier : DELETE dans logs
```

### Test 5 : Stats
```
1. Backend : GET /api/rencontres-budgetaires/stats/directions
✓ Vérifier : JSON avec count, montant_total par direction
2. Backend : GET /api/rencontres-budgetaires/stats/annees
✓ Vérifier : JSON avec count par année
```

---

## 🐛 Dépannage

### Les tables ne sont pas créées
**Solution** : Redémarrer le serveur backend. Les tables sont créées lors du démarrage.

### Erreur "Fichier non trouvé" lors de l'import
**Solution** : S'assurer que le fichier `Demandes Directions.xlsx` est bien dans le répertoire racine `C:\dev\AppDSI\`

### La page blanche ou erreur 404
**Solution** : 
- Vérifier que la route est bien ajoutée dans `App.tsx`
- Redémarrer le serveur frontend avec `npm run dev`

### Erreur authentification sur import
**Solution** : S'assurer d'être connecté avec un compte Admin ou Finances

---

## 📚 Architecture Techniques

### Conversion Dates Excel
Les dates du fichier Excel (format serial number) sont converties en ISO 8601 :
```javascript
const excelDateToISO = (excelDate) => {
  const excelEpoch = new Date(1900, 0, 1);
  const date = new Date(excelEpoch.getTime() + (excelDate - 1) * 86400 * 1000);
  return date.toISOString().split('T')[0];
}
```

### Endpoints Structure
Tous les endpoints suivent le pattern HTTP standard :
- `GET` : Lecture
- `POST` : Création / Import
- `PUT` : Mise à jour
- `DELETE` : Suppression

---

## 🎯 Prochaines Améliorations Possibles

1. **Export Excel** : Exporter le suivi en Excel
2. **Graphiques** : Visualiser les stats avec Recharts
3. **Email notifications** : Alerter sur les échéances
4. **Attachements** : Joindre des documents
5. **Historique** : Voir les modifications passées
6. **Templates** : Modèles de réunion pré-remplies

---

## 📞 Support

Pour toute question ou bug reporté, créer un ticket dans l'admin du DSI Hub.

**Fichiers importants** :
- `backend/db.js` - Schéma base de données
- `backend/server.js` - Endpoints API (lignes 9511-9750+)
- `frontend/src/pages/RencontresBudgetaires.tsx` - Interface utilisateur
- `frontend/src/App.tsx` - Routes
- `frontend/src/pages/Dashboard.tsx` - Navigation
