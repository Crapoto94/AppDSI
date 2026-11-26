/**
 * Chargement PARESSEUX des bibliothèques lourdes (pdf-lib, exceljs, @napi-rs/canvas, mammoth…).
 *
 * `require` d'un gros module coûte de 0,3 à 1,4 s au démarrage du serveur, même si personne ne s'en sert avant longtemps.
 * `lazy('pdf-lib')` renvoie un objet qui se comporte comme le module mais ne le charge qu'au premier accès à l'un de ses membres :
 *
 *     const { PDFDocument, StandardFonts, rgb } = lazy('pdf-lib');   // ne charge rien
 *     const doc = await PDFDocument.create();                         // charge pdf-lib ici (une seule fois)
 *
 * Chaque membre (classe, fonction, constante) est lui-même un proxy qui transmet appels, `new` et accès de propriétés.
 */
// Cible « function » (et non flèche) : seule une fonction ordinaire peut servir de constructeur au proxy
function target() { /* cible neutre : permet apply / construct */ }

function member(modName, key) {
    const real = () => require(modName)[key];
    return new Proxy(target, {
        get: (_, prop) => { const r = real(); const v = r[prop]; return typeof v === 'function' ? v.bind(r) : v; },
        apply: (_, thisArg, args) => real().apply(thisArg, args),
        construct: (_, args) => new (real())(...args),
        has: (_, prop) => prop in Object(real()),
    });
}

function lazy(modName) {
    return new Proxy({}, {
        get: (_, key) => (typeof key === 'symbol' ? require(modName)[key] : member(modName, key)),
    });
}

module.exports = { lazy };
