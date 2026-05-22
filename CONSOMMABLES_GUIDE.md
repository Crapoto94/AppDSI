# 🎯 Guide Complet - Module Gestion des Consommables

## 📊 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend (React)                                            │
│ ConsommablesManagement.tsx                                  │
│ - Formulaire multi-étapes                                   │
│ - Affichage des demandes                                    │
└────────────────────────┬────────────────────────────────────┘
                         │
              API REST (/api/consumable/)
                         │
┌────────────────────────▼────────────────────────────────────┐
│ Backend (Node.js)                                           │
│ consommables.controller.js & routes.js                      │
│ - Gestion des types & articles                              │
│ - CRUD des demandes                                         │
│ - Import depuis Excel                                       │
└────────────────────────┬────────────────────────────────────┘
                         │
             PostgreSQL (schema hub_consommables)
                         │
        ┌───────────────┬┴──────────┬──────────────┐
        │               │           │              │
   consumable_types  consumable_  consumable_   request_
                     catalog      requests      articles
```

## 🗂️ Tables PostgreSQL

### `consumable_types`
- `id` - Identifiant unique
- `name` - Nom du type (LASER MONO, LASER COULEUR, etc.)
- `display_name` - Nom d'affichage

### `consumable_catalog`
- `id` - Identifiant unique
- `type_id` - Référence au type
- `article` - Description de l'article
- `code_fabricant` - Code du fabricant
- `ref_commande` - Référence de commande

### `consumable_requests`
- `id` - Identifiant unique
- `user_id` - ID de l'utilisateur
- `username` - Nom d'utilisateur
- `date_commande` - Date de la demande
- `direction` - Direction
- `service` - Service
- `nom_referent` - Nom du référent
- `tel_complet` - Téléphone
- `type_id` - Type de consommable
- `status` - pending/approved/rejected

### `request_articles`
- `id` - Identifiant unique
- `request_id` - Référence à la demande
- `catalog_id` - Référence au catalogue
- `quantite` - Quantité demandée

## 🚀 Utilisation

### 1. Démarrer le serveur
```bash
npm start
# ou si vous utilisez nodemon
npm run dev
```

### 2. Importer les données Excel
Dès que le serveur est prêt, effectuez une requête POST vers :
```
POST /api/consumable/import
Authorization: Bearer <ADMIN_TOKEN>
```

Le système importera automatiquement tous les types et articles depuis BONDECOMMANDE.xlsx.

### 3. Utiliser l'application
- Allez sur la **tuile "Gestion des Consommables"**
- Cliquez sur **"Nouvelle demande"**
- Remplissez les 3 étapes :
  1. Informations générales
  2. Sélection du type
  3. Sélection des articles et quantités
- Soumettez

## 🔄 Workflow complet

```
Utilisateur
    │
    ├─→ Clique sur la tuile
    │
    ├─→ Formulaire étape 1 : Infos générales
    │
    ├─→ Formulaire étape 2 : Choisir un type
    │   (Types chargés depuis BD)
    │
    ├─→ Formulaire étape 3 : Choisir des articles
    │   (Articles chargés depuis BD basé sur type_id)
    │
    ├─→ Soumet la demande
    │   (Créée dans consumable_requests + request_articles)
    │
    └─→ Demande visible dans la liste
        (Status : "pending" par défaut)

Admin
    │
    ├─→ Accède à la liste des demandes
    │
    ├─→ Peut voir toutes les demandes
    │
    └─→ Peut changer le statut
        (pending → approved/rejected)
```

## 📝 Points importants

✅ **Les données Excel ne sont lues qu'une seule fois** (lors de l'import)
✅ **Toutes les données sont stockées en PostgreSQL**
✅ **Les requêtes API utilisent la BD, pas le fichier Excel**
✅ **On peut ré-importer pour mettre à jour le catalogue**
✅ **Les demandes restent persistantes indépendamment du catalogue**

## 🔧 Maintenance

### Mettre à jour le catalogue
Si le fichier BONDECOMMANDE.xlsx change, re-exécutez l'import :
```bash
curl -X POST http://localhost:3000/api/consumable/import \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

### Voir les types disponibles
```bash
curl http://localhost:3000/api/consumable/types \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Voir les articles d'un type
```bash
curl http://localhost:3000/api/consumable/articles/1 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## ✅ Checklist de déploiement

- [ ] Redémarrer le serveur backend
- [ ] Vérifier les logs : "Schema and tables initialized successfully"
- [ ] Exécuter l'import depuis Excel via `/api/consumable/import`
- [ ] Vérifier que les types s'affichent : `/api/consumable/types`
- [ ] Tester le formulaire avec un utilisateur normal
- [ ] Vérifier que la demande est créée en BD
- [ ] Tester l'accès admin et changement de statut
