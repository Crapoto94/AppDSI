// =====================================================================
//  TETRIS multijoueur — moteur de jeu.
//  - Inspiré du Tetris pygame (pythonassets.com), adapté au temps réel.
//  - TOUS les joueurs reçoivent la MÊME séquence de pièces (équitable) et
//    jouent leur propre grille EN MÊME TEMPS sur leur téléphone.
//  - On est ÉLIMINÉ quand la grille déborde. La BORNE montre les 2 meilleurs
//    encore en vie. Vainqueur = dernier debout / plus de lignes.
// =====================================================================

const W = 10, H = 20;

// 7 tétrominos ; l'indice de couleur (1..7) sert au rendu côté client.
const PIECES = {
  I: { mat: [[1, 1, 1, 1]],            color: 1 },
  O: { mat: [[1, 1], [1, 1]],          color: 2 },
  T: { mat: [[0, 1, 0], [1, 1, 1]],    color: 3 },
  S: { mat: [[0, 1, 1], [1, 1, 0]],    color: 4 },
  Z: { mat: [[1, 1, 0], [0, 1, 1]],    color: 5 },
  J: { mat: [[1, 0, 0], [1, 1, 1]],    color: 6 },
  L: { mat: [[0, 0, 1], [1, 1, 1]],    color: 7 },
};
const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

function rotate(mat) {
  const R = mat.length, C = mat[0].length;
  const out = Array.from({ length: C }, () => Array(R).fill(0));
  for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) out[j][R - 1 - i] = mat[i][j];
  return out;
}
function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

class TetrisGame {
  constructor(players, opts = {}) {
    this.duration = (opts.seconds || 240) * 1000;
    this.tickMs = 110;
    this.baseGravity = 10;      // ticks entre 2 descentes au DÉBUT (~1,1 s) — lent
    this.startTime = Date.now();
    this.status = 'playing';    // playing | done
    this.elimCount = 0;         // ordre d'élimination
    this.seq = this.buildSequence(600); // séquence COMMUNE de pièces

    this.players = players.map((p) => ({
      id: p.id, name: p.name,
      board: Array.from({ length: H }, () => Array(W).fill(0)),
      idx: 0, piece: null, fall: 0,
      lines: 0, score: 0, eliminated: false, elimOrder: 0,
    }));
    this.startCount = this.players.length;
    for (const pl of this.players) this.spawn(pl);
  }

  buildSequence(n) {
    const seq = [];
    while (seq.length < n) seq.push(...shuffle([...TYPES]));
    return seq;
  }

  /** Rejoint une partie déjà en cours (nouvelle grille, score à 0). */
  addPlayer(p) {
    if (this.status !== 'playing') return false;
    const id = String(p?.id || '');
    if (!id || this.players.some(x => String(x.id) === id)) return false;
    const idx = this.players.reduce((m, x) => Math.max(m, x.idx), 0);
    const pl = {
      id, name: p.name || 'Participant',
      board: Array.from({ length: H }, () => Array(W).fill(0)),
      idx, piece: null, fall: 0,
      lines: 0, score: 0, eliminated: false, elimOrder: 0,
    };
    this.players.push(pl);
    this.startCount = Math.max(this.startCount, this.players.length);
    this.spawn(pl);
    return true;
  }

  // --- Pièce courante ------------------------------------------------
  spawn(pl) {
    const type = this.seq[pl.idx % this.seq.length];
    pl.idx++;
    const def = PIECES[type];
    const mat = def.mat.map((row) => row.slice());
    const c = Math.floor((W - mat[0].length) / 2);
    const piece = { type, color: def.color, mat, r: 0, c };
    if (this.collide(pl.board, piece.mat, piece.r, piece.c)) {
      // débordement : joueur éliminé
      pl.piece = null;
      if (!pl.eliminated) { pl.eliminated = true; pl.elimOrder = ++this.elimCount; }
      return;
    }
    pl.piece = piece;
    pl.fall = 0;
  }

  collide(board, mat, r, c) {
    for (let i = 0; i < mat.length; i++) for (let j = 0; j < mat[0].length; j++) {
      if (!mat[i][j]) continue;
      const rr = r + i, cc = c + j;
      if (cc < 0 || cc >= W || rr >= H) return true;
      if (rr >= 0 && board[rr][cc]) return true;
    }
    return false;
  }

  lock(pl) {
    const p = pl.piece;
    for (let i = 0; i < p.mat.length; i++) for (let j = 0; j < p.mat[0].length; j++) {
      if (p.mat[i][j] && p.r + i >= 0) pl.board[p.r + i][p.c + j] = p.color;
    }
    // lignes complètes
    let cleared = 0;
    const clearedRows = [];
    for (let r = H - 1; r >= 0; r--) {
      if (pl.board[r].every((x) => x)) { clearedRows.push(r); pl.board.splice(r, 1); pl.board.unshift(Array(W).fill(0)); cleared++; r++; }
    }
    if (cleared) {
      pl.lines += cleared; pl.score += [0, 100, 300, 500, 800][cleared];
      pl.clearSeq = (pl.clearSeq || 0) + 1;
      pl.lastClear = { seq: pl.clearSeq, rows: clearedRows, count: cleared, at: Date.now() };
    }
    // Petit délai après le verrouillage (notamment après un « lâcher » espace) :
    // on ne peut pas déplacer la pièce suivante à gauche/droite pendant 250 ms.
    pl.lockUntil = Date.now() + 250;
    this.spawn(pl);
  }

