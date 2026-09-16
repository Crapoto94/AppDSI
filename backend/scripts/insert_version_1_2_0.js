const { pool } = require('../shared/database');

const VERSION = '1.2.0';

const changes = [
  "<p><strong>Version 1.2.0</strong> — arrivée du module <strong>Parapheur électronique</strong> : signature de documents PDF par circuit (séquentiel ou parallèle), 100 % interne au Hub DSI, avec modes de signature simple, vérifiée par SMS et sécurisée par certificat P12.</p>",

  "### Parapheur électronique (nouveau module)",
  "• Création d'un parapheur : dépôt de PDF à signer + annexes (consultables par le signataire, non signées), aperçu miniature et comptage des pages dès l'upload",
  "• Signataires choisis dans l'annuaire RH Studio ; par signataire, mode de signature : simple (compte Active Directory), vérifiée par SMS (code à 6 chiffres au portable, validité 10 min) ou sécurisée (certificat X.509 personnel, signature cryptographique PAdES)",
  "• Circuit séquentiel ou parallèle ; position de signature par défaut sur la dernière page, ajustable dans un éditeur de positionnement",
  "• Titre / fonction du signataire pré-rempli depuis le référentiel RH (champ POSTE_L), modifiable et activable ; affiché sous la signature dans le PDF",
  "• Lecture obligatoire : le signataire doit faire défiler chaque document jusqu'à sa dernière page avant de pouvoir signer",
  "• Zone de dessin tactile (souris, Android/iOS, macOS) ; signature mémorisable pour les prochaines signatures",
  "• Mention manuscrite libre (« Avis favorable ») : saisie, taille réglable (Petite / Moyenne / Grande) et positionnement au doigt sur le document",
  "• Délégation de date à date : un agent désigné signe à la place du signataire (sauf P12), avec la mention « signé X par délégation de Y »",
  "• Apposition de la signature, du nom, de la fonction et de la mention dans le PDF, avec code QR de vérification sur toutes les pages",
  "• Sceau PAdES de fin de circuit (autorité de certification interne) garantissant l'intégrité des documents",
  "• Page publique de vérification (sans authentification) atteinte par le QR, et dossier de preuves téléchargeable (ZIP : rapport PDF, empreintes SHA-256, certificats, journal d'audit, documents signés)",
  "• Vérification du sceau par DSIHUB (intégrité du fichier + chaîne de l'AC interne) ; certificats techniques par signature pour les modes simple/SMS",
  "• Administration /admin/parapheur-certificats : certificats P12, journal des signatures (dont le numéro SMS utilisé), contrôle de sécurité (empreintes, PAdES), URL publique du QR, activation du sceau et gestion de l'AC interne",
  "• Relances automatiques des signataires, gestion des délégations, recherche et filtres (état, signataire, date, texte libre)",

  "### Visionneuse PDF unifiée",
  "• Zoom fiable (y compris sur Safari macOS), bandeau de signature type Acrobat (signataires, dates, délégation, certificat, mention)",
  "• Rendu pdf.js sur mobile et Safari (les iframes PDF ne s'affichent pas sur Android/iOS) ; prise en charge des PDF scannés / raster (décodeurs wasm JBIG2 / JPEG2000)",

  "### Déploiement DMZ",
  "• Nouveau dossier parapheur-dmz/ : conteneur autonome servant la page publique de vérification, avec proxy nginx restreint au seul point d'entrée /api/parapheur/verify/ (le reste de l'API interne n'est jamais exposé)",
];

(async () => {
  try {
    const releaseDate = new Date().toLocaleDateString('fr-FR');
    const existing = await pool.query('SELECT id FROM hub.changelog_versions WHERE version = $1 ORDER BY id DESC LIMIT 1', [VERSION]);
    let res;
    if (existing.rows.length > 0) {
      res = await pool.query(
        'UPDATE hub.changelog_versions SET release_date = $1, changes = $2 WHERE id = $3 RETURNING id, version, release_date',
        [releaseDate, JSON.stringify(changes), existing.rows[0].id]
      );
      console.log('Version mise à jour:', res.rows[0]);
    } else {
      res = await pool.query(
        'INSERT INTO hub.changelog_versions (version, release_date, changes) VALUES ($1, $2, $3) RETURNING id, version, release_date',
        [VERSION, releaseDate, JSON.stringify(changes)]
      );
      console.log('Version créée:', res.rows[0]);
    }
  } catch (e) {
    console.error('ERR', e.message);
  }
  process.exit(0);
})();
