import { describe, expect, it } from 'vitest';
import { applyMove, boardFrom, initialBoard, legalMoves, moveNotation, squareIndex } from '../src/rules';
import { Game } from '../src/game';
import { chooseMove } from '../src/ai';

const names = (board: ReturnType<typeof boardFrom>, color: 'w' | 'b') =>
  legalMoves(board, color).map(moveNotation).sort();

describe('начальная позиция', () => {
  it('по 12 шашек и 7 ходов у белых', () => {
    const board = initialBoard();
    expect(board.filter((p) => p?.color === 'w')).toHaveLength(12);
    expect(board.filter((p) => p?.color === 'b')).toHaveLength(12);
    expect(board[squareIndex('a1')]?.color).toBe('w');
    expect(names(board, 'w')).toEqual(['a3-b4', 'c3-b4', 'c3-d4', 'e3-d4', 'e3-f4', 'g3-f4', 'g3-h4']);
  });
});

describe('простая шашка', () => {
  it('ходит только вперёд', () => {
    expect(names(boardFrom(['w:d4', 'b:a7']), 'w')).toEqual(['d4-c5', 'd4-e5']);
    expect(names(boardFrom(['b:d4', 'w:a1']), 'b')).toEqual(['d4-c3', 'd4-e3']);
  });

  it('взятие обязательно, в том числе назад', () => {
    expect(names(boardFrom(['w:d4', 'w:a1', 'b:c3']), 'w')).toEqual(['d4:b2']);
  });

  it('серия взятий доводится до конца', () => {
    expect(names(boardFrom(['w:a1', 'b:b2', 'b:d4', 'b:f4']), 'w')).toEqual(['a1:c3:e5:g3']);
  });

  it('можно выбрать любую ветку, не обязательно самую длинную', () => {
    const moves = names(boardFrom(['w:c3', 'b:b4', 'b:d4', 'b:d6']), 'w');
    expect(moves).toEqual(['c3:a5', 'c3:e5:c7']);
  });

  it('становится дамкой посреди взятия и продолжает бить как дамка', () => {
    const board = boardFrom(['w:f6', 'b:e7', 'b:b6']);
    const [move] = legalMoves(board, 'w');
    expect(moveNotation(move)).toBe('f6:d8:a5');
    expect(move.promotes).toBe(true);
    const after = applyMove(board, move);
    expect(after[squareIndex('a5')]).toEqual({ color: 'w', king: true });
  });

  it('доходит до края простым ходом и становится дамкой', () => {
    const [move] = legalMoves(boardFrom(['w:a7', 'b:h2']), 'w');
    expect(move.promotes).toBe(true);
  });
});

describe('дамка', () => {
  it('ходит на любое расстояние', () => {
    expect(legalMoves(boardFrom(['wK:a1', 'b:h6']), 'w')).toHaveLength(7);
  });

  it('бьёт издалека и выбирает поле приземления', () => {
    expect(names(boardFrom(['wK:a1', 'b:d4']), 'w')).toEqual(['a1:e5', 'a1:f6', 'a1:g7', 'a1:h8']);
  });

  it('обязана встать на поле, откуда можно бить дальше', () => {
    expect(names(boardFrom(['wK:a1', 'b:c3', 'b:g5']), 'w')).toEqual(['a1:f6:h4']);
  });

  it('турецкий удар: сбитая шашка остаётся на доске до конца хода', () => {
    // Дамка обходит «ромб» и возвращается на e3. Сбитая d2 ещё стоит и не даёт встать на d2 или c1.
    const moves = names(boardFrom(['wK:c1', 'b:d2', 'b:f4', 'b:f6', 'b:d6', 'b:d4']), 'w');
    expect(moves).toContain('c1:e3:c5:e7:g5:e3');
    expect(moves).not.toContain('c1:e3:c5:e7:g5:d2');
    for (const m of legalMoves(boardFrom(['wK:c1', 'b:d2', 'b:f4', 'b:f6', 'b:d6', 'b:d4']), 'w'))
      expect(new Set(m.captures).size).toBe(5);
  });
});

describe('конец партии', () => {
  it('проигрывает тот, у кого нет ходов', () => {
    // Чёрная шашка a7 заперта белой на b6, которую не побить: c5 занято.
    // Чёрная шашка a7 заперта: b6 занято, а побить её нельзя, потому что c5 тоже занято.
    const g = new Game([], { board: boardFrom(['w:b6', 'w:c5', 'b:a7']), turn: 'b' });
    expect(g.result?.winner).toBe('w');
  });

  it('партия восстанавливается из списка ходов и откатывается', () => {
    const g = new Game();
    g.play(g.legal.find((m) => moveNotation(m) === 'c3-d4')!);
    g.play(g.legal.find((m) => moveNotation(m) === 'f6-e5')!);
    expect(g.notation).toEqual(['c3-d4', 'f6-e5']);
    expect(g.legal.map(moveNotation)).toEqual(['d4:f6']);
    const restored = new Game(g.moves);
    expect(restored.notation).toEqual(g.notation);
    expect(restored.undo(1).notation).toEqual(['c3-d4']);
  });

  it('троекратное повторение — ничья', () => {
    const g = new Game([], { board: boardFrom(['wK:a1', 'bK:h6']), turn: 'w' });
    const shuffle = ['a1-b2', 'h6-g5', 'b2-a1', 'g5-h6'];
    for (let i = 0; i < 2; i++)
      for (const n of shuffle) g.play(g.legal.find((m) => moveNotation(m) === n)!);
    expect(g.result).toEqual({ winner: null, reason: 'позиция повторилась три раза' });
  });
});

describe('бот', () => {
  it('забирает шашку, если это выгодно', () => {
    const board = boardFrom(['w:c3', 'w:a1', 'b:d4', 'b:h8']);
    const move = chooseMove(board, 'w', 'medium');
    expect(moveNotation(move!)).toBe('c3:e5');
  });

  it('не подставляет шашку под взятие', () => {
    // d4-e5 сразу отдаёт шашку (f6:d4), d4-c5 безопасен.
    const board = boardFrom(['w:d4', 'w:a1', 'b:f6', 'b:h8']);
    expect(moveNotation(chooseMove(board, 'w', 'medium')!)).not.toBe('d4-e5');
  });

  it('находит выигрыш в один ход', () => {
    // Белая шашка бьёт последнюю чёрную.
    const board = boardFrom(['w:c3', 'b:d4']);
    expect(moveNotation(chooseMove(board, 'w', 'hard')!)).toBe('c3:e5');
  });
});