  // --- Entrées joueur ------------------------------------------------
  move(id, dir) {
    if (this.status !== 'playing') return;
    const pl = this.players.find((p) => p.id === id);
    if (!pl || pl.eliminated || !pl.piece) return;
    const p = pl.piece;
    if ((dir === 'left' || dir === 'right') && pl.lockUntil && Date.now() < pl.lockUntil) return;
    if (dir === 'left' && !this.collide(pl.board, p.mat, p.r, p.c - 1)) p.c--;
    else if (dir === 'right' && !this.collide(pl.board, p.mat, p.r, p.c + 1)) p.c++;
    else if (dir === 'rotate') {
      const m = rotate(p.mat);
      for (const k of [0, -1, 1, -2, 2]) { // wall kicks simples
        if (!this.collide(pl.board, m, p.r, p.c + k)) { p.mat = m; p.c += k; break; }
      }
    } else if (dir === 'down') {
      if (!this.collide(pl.board, p.mat, p.r + 1, p.c)) { p.r++; pl.fall = 0; pl.score += 1; }
      else this.lock(pl);
    } else if (dir === 'drop') {
      let n = 0;
      while (!this.collide(pl.board, p.mat, p.r + 1, p.c)) { p.r++; n++; }
      pl.score += n * 2;
      this.lock(pl);
    }
  }

  // Gravité : +20% de vitesse toutes les 30 s pour éviter les parties trop longues.
  // baseGravity = 10 ticks (~1,1 s). Après 30 s → 8, 60 s → 6… min 1 (~0,11 s).
  curGravity() {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const steps = Math.floor(elapsed / 30);
    return Math.max(1, Math.floor(this.baseGravity * Math.pow(0.8, steps)));
  }
  level() { return Math.floor((Date.now() - this.startTime) / 30000) + 1; }

  // --- Boucle de gravité ---------------------------------------------
  tick() {
    if (this.status !== 'playing') return;
    if (Date.now() - this.startTime > this.duration) return this.end();
    const g = this.curGravity();
    for (const pl of this.players) {
      if (pl.eliminated || !pl.piece) continue;
      if (++pl.fall >= g) {
        pl.fall = 0;
        const p = pl.piece;
        if (!this.collide(pl.board, p.mat, p.r + 1, p.c)) p.r++;
        else this.lock(pl);
      }
    }
    // Fin : en multi, dernier survivant ; sinon tout le monde éliminé
    const alive = this.players.filter((p) => !p.eliminated);
    if (this.startCount > 1 && alive.length <= 1) return this.end();
    if (alive.length === 0) return this.end();
  }

  end() { if (this.status === 'playing') { this.status = 'done'; this.endedAt = Date.now(); } }

  ranking() {
    return this.players.slice().sort((a, b) =>
      (b.eliminated ? 0 : 1) - (a.eliminated ? 0 : 1) ||
      b.lines - a.lines || b.score - a.score || b.elimOrder - a.elimOrder
    ).map((p) => ({ id: p.id, name: p.name, lines: p.lines, score: p.score, eliminated: p.eliminated }));
  }

  // Grille « cuite » : plateau + pièce active incrustée, en lignes de 10 chars.
  bakeCells(pl) {
    const g = pl.board.map((row) => row.slice());
    const p = pl.piece;
    if (p && !pl.eliminated) {
      for (let i = 0; i < p.mat.length; i++) for (let j = 0; j < p.mat[0].length; j++) {
        if (p.mat[i][j] && p.r + i >= 0 && p.r + i < H && p.c + j >= 0 && p.c + j < W) g[p.r + i][p.c + j] = p.color;
      }
    }
    return g.map((row) => row.join(''));
  }

  // Aperçu de la prochaine pièce d'un joueur (matrice + couleur).
  nextPiece(pl) {
    const type = this.seq[pl.idx % this.seq.length];
    const def = PIECES[type];
    return { color: def.color, mat: def.mat };
  }

  publicState() {
    return {
      type: 'tetris', status: this.status, w: W, h: H,
      timeLeft: Math.max(0, Math.ceil((this.duration - (Date.now() - this.startTime)) / 1000)),
      level: this.level(),
      players: this.players.map((p) => ({
        id: p.id, name: p.name, lines: p.lines, score: p.score,
        eliminated: p.eliminated, cells: this.bakeCells(p),
        next: p.eliminated ? null : this.nextPiece(p),
        clear: p.lastClear || null,
      })),
      ranking: this.status !== 'playing' ? this.ranking() : null,
    };
  }
}

module.exports = { TetrisGame };
