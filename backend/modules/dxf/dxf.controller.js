const { pgDb, pool } = require('../../shared/database');
const DxfParser = require('dxf-parser');

// ── Helpers ──────────────────────────────────────────────────────────

const ACI_COLORS = [
  '#FF0000','#FFFF00','#00FF00','#00FFFF','#0000FF','#FF00FF','#FFFFFF','#808080',
  '#C0C0C0','#FF8080','#FF6600','#FFFF80','#80FF80','#80FFFF','#8080FF','#FF80FF',
];

function aciToHex(aci) {
  if (aci >= 1 && aci <= 15) return ACI_COLORS[aci - 1];
  if (aci >= 20 && aci <= 29) return `hsl(${((aci - 20) / 10) * 360}, 100%, 50%)`;
  if (aci === 256) return '#000000'; // BYLAYER
  return '#3388ff';
}

function parseDxfEntities(parsed) {
  const layers = {};
  const entities = parsed.entities || [];
  for (const ent of entities) {
    const calque = ent.layer || '0';
    const color = ent.color != null ? aciToHex(ent.color) : '#3388ff';
    const lw = ent.lineWeight != null ? ent.lineWeight : 0;
    const geo = entityToGeoJSON(ent);
    if (!geo) continue;
    if (!layers[calque]) layers[calque] = [];
    layers[calque].push({ type: ent.type, geojson: geo, couleur: color, epaisseur: lw });
  }
  return layers;
}

function entityToGeoJSON(ent) {
  switch (ent.type) {
    case 'LINE': {
      if (ent.vertices && ent.vertices.length >= 2) {
        return {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [[ent.vertices[0].x, ent.vertices[0].y], [ent.vertices[1].x, ent.vertices[1].y]],
          },
          properties: {},
        };
      }
      return null;
    }
    case 'LWPOLYLINE':
    case 'POLYLINE': {
      const pts = (ent.vertices || []).map(v => [v.x, v.y]);
      if (pts.length < 2) return null;
      const closed = ent.closed || false;
      return {
        type: 'Feature',
        geometry: { type: closed ? 'Polygon' : 'LineString', coordinates: closed ? [pts] : pts },
        properties: {},
      };
    }
    case 'CIRCLE': {
      if (ent.center == null) return null;
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [ent.center.x, ent.center.y],
        },
        properties: { radius: ent.radius, type: 'circle' },
      };
    }
    case 'POINT': {
      if (ent.position == null) return null;
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [ent.position.x, ent.position.y] },
        properties: {},
      };
    }
    default:
      return null;
  }
}

// ── Transformation affine (DXF → GPS) ────────────────────────────────
function computeTransform(calibrationPoints) {
  // calibrationPoints: [{ dxfX, dxfY, lat, lng }]
  // Solution par moindres carrés pour :
  //   lat = a * dxfX + b * dxfY + tx
  //   lng = c * dxfX + d * dxfY + ty
  const n = calibrationPoints.length;
  if (n < 2) return null;

  // Matrice X : chaque ligne [dxfX, dxfY, 1]
  // Vecteurs Y : lat, lng
  const X = calibrationPoints.map(p => [p.dxfX, p.dxfY, 1]);
  const Ylat = calibrationPoints.map(p => p.lat);
  const Ylng = calibrationPoints.map(p => p.lng);

  // Moindres carrés : (X^T X)^(-1) X^T Y
  // Pour 3 paramètres on peut le faire simplement
  const Xt = X[0].map((_, i) => X.map(row => row[i])); // transpose
  const XtX = Xt.map(row => X[0].map((_, j) => row.reduce((s, v, k) => s + v * X[k][j], 0)));
  const XtYlat = Xt.map(row => row.reduce((s, v, k) => s + v * Ylat[k], 0));
  const XtYlng = Xt.map(row => row.reduce((s, v, k) => s + v * Ylng[k], 0));

  // Résolution 3x3 par Cramer
  const det = (m) => {
    if (n === 2) {
      // Pour 2 points : on résout manuellement (pas assez de degrés de liberté pour les moindres carrés)
      return null;
    }
    return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
         - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
         + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  };

  const d = det(XtX);
  if (!d) {
    // 2 points : solution exacte (affine simple)
    const p0 = calibrationPoints[0], p1 = calibrationPoints[1];
    const dx = p1.dxfX - p0.dxfX, dy = p1.dxfY - p0.dxfY;
    const dlat = p1.lat - p0.lat, dlng = p1.lng - p0.lng;
    const scale = Math.sqrt((dlat * dlat + dlng * dlng) / (dx * dx + dy * dy)) || 1;
    const angle = Math.atan2(dlng, dlat) - Math.atan2(dy, dx);
    const cosa = Math.cos(angle) * scale;
    const sina = Math.sin(angle) * scale;
    return {
      a: cosa, b: -sina, tx: p0.lat - (cosa * p0.dxfX - sina * p0.dxfY),
      c: sina, d: cosa, ty: p0.lng - (sina * p0.dxfX + cosa * p0.dxfY),
    };
  }

  const invert3 = (m) => {
    const inv = [
      [(m[1][1]*m[2][2] - m[1][2]*m[2][1]) / d, (m[0][2]*m[2][1] - m[0][1]*m[2][2]) / d, (m[0][1]*m[1][2] - m[0][2]*m[1][1]) / d],
      [(m[1][2]*m[2][0] - m[1][0]*m[2][2]) / d, (m[0][0]*m[2][2] - m[0][2]*m[2][0]) / d, (m[0][2]*m[1][0] - m[0][0]*m[1][2]) / d],
      [(m[1][0]*m[2][1] - m[1][1]*m[2][0]) / d, (m[0][1]*m[2][0] - m[0][0]*m[2][1]) / d, (m[0][0]*m[1][1] - m[0][1]*m[1][0]) / d],
    ];
    return inv;
  };

  const inv = invert3(XtX);
  const coeffLat = inv.map(row => row.reduce((s, v, i) => s + v * XtYlat[i], 0));
  const coeffLng = inv.map(row => row.reduce((s, v, i) => s + v * XtYlng[i], 0));

  return { a: coeffLat[0], b: coeffLat[1], tx: coeffLat[2], c: coeffLng[0], d: coeffLng[1], ty: coeffLng[2] };
}

