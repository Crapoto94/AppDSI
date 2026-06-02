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

// Nettoie les codes de formatage MTEXT pour ne garder que le texte lisible.
function cleanMtext(raw) {
  return String(raw)
    .replace(/\\P/g, ' ')                 // sauts de paragraphe
    .replace(/\\[A-Za-z][^;]*;/g, '')     // codes \f...;  \H...;  \C...;  etc.
    .replace(/[{}]/g, '')                 // accolades de groupe
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Transformations affines 2D (pour l'expansion des blocs INSERT) ────
const TF_ID = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
function tfCompose(o, i) {
  // o ∘ i : applique i puis o
  return {
    a: o.a * i.a + o.b * i.c,
    b: o.a * i.b + o.b * i.d,
    c: o.c * i.a + o.d * i.c,
    d: o.c * i.b + o.d * i.d,
    e: o.a * i.e + o.b * i.f + o.e,
    f: o.c * i.e + o.d * i.f + o.f,
  };
}
function tfPoint(t, x, y) { return [t.a * x + t.b * y + t.e, t.c * x + t.d * y + t.f]; }
function tfApplyGeo(geo, t) {
  const conv = (c) => (typeof c[0] === 'number' ? tfPoint(t, c[0], c[1]) : c.map(conv));
  return { ...geo, geometry: { ...geo.geometry, coordinates: conv(geo.geometry.coordinates) } };
}
function insertTransform(ins, block) {
  const px = ins.position?.x || 0, py = ins.position?.y || 0;
  const sx = ins.xScale ?? 1, sy = ins.yScale ?? 1;
  const rot = ((ins.rotation || 0) * Math.PI) / 180;
  const bx = block?.position?.x || 0, by = block?.position?.y || 0;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  // T(P) · R(rot) · S(sx,sy) · T(-base)
  const RS = { a: cos * sx, b: -sin * sy, c: sin * sx, d: cos * sy, e: 0, f: 0 };
  const Tb = { a: 1, b: 0, c: 0, d: 1, e: -bx, f: -by };
  const m = tfCompose(RS, Tb);
  return { ...m, e: m.e + px, f: m.f + py };
}

function parseDxfEntities(parsed) {
  const layers = {};
  const blocks = parsed.blocks || {};
  const push = (calque, type, geo, color, lw) => {
    if (!layers[calque]) layers[calque] = [];
    layers[calque].push({ type, geojson: geo, couleur: color, epaisseur: lw });
  };

  const emit = (entities, tf, inheritLayer, inheritColor, depth) => {
    if (!entities || depth > 12) return;
    for (const ent of entities) {
      const calque = (ent.layer && ent.layer !== '0') ? ent.layer : (inheritLayer || ent.layer || '0');
      // 0 = BYBLOCK, 256 = BYLAYER
      let color;
      if (ent.color == null || ent.color === 256) color = inheritColor || '#3388ff';
      else if (ent.color === 0) color = inheritColor || '#3388ff';
      else color = aciToHex(ent.color);
      const lw = ent.lineWeight != null ? ent.lineWeight : 0;

      if (ent.type === 'INSERT') {
        const block = blocks[ent.name];
        if (!block) continue;
        emit(block.entities, tfCompose(tf, insertTransform(ent, block)), calque, color, depth + 1);
        continue;
      }
      const geo = entityToGeoJSON(ent);
      if (!geo) continue;
      const placed = tfApplyGeo(geo, tf);
      // Reporter la rotation accumulée du bloc sur les libellés texte
      if (placed.properties?.type === 'text') {
        const extraRot = (Math.atan2(tf.c, tf.a) * 180) / Math.PI;
        placed.properties = { ...placed.properties, rotation: (placed.properties.rotation || 0) + extraRot };
      }
      push(calque, ent.type, placed, color, lw);
    }
  };

  emit(parsed.entities || [], TF_ID, null, null, 0);
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
      // dxf-parser expose le flag « fermé » via `shape` (bit 1 du code 70).
      const closed = ent.shape === true || ent.closed === true;
      // Polyligne fermée : on revient du dernier point au premier (tracé bouclé, sans remplissage).
      const coords = closed && (pts[0][0] !== pts[pts.length - 1][0] || pts[0][1] !== pts[pts.length - 1][1])
        ? [...pts, pts[0]] : pts;
      return {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: { closed },
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
    case 'ARC': {
      if (ent.center == null || ent.radius == null) return null;
      let a0 = ent.startAngle ?? 0, a1 = ent.endAngle ?? Math.PI * 2;
      if (a1 <= a0) a1 += Math.PI * 2;
      const seg = 48, pts = [];
      for (let i = 0; i <= seg; i++) {
        const t = a0 + ((a1 - a0) * i) / seg;
        pts.push([ent.center.x + ent.radius * Math.cos(t), ent.center.y + ent.radius * Math.sin(t)]);
      }
      return { type: 'Feature', geometry: { type: 'LineString', coordinates: pts }, properties: {} };
    }
    case 'ELLIPSE': {
      if (ent.center == null || ent.majorAxisEndPoint == null) return null;
      const mx = ent.majorAxisEndPoint.x, my = ent.majorAxisEndPoint.y;
      const major = Math.hypot(mx, my);
      if (!major) return null;
      const ux = mx / major, uy = my / major;        // direction grand axe
      const minor = major * (ent.axisRatio ?? 1);
      let a0 = ent.startAngle ?? 0, a1 = ent.endAngle ?? Math.PI * 2;
      if (a1 <= a0) a1 += Math.PI * 2;
      const seg = 64, pts = [];
      for (let i = 0; i <= seg; i++) {
        const t = a0 + ((a1 - a0) * i) / seg;
        const ca = Math.cos(t) * major, sa = Math.sin(t) * minor;
        pts.push([ent.center.x + ca * ux - sa * uy, ent.center.y + ca * uy + sa * ux]);
      }
      return { type: 'Feature', geometry: { type: 'LineString', coordinates: pts }, properties: {} };
    }
    case 'SPLINE': {
      const src = (ent.fitPoints && ent.fitPoints.length >= 2) ? ent.fitPoints
                : (ent.controlPoints && ent.controlPoints.length >= 2) ? ent.controlPoints : null;
      if (!src) return null;
      return { type: 'Feature', geometry: { type: 'LineString', coordinates: src.map(p => [p.x, p.y]) }, properties: {} };
    }
    case 'TEXT':
    case 'MTEXT': {
      const pos = ent.startPoint || ent.position;
      if (pos == null || !ent.text) return null;
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [pos.x, pos.y] },
        properties: { type: 'text', text: cleanMtext(ent.text), height: ent.textHeight || ent.height || 0, rotation: ent.rotation || 0 },
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
    if (typeof coords[0] === 'number') {
      // applyTransform renvoie [lat, lng] ; GeoJSON attend [lng, lat]
      const [lat, lng] = applyTransform(t, coords[0], coords[1]);
      return [lng, lat];
    }
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
      const { nom_fichier, rawLayers, transform, ajustement } = req.body;
      const pointsCalage = req.body.pointsCalage || [];
      const hasTransform = transform && typeof transform.a === 'number';
      if (!rawLayers || (!hasTransform && pointsCalage.length < 2)) {
        return res.status(400).json({ message: 'Données incomplètes' });
      }

      // Géoréférencement manuel : le frontend fournit directement la transformation
      // (placement / rotation / échelle). Sinon, repli sur le calage par 2 points.
      const t = hasTransform ? transform : computeTransform(pointsCalage);
      if (!t) return res.status(400).json({ message: 'Impossible de calculer la transformation' });

      // Calcul des bounds (coordonnées transformées en [lng, lat])
      let allCoords = [];
      for (const calque of Object.keys(rawLayers)) {
        for (const ent of rawLayers[calque]) {
          const transformed = transformGeoJSON(ent.geojson, t);
          const flat = flattenCoords(transformed.geometry.coordinates);
          allCoords.push(...flat);
        }
      }
      const lngs = allCoords.map(c => c[0]);
      const lats = allCoords.map(c => c[1]);
      const bounds = { minLat: Math.min(...lats), minLng: Math.min(...lngs), maxLat: Math.max(...lats), maxLng: Math.max(...lngs) };

      const client = await pool.connect();
      let doc, calquesMeta = [];
      try {
        await client.query('BEGIN');
        // Insérer le document
        const ins = await client.query(
          `INSERT INTO hub_reseau.dxf_documents (nom_fichier, calques, points_calage, bounds, transform, ajustement)
           VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb) RETURNING id`,
          [nom_fichier, JSON.stringify(Object.keys(rawLayers)), JSON.stringify(pointsCalage),
           JSON.stringify(bounds), JSON.stringify(t), ajustement ? JSON.stringify(ajustement) : null]
        );
        doc = ins.rows[0];

        // Insérer les entités par lots
        for (const [calque, entites] of Object.entries(rawLayers)) {
          const transformed = entites.map(ent => ({ ent, geo: transformGeoJSON(ent.geojson, t) }));
          for (let i = 0; i < transformed.length; i += 200) {
            const chunk = transformed.slice(i, i + 200);
            const vals = [], ph = [];
            chunk.forEach((row, k) => {
              const o = k * 6;
              ph.push(`($${o + 1},$${o + 2},$${o + 3},$${o + 4}::jsonb,$${o + 5},$${o + 6})`);
              vals.push(doc.id, calque, row.ent.type, JSON.stringify(row.geo), row.ent.couleur, row.ent.epaisseur);
            });
            await client.query(
              `INSERT INTO hub_reseau.dxf_entites (document_id, calque, type_entite, geojson, couleur, epaisseur) VALUES ${ph.join(',')}`,
              vals
            );
          }
          calquesMeta.push({ nom: calque, nb_entites: entites.length, types: [...new Set(entites.map(e => e.type))] });
        }

        // Conserver le géoréférencement indépendamment du document
        await client.query(
          `INSERT INTO hub_reseau.dxf_calibrations (nom_fichier, points_calage, ajustement, transform, maj_le)
           VALUES ($1,$2::jsonb,$3::jsonb,$4::jsonb, NOW())
           ON CONFLICT (nom_fichier) DO UPDATE SET
             points_calage = EXCLUDED.points_calage, ajustement = EXCLUDED.ajustement,
             transform = EXCLUDED.transform, maj_le = NOW()`,
          [nom_fichier, JSON.stringify(pointsCalage), ajustement ? JSON.stringify(ajustement) : null, JSON.stringify(t)]
        );
        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }

      res.json({ id: doc.id, nom_fichier, calques: calquesMeta, bounds });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  // GET /api/maps/dxf/calibration?nom_fichier=... — rappel du géoréférencement d'un fichier déjà importé
  getCalibration: async (req, res) => {
    try {
      const nom = req.query.nom_fichier;
      if (!nom) return res.status(400).json({ message: 'nom_fichier requis' });
      // Source prioritaire : table de calage (conservée même après suppression du DXF)
      let { rows } = await pool.query(
        `SELECT points_calage, ajustement, transform FROM hub_reseau.dxf_calibrations WHERE nom_fichier = $1`,
        [nom]
      );
      if (!rows.length) {
        ({ rows } = await pool.query(
          `SELECT points_calage, ajustement, transform FROM hub_reseau.dxf_documents
           WHERE nom_fichier = $1 ORDER BY cree_le DESC LIMIT 1`,
          [nom]
        ));
      }
      if (!rows.length) return res.json({ found: false });
      res.json({
        found: true,
        points_calage: rows[0].points_calage || [],
        ajustement: rows[0].ajustement || null,
        transform: rows[0].transform || null,
      });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  // GET /api/maps/dxf/layer-styles — styles d'affichage par calque
  getLayerStyles: async (_req, res) => {
    try {
      const { rows } = await pool.query(`SELECT calque, couleur, visible FROM hub_reseau.dxf_layer_styles`);
      res.json(rows);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  // PUT /api/maps/dxf/layer-styles — upsert d'un style { calque, couleur?, visible? }
  saveLayerStyle: async (req, res) => {
    try {
      const { calque, couleur, visible } = req.body;
      if (!calque) return res.status(400).json({ message: 'calque requis' });
      await pool.query(
        `INSERT INTO hub_reseau.dxf_layer_styles (calque, couleur, visible, maj_le)
         VALUES ($1,$2,$3, NOW())
         ON CONFLICT (calque) DO UPDATE SET
           couleur = COALESCE(EXCLUDED.couleur, hub_reseau.dxf_layer_styles.couleur),
           visible = COALESCE(EXCLUDED.visible, hub_reseau.dxf_layer_styles.visible),
           maj_le = NOW()`,
        [calque, couleur ?? null, typeof visible === 'boolean' ? visible : null]
      );
      res.json({ ok: true });
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

  // DELETE /api/maps/dxf/:id — supprime le document et ses entités, mais
  // conserve son géoréférencement (table dxf_calibrations) pour le ré-import.
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
