// Géoréférencement DXF → GPS : calcul de la transformation affine à partir des
// points de calage, plus un ajustement manuel (translation / rotation / échelle).
//
// Convention : la transformation mappe (dxfX, dxfY) → (lat, lng).
//   lat = a·x + b·y + tx
//   lng = c·x + d·y + ty
// Le rendu GeoJSON utilise lui l'ordre [lng, lat] (cf. transformFeature).

export interface CalibrationPoint {
  dxfX: number;
  dxfY: number;
  lat: number;
  lng: number;
}

export interface Transform {
  a: number; b: number; tx: number;
  c: number; d: number; ty: number;
}

export interface Adjustment {
  dLat: number;        // décalage latitude (°)
  dLng: number;        // décalage longitude (°)
  rotationDeg: number; // rotation (°), sens horaire positif
  scale: number;       // facteur d'échelle (1 = identité)
}

export const IDENTITY_ADJUSTMENT: Adjustment = { dLat: 0, dLng: 0, rotationDeg: 0, scale: 1 };

// ── Matrices 3×3 homogènes ────────────────────────────────────────────
type Mat3 = number[][];

function mul(A: Mat3, B: Mat3): Mat3 {
  const R: Mat3 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      R[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
  return R;
}
const mulAll = (...m: Mat3[]): Mat3 => m.reduce((acc, cur) => mul(acc, cur));
const translate = (tx: number, ty: number): Mat3 => [[1, 0, tx], [0, 1, ty], [0, 0, 1]];
const diag = (kx: number, ky: number): Mat3 => [[kx, 0, 0], [0, ky, 0], [0, 0, 1]];
const scaleRot = (s: number, theta: number): Mat3 => {
  const co = Math.cos(theta), si = Math.sin(theta);
  return [[s * co, -s * si, 0], [s * si, s * co, 0], [0, 0, 1]];
};

// ── Transformation de base (moindres carrés) — port du backend ────────
export function computeBaseTransform(pts: CalibrationPoint[]): Transform | null {
  const n = pts.length;
  if (n < 2) return null;

  // 2 points : solution exacte (similitude : rotation + échelle uniforme)
  if (n === 2) {
    const p0 = pts[0], p1 = pts[1];
    const dx = p1.dxfX - p0.dxfX, dy = p1.dxfY - p0.dxfY;
    const dlat = p1.lat - p0.lat, dlng = p1.lng - p0.lng;
    const denom = dx * dx + dy * dy;
    if (!denom) return null;
    const scale = Math.sqrt((dlat * dlat + dlng * dlng) / denom) || 1;
    const angle = Math.atan2(dlng, dlat) - Math.atan2(dy, dx);
    const cosa = Math.cos(angle) * scale;
    const sina = Math.sin(angle) * scale;
    return {
      a: cosa, b: -sina, tx: p0.lat - (cosa * p0.dxfX - sina * p0.dxfY),
      c: sina, d: cosa, ty: p0.lng - (sina * p0.dxfX + cosa * p0.dxfY),
    };
  }

  // 3 points et plus : moindres carrés (affine complète) via (XᵀX)⁻¹ XᵀY
  const X = pts.map(p => [p.dxfX, p.dxfY, 1]);
  const Ylat = pts.map(p => p.lat);
  const Ylng = pts.map(p => p.lng);
  const XtX: Mat3 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      XtX[i][j] = X.reduce((s, row) => s + row[i] * row[j], 0);
  const XtYlat = [0, 1, 2].map(i => X.reduce((s, row, k) => s + row[i] * Ylat[k], 0));
  const XtYlng = [0, 1, 2].map(i => X.reduce((s, row, k) => s + row[i] * Ylng[k], 0));

  const m = XtX;
  const det =
      m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
    - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
    + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  if (!det) return null;
  const inv: Mat3 = [
    [(m[1][1] * m[2][2] - m[1][2] * m[2][1]) / det, (m[0][2] * m[2][1] - m[0][1] * m[2][2]) / det, (m[0][1] * m[1][2] - m[0][2] * m[1][1]) / det],
    [(m[1][2] * m[2][0] - m[1][0] * m[2][2]) / det, (m[0][0] * m[2][2] - m[0][2] * m[2][0]) / det, (m[0][2] * m[1][0] - m[0][0] * m[1][2]) / det],
    [(m[1][0] * m[2][1] - m[1][1] * m[2][0]) / det, (m[0][1] * m[2][0] - m[0][0] * m[2][1]) / det, (m[0][0] * m[1][1] - m[0][1] * m[1][0]) / det],
  ];
  const coeffLat = inv.map(row => row.reduce((s, v, i) => s + v * XtYlat[i], 0));
  const coeffLng = inv.map(row => row.reduce((s, v, i) => s + v * XtYlng[i], 0));
  return { a: coeffLat[0], b: coeffLat[1], tx: coeffLat[2], c: coeffLng[0], d: coeffLng[1], ty: coeffLng[2] };
}

// ── Composition base + ajustement → transformation finale ─────────────
// L'ajustement (rotation/échelle) est appliqué autour du centroïde GPS des
// points de calage, dans un repère localement métrique (correction cos-lat),
// puis la translation utilisateur. Tout reste affine → composable en une 3×3.
export function composeTransform(
  base: Transform,
  adj: Adjustment,
  centroid: { lat: number; lng: number },
): Transform {
  const base3: Mat3 = [[base.a, base.b, base.tx], [base.c, base.d, base.ty], [0, 0, 1]];

  const theta = (adj.rotationDeg * Math.PI) / 180;
  const k = Math.cos((centroid.lat * Math.PI) / 180) || 1; // facteur métrique sur lng
  const clat = centroid.lat, clng = centroid.lng;

  // A (lat,lng) → (lat',lng') appliqué de droite à gauche :
  //   1. diag(1,k)        : passage en repère métrique
  //   2. translate(-clat,-k·clng) : centrage sur le centroïde
  //   3. scaleRot         : rotation + échelle
  //   4. translate(clat,k·clng)   : décentrage
  //   5. diag(1,1/k)      : retour en degrés
  //   6. translate(dLat,dLng)     : décalage utilisateur
  const A = mulAll(
    translate(adj.dLat, adj.dLng),
    diag(1, 1 / k),
    translate(clat, k * clng),
    scaleRot(adj.scale, theta),
    translate(-clat, -k * clng),
    diag(1, k),
  );

  const F = mul(A, base3);
  return { a: F[0][0], b: F[0][1], tx: F[0][2], c: F[1][0], d: F[1][1], ty: F[1][2] };
}

export function centroidOf(pts: CalibrationPoint[]): { lat: number; lng: number } {
  const n = pts.length || 1;
  return {
    lat: pts.reduce((s, p) => s + p.lat, 0) / n,
    lng: pts.reduce((s, p) => s + p.lng, 0) / n,
  };
}

// ── Géoréférencement manuel (placement / rotation / échelle) ──────────
export interface DxfBounds { minX: number; minY: number; maxX: number; maxY: number; }

export interface Placement {
  lat0: number;        // latitude du centre du plan
  lng0: number;        // longitude du centre du plan
  scaleMul: number;    // multiplicateur d'échelle (× sur l'échelle d'ajustement initiale)
  rotationDeg: number; // rotation (°), sens horaire
}

// Échelle initiale (mètres par unité DXF) pour que le plan occupe ~targetMeters sur la carte.
export function fitScale(b: DxfBounds, targetMeters = 1000): number {
  const ext = Math.max(b.maxX - b.minX, b.maxY - b.minY);
  return ext > 0 ? targetMeters / ext : 1;
}

// Transformation similitude : (dxfX,dxfY) → (lat,lng), centre du plan placé sur (lat0,lng0).
// S = mètres par unité DXF. rotationDeg horaire.
export function computePlacementTransform(b: DxfBounds, lat0: number, lng0: number, S: number, rotationDeg: number): Transform {
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  const k = Math.cos((lat0 * Math.PI) / 180) || 1;
  const A = S / 111320;            // mètres → degrés de latitude
  const B = S / (111320 * k);      // mètres → degrés de longitude
  const th = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(th), sin = Math.sin(th);
  const a = A * sin, b2 = A * cos;
  const c = B * cos, d = -B * sin;
  return {
    a, b: b2, tx: lat0 - a * cx - b2 * cy,
    c, d, ty: lng0 - c * cx - d * cy,
  };
}

// ── Application aux coordonnées ───────────────────────────────────────
export function applyTransform(t: Transform, x: number, y: number): [number, number] {
  return [t.a * x + t.b * y + t.tx, t.c * x + t.d * y + t.ty]; // [lat, lng]
}

// Transforme une Feature DXF (coords [x,y]) en GeoJSON géoréférencé ([lng,lat]).
export function transformFeature(feature: any, t: Transform): any {
  const conv = (coords: any): any => {
    if (typeof coords[0] === 'number') {
      const [lat, lng] = applyTransform(t, coords[0], coords[1]);
      return [lng, lat];
    }
    return coords.map(conv);
  };
  return {
    ...feature,
    geometry: { ...feature.geometry, coordinates: conv(feature.geometry.coordinates) },
  };
}
