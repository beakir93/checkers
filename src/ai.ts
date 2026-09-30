import { applyMove, legalMoves, opponent, rowOf, colOf } from './rules';
import type { Board, Color, Move } from './rules';

export type Level = 'easy' | 'medium' | 'hard';

interface LevelConfig {
  maxDepth: number;
  timeMs: number;
  /** Вероятность сделать случайный ход вместо лучшего. */
  blunder: number;
}

export const LEVELS: Record<Level, LevelConfig> = {
  easy: { maxDepth: 2, timeMs: 300, blunder: 0.3 },
  medium: { maxDepth: 5, timeMs: 800, blunder: 0 },
  hard: { maxDepth: 14, timeMs: 1500, blunder: 0 },
};

const WIN = 100_000;
const MAN = 100;
const KING = 280;
const MAX_CAPTURE_EXTENSION = 8;

class Timeout extends Error {}

function evaluate(board: Board, color: Color): number {
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p) continue;
    const r = rowOf(i);
    const c = colOf(i);
    let v: number;
    if (p.king) {
      v = KING + (r + c === 7 ? 12 : 0); // большая дорога
    } else {
      const advanced = p.color === 'w' ? 7 - r : r;
      v = MAN + advanced * 4;
      if (c >= 2 && c <= 5 && r >= 2 && r <= 5) v += 6;
      if (advanced === 0) v += 4; // шашки на последнем ряду мешают сопернику пройти в дамки
    }
    score += p.color === color ? v : -v;
  }
  return score;
}

function search(board: Board, color: Color, depth: number, alpha: number, beta: number, ply: number, deadline: number): number {
  if (performance.now() > deadline) throw new Timeout();
  const moves = legalMoves(board, color);
  if (!moves.length) return -WIN + ply;
  const forced = moves[0].captures.length > 0;
  // Взятия досчитываем за горизонтом, иначе бот не видит размены.
  if (depth <= 0 && (!forced || depth <= -MAX_CAPTURE_EXTENSION)) return evaluate(board, color);

  let best = -Infinity;
  for (const m of order(moves)) {
    const v = -search(applyMove(board, m), opponent(color), depth - 1, -beta, -alpha, ply + 1, deadline);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

const order = (moves: Move[]) =>
  moves.length > 1 ? [...moves].sort((a, b) => b.captures.length - a.captures.length || +b.promotes - +a.promotes) : moves;

/** Выбирает ход: итеративное углубление с ограничением по времени. */
export function chooseMove(board: Board, color: Color, level: Level, random = Math.random): Move | null {
  const moves = legalMoves(board, color);
  if (moves.length <= 1) return moves[0] ?? null;
  const cfg = LEVELS[level];
  if (random() < cfg.blunder) return moves[Math.floor(random() * moves.length)];

  const deadline = performance.now() + cfg.timeMs;
  let bestMoves: Move[] = [moves[0]];
  let ordered = order(moves);

  for (let depth = 1; depth <= cfg.maxDepth; depth++) {
    try {
      const scored = ordered.map((m) => ({
        m,
        v: -search(applyMove(board, m), opponent(color), depth - 1, -Infinity, Infinity, 1, deadline),
      }));
      scored.sort((a, b) => b.v - a.v);
      ordered = scored.map((s) => s.m);
      bestMoves = scored.filter((s) => s.v === scored[0].v).map((s) => s.m);
      if (Math.abs(scored[0].v) > WIN / 2) break;
    } catch (e) {
      if (e instanceof Timeout) break;
      throw e;
    }
  }
  // Среди равных ходов выбираем случайный, чтобы партии не повторялись.
  return bestMoves[Math.floor(random() * bestMoves.length)];
}
