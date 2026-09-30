// Правила русских шашек: доска 8×8, обязательное взятие, простая шашка бьёт назад,
// дамка «дальнобойная», турецкий удар (сбитые шашки снимаются после окончания хода).

export type Color = 'w' | 'b';

export interface Piece {
  color: Color;
  king: boolean;
}

export type Board = (Piece | null)[];

export interface Move {
  from: number;
  /** Поля, на которые шашка встаёт по ходу (для простого хода — одно поле). */
  path: number[];
  /** Сбитые шашки в порядке взятия. */
  captures: number[];
  /** Шашка стала дамкой в этом ходе. */
  promotes: boolean;
}

export const rowOf = (i: number) => i >> 3;
export const colOf = (i: number) => i & 7;
export const idx = (r: number, c: number) => r * 8 + c;
export const isDark = (i: number) => (rowOf(i) + colOf(i)) % 2 === 1;
export const opponent = (c: Color): Color => (c === 'w' ? 'b' : 'w');

const onBoard = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
const promoRow = (c: Color) => (c === 'w' ? 0 : 7);
const forward = (c: Color) => (c === 'w' ? -1 : 1);
const DIRS: [number, number][] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

/** Имя поля в шахматной нотации: строка 0 — восьмая горизонталь. */
export function squareName(i: number): string {
  return 'abcdefgh'[colOf(i)] + (8 - rowOf(i));
}

export function squareIndex(name: string): number {
  return idx(8 - Number(name[1]), name.charCodeAt(0) - 97);
}

export function initialBoard(): Board {
  const board: Board = Array(64).fill(null);
  for (let i = 0; i < 64; i++) {
    if (!isDark(i)) continue;
    if (rowOf(i) < 3) board[i] = { color: 'b', king: false };
    else if (rowOf(i) > 4) board[i] = { color: 'w', king: false };
  }
  return board;
}

/** Собирает доску из списка вида ['w:c3', 'wK:e1', 'b:d6'] (удобно для тестов). */
export function boardFrom(pieces: string[]): Board {
  const board: Board = Array(64).fill(null);
  for (const p of pieces) {
    const [kind, sq] = p.split(':');
    board[squareIndex(sq)] = { color: kind[0] as Color, king: kind[1] === 'K' };
  }
  return board;
}

interface Jump {
  land: number;
  cap: number;
}

/**
 * Прыжки из позиции pos. Исходное поле `from` считается пустым (шашка с него ушла),
 * сбитые, но ещё не снятые шашки занимают поле и повторно не бьются.
 */
function jumpsFrom(board: Board, from: number, color: Color, pos: number, king: boolean, caps: number[]): Jump[] {
  const occupied = (s: number) => s !== from && board[s] !== null;
  const isEnemy = (s: number) => occupied(s) && board[s]!.color !== color && !caps.includes(s);
  const r = rowOf(pos);
  const c = colOf(pos);
  const out: Jump[] = [];

  for (const [dr, dc] of DIRS) {
    if (!king) {
      if (!onBoard(r + 2 * dr, c + 2 * dc)) continue;
      const mid = idx(r + dr, c + dc);
      const land = idx(r + 2 * dr, c + 2 * dc);
      if (isEnemy(mid) && !occupied(land)) out.push({ land, cap: mid });
      continue;
    }

    let rr = r + dr;
    let cc = c + dc;
    while (onBoard(rr, cc) && !occupied(idx(rr, cc))) {
      rr += dr;
      cc += dc;
    }
    if (!onBoard(rr, cc) || !isEnemy(idx(rr, cc))) continue;
    const cap = idx(rr, cc);
    const landings: number[] = [];
    rr += dr;
    cc += dc;
    while (onBoard(rr, cc) && !occupied(idx(rr, cc))) {
      landings.push(idx(rr, cc));
      rr += dr;
      cc += dc;
    }
    // Если с какого-то поля можно бить дальше, дамка обязана встать именно туда.
    const nextCaps = [...caps, cap];
    const continuing = landings.filter((l) => jumpsFrom(board, from, color, l, true, nextCaps).length > 0);
    for (const land of continuing.length ? continuing : landings) out.push({ land, cap });
  }
  return out;
}

function captureMoves(board: Board, from: number): Move[] {
  const piece = board[from]!;
  const moves: Move[] = [];
  const walk = (pos: number, king: boolean, path: number[], caps: number[]) => {
    const jumps = jumpsFrom(board, from, piece.color, pos, king, caps);
    if (!jumps.length) {
      if (caps.length) moves.push({ from, path, captures: caps, promotes: king && !piece.king });
      return;
    }
    for (const { land, cap } of jumps) {
      // Дойдя до последней горизонтали, шашка продолжает бить уже как дамка.
      const nowKing = king || rowOf(land) === promoRow(piece.color);
      walk(land, nowKing, [...path, land], [...caps, cap]);
    }
  };
  walk(from, piece.king, [], []);
  return moves;
}

function quietMoves(board: Board, from: number): Move[] {
  const piece = board[from]!;
  const r = rowOf(from);
  const c = colOf(from);
  const moves: Move[] = [];
  for (const [dr, dc] of DIRS) {
    if (!piece.king) {
      if (dr !== forward(piece.color) || !onBoard(r + dr, c + dc)) continue;
      const to = idx(r + dr, c + dc);
      if (!board[to]) moves.push({ from, path: [to], captures: [], promotes: rowOf(to) === promoRow(piece.color) });
      continue;
    }
    let rr = r + dr;
    let cc = c + dc;
    while (onBoard(rr, cc) && !board[idx(rr, cc)]) {
      moves.push({ from, path: [idx(rr, cc)], captures: [], promotes: false });
      rr += dr;
      cc += dc;
    }
  }
  return moves;
}

export function legalMoves(board: Board, color: Color): Move[] {
  const captures: Move[] = [];
  const quiet: Move[] = [];
  for (let i = 0; i < 64; i++) {
    if (board[i]?.color !== color) continue;
    captures.push(...captureMoves(board, i));
    if (!captures.length) quiet.push(...quietMoves(board, i));
  }
  return captures.length ? captures : quiet;
}

export function applyMove(board: Board, move: Move): Board {
  const next = board.slice();
  const piece = next[move.from]!;
  next[move.from] = null;
  for (const c of move.captures) next[c] = null;
  next[move.path[move.path.length - 1]] = { color: piece.color, king: piece.king || move.promotes };
  return next;
}

export function moveNotation(move: Move): string {
  const squares = [move.from, ...move.path].map(squareName);
  return squares.join(move.captures.length ? ':' : '-');
}

export function sameMove(a: Pick<Move, 'from' | 'path'>, b: Pick<Move, 'from' | 'path'>): boolean {
  return a.from === b.from && a.path.length === b.path.length && a.path.every((s, i) => s === b.path[i]);
}
