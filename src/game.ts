import { applyMove, initialBoard, legalMoves, moveNotation, opponent, sameMove } from './rules';
import type { Board, Color, Move } from './rules';

export interface Result {
  winner: Color | null;
  reason: string;
}

/** 15 ходов каждой стороны только дамками без взятий — ничья. */
const KING_ONLY_DRAW_PLIES = 30;

const boardKey = (board: Board, turn: Color) =>
  turn + board.map((p) => (p ? (p.king ? p.color.toUpperCase() : p.color) : '.')).join('');

/** Партия целиком определяется списком ходов, поэтому её легко сохранять и отменять ходы. */
export class Game {
  board: Board = initialBoard();
  turn: Color = 'w';
  moves: Move[] = [];
  notation: string[] = [];
  legal: Move[] = [];
  result: Result | null = null;
  private kingOnlyPlies = 0;
  private positions = new Map<string, number>();

  constructor(moves: Pick<Move, 'from' | 'path'>[] = [], private start?: { board: Board; turn: Color }) {
    if (start) {
      this.board = start.board;
      this.turn = start.turn;
    }
    this.refresh();
    for (const m of moves) {
      const legal = this.legal.find((l) => sameMove(l, m));
      if (!legal || this.result) break;
      this.play(legal);
    }
  }

  play(move: Move): void {
    const piece = this.board[move.from]!;
    this.kingOnlyPlies = piece.king && !move.captures.length ? this.kingOnlyPlies + 1 : 0;
    this.board = applyMove(this.board, move);
    this.moves.push(move);
    this.notation.push(moveNotation(move));
    this.turn = opponent(this.turn);
    this.refresh();
  }

  undo(plies: number): Game {
    return new Game(this.moves.slice(0, Math.max(0, this.moves.length - plies)), this.start);
  }

  count(color: Color): number {
    return this.board.filter((p) => p?.color === color).length;
  }

  private refresh(): void {
    this.legal = legalMoves(this.board, this.turn);
    const key = boardKey(this.board, this.turn);
    const seen = (this.positions.get(key) ?? 0) + 1;
    this.positions.set(key, seen);

    if (!this.legal.length) {
      const winner = opponent(this.turn);
      this.result = {
        winner,
        reason: this.count(this.turn) ? 'у соперника не осталось ходов' : 'все шашки соперника сбиты',
      };
    } else if (seen >= 3) {
      this.result = { winner: null, reason: 'позиция повторилась три раза' };
    } else if (this.kingOnlyPlies >= KING_ONLY_DRAW_PLIES) {
      this.result = { winner: null, reason: '15 ходов только дамками без взятий' };
    } else {
      this.result = null;
    }
  }
}