function applyTransform(t, dxfX, dxfY) {
  if (!t) return [dxfX, dxfY];
  return [t.a * dxfX + t.b * dxfY + t.tx, t.c * dxfX + t.d * dxfY + t.ty];
}

function transformGeoJSON(geojson, t) {
  if (!t) return geojson;
  const transformCoords = (coords) => {
    if (typeof coords[0] === 'number') return applyTransform(t, coords[0], coords[1]);
    return coords.map(c => transformCoords(c));
  };
  return {
    ...geojson,
    geometry: { ...geojson.geometry, coordinates: transformCoords(geojson.geometry.coordinates) },
  };
}

// ── Contrôleur ────────────────────────────────────────────────────────

module.exports = {
  // POST /api/maps/dxf/parse — upload et parsing
  parse: async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'Aucun fichier' });
      const content = req.file.buffer.toString('utf-8');
      const parser = new DxfParser();
      const parsed = parser.parseSync(content);
      if (!parsed) return res.status(400).json({ message: 'Impossible de parser le DXF' });

      const layers = parseDxfEntities(parsed);
      const layerNames = Object.keys(layers).sort();
      const summary = layerNames.map(name => ({
        nom: name,
        nb_entites: layers[name].length,
        types: [...new Set(layers[name].map(e => e.type))],
      }));

      // Stocker le contenu parsé temporairement en session
      // (ou le renvoyer au client pour la calibration)
      res.json({ calques: summary, raw: layers });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  // POST /api/maps/dxf/georef — géoréférencement et stockage
  georef: async (req, res) => {
    try {
      const { nom_fichier, rawLayers, pointsCalage } = req.body;
      if (!rawLayers || !pointsCalage || pointsCalage.length < 2) {
        return res.status(400).json({ message: 'Données incomplètes' });
      }

      const t = computeTransform(pointsCalage);
      if (!t) return res.status(400).json({ message: 'Impossible de calculer la transformation' });

      // Calcul des bounds
      let allCoords = [];
      for (const calque of Object.keys(rawLayers)) {
        for (const ent of rawLayers[calque]) {
          const transformed = transformGeoJSON(ent.geojson, t);
          const flat = flattenCoords(transformed.geometry.coordinates);
          allCoords.push(...flat);
        }
      }
      const lats = allCoords.map(c => c[0]);
      const lngs = allCoords.map(c => c[1]);
      const bounds = { minLat: Math.min(...lats), minLng: Math.min(...lngs), maxLat: Math.max(...lats), maxLng: Math.max(...lngs) };

      // Insérer le document
      const { rows: [doc] } = await pool.query(
        `INSERT INTO hub_reseau.dxf_documents (nom_fichier, calques, points_calage, bounds) VALUES ($1,$2,$3,$4::jsonb) RETURNING id`,
        [nom_fichier, JSON.stringify(Object.keys(rawLayers)), JSON.stringify(pointsCalage), JSON.stringify(bounds)]
      );

      // Insérer les entités
      const calquesMeta = [];
      for (const [calque, entites] of Object.entries(rawLayers)) {
        let nb = 0;
        for (const ent of entites) {
          const geo = transformGeoJSON(ent.geojson, t);
          await pool.query(
            `INSERT INTO hub_reseau.dxf_entites (document_id, calque, type_entite, geojson, couleur, epaisseur) VALUES ($1,$2,$3,$4::jsonb,$5,$6)`,
            [doc.id, calque, ent.type, JSON.stringify(geo), ent.couleur, ent.epaisseur]
          );
          nb++;
        }
        calquesMeta.push({ nom: calque, nb_entites: nb, types: [...new Set(entites.map(e => e.type))] });
      }

      res.json({ id: doc.id, nom_fichier, calques: calquesMeta, bounds });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  // GET /api/maps/dxf/layers — tous les documents avec leurs calques
  getLayers: async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT d.id, d.nom_fichier, d.calques, d.bounds, d.cree_le,
                COALESCE(json_agg(json_build_object(
                  'id', e.id, 'calque', e.calque, 'type', e.type_entite,
                  'geojson', e.geojson, 'couleur', e.couleur, 'epaisseur', e.epaisseur
                ) ORDER BY e.id) FILTER (WHERE e.id IS NOT NULL), '[]') AS entites
         FROM hub_reseau.dxf_documents d
         LEFT JOIN hub_reseau.dxf_entites e ON e.document_id = d.id
         GROUP BY d.id ORDER BY d.cree_le DESC`
      );
      res.json(rows);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  // DELETE /api/maps/dxf/:id
  remove: async (req, res) => {
    try {
      await pool.query('DELETE FROM hub_reseau.dxf_documents WHERE id = $1', [req.params.id]);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },
};

function flattenCoords(coords) {
  const result = [];
  function walk(c) {
    if (typeof c[0] === 'number') result.push(c);
    else c.forEach(walk);
  }
  walk(coords);
  return result;
}
