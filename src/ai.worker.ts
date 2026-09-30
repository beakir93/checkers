import { chooseMove } from './ai';
import type { Level } from './ai';
import type { Board, Color } from './rules';

interface Request {
  id: number;
  board: Board;
  color: Color;
  level: Level;
}

self.onmessage = (e: MessageEvent<Request>) => {
  const { id, board, color, level } = e.data;
  const move = chooseMove(board, color, level);
  self.postMessage({ id, move });
};
