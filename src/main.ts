import './styles.css';
import { Game } from './game';
import { isDark, sameMove, squareName } from './rules';
import type { Board, Color, Move } from './rules';
import type { Level } from './ai';

type Mode = 'ai' | 'pvp';

interface Settings {
  mode: Mode;
  side: Color;
  level: Level;
  flipped: boolean;
}

const STORAGE_KEY = 'checkers:v1';
const THEME_KEY = 'checkers:theme';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const boardEl = $('board');
const statusEl = $('status');
const historyEl = $('history');
const modeEl = $<HTMLSelectElement>('mode');
const sideEl = $<HTMLSelectElement>('side');
const levelEl = $<HTMLSelectElement>('level');
const undoBtn = $<HTMLButtonElement>('undo');

const colorName = { w: 'Белые', b: 'Чёрные' } as const;
const colorGenitive = { w: 'белых', b: 'чёрных' } as const;

// ---------- Состояние ----------

let settings: Settings = { mode: 'ai', side: 'w', level: 'medium', flipped: false };
let game = new Game();
let selected: number | null = null;
/** Поля, уже пройденные в текущей серии взятий. */
let partial: number[] = [];
let thinking = false;
let aiRequest = 0;
/** Подсказка после недопустимого действия игрока. */
let hint: string | null = null;

interface Drag {
  pointerId: number;
  sq: number;
  x: number;
  y: number;
  wasSelected: boolean;
  ghost: HTMLElement | null;
}
let drag: Drag | null = null;

function load(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    settings = { ...settings, ...data.settings };
    game = new Game(data.moves ?? []);
  } catch {
    /* повреждённое сохранение — начинаем заново */
  }
}

function save(): void {
  try {
    const moves = game.moves.map(({ from, path }) => ({ from, path }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings, moves }));
  } catch {
    /* хранилище недоступно (приватный режим) — просто не сохраняем */
  }
}

// ---------- Логика хода ----------

const aiColor = (): Color | null => (settings.mode === 'ai' ? (settings.side === 'w' ? 'b' : 'w') : null);
const humanTurn = () => !game.result && game.turn !== aiColor();
const bottomColor = (): Color => {
  const base = settings.mode === 'ai' ? settings.side : 'w';
  return settings.flipped ? (base === 'w' ? 'b' : 'w') : base;
};

function candidates(): Move[] {
  if (selected === null) return [];
  return game.legal.filter((m) => m.from === selected && partial.every((s, i) => m.path[i] === s));
}

/** Где сейчас стоит выбранная шашка (с учётом начатой серии взятий). */
const selectedPos = () => (partial.length ? partial[partial.length - 1] : selected);

function onSquare(sq: number): void {
  if (!humanTurn()) return;
  if (selected !== null && candidates().some((m) => m.path[partial.length] === sq)) {
    hint = null;
    partial.push(sq);
    const rest = candidates();
    // Если продолжение единственное, доигрываем серию сразу.
    if (rest.length === 1) commit(rest[0]);
    else render();
    return;
  }
  if (partial.length) {
    // Посреди взятия выбрать другую шашку нельзя.
    hint = 'Продолжайте взятие этой же шашкой.';
  } else if (game.board[sq]?.color === game.turn) {
    // Взять можно любую свою шашку, а вот поставить — только по правилам.
    selected = sq;
    hint = game.legal.some((m) => m.from === sq) ? null : noMovesHint();
  } else if (selected !== null && isDark(sq) && !game.board[sq]) {
    hint = 'Так ходить нельзя.';
  } else {
    selected = null;
    hint = null;
  }
  render();
}

function noMovesHint(): string {
  return game.legal[0]?.captures.length
    ? 'Бить обязательно: ходите шашкой, которая может бить.'
    : 'У этой шашки нет ходов.';
}

function commit(move: Move): void {
  game.play(move);
  hint = null;
  selected = null;
  partial = [];
  save();
  render();
  scheduleAi();
}

function resetSelection(): void {
  hint = null;
  selected = null;
  partial = [];
}

// ---------- Бот ----------

const worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });

worker.onmessage = (e: MessageEvent<{ id: number; move: Move | null }>) => {
  if (e.data.id !== aiRequest || !e.data.move) return;
  thinking = false;
  const move = game.legal.find((m) => sameMove(m, e.data.move!));
  if (move) commit(move);
  else render();
};

function cancelAi(): void {
  aiRequest++;
  thinking = false;
}

function scheduleAi(): void {
  if (game.result || game.turn !== aiColor()) return;
  const id = ++aiRequest;
  thinking = true;
  render();
  // Небольшая пауза, чтобы ход компьютера не появлялся мгновенно.
  setTimeout(() => {
    if (id === aiRequest) worker.postMessage({ id, board: game.board, color: game.turn, level: settings.level });
  }, 350);
}

// ---------- Отрисовка ----------

function displayBoard(): { board: Board; taken: Set<number> } {
  if (selected === null || !partial.length) return { board: game.board, taken: new Set() };
  const board = game.board.slice();
  board[partial[partial.length - 1]] = board[selected];
  board[selected] = null;
  return { board, taken: new Set(candidates()[0]?.captures.slice(0, partial.length)) };
}

function order(): number[] {
  const squares = [...Array(64).keys()];
  return bottomColor() === 'w' ? squares : squares.reverse();
}

function renderBoard(): void {
  const { board, taken } = displayBoard();
  const human = humanTurn();
  // Подсветка шашек, которыми можно ходить, — подсказка только для лёгкого уровня.
  const showMovable = human && !partial.length && settings.mode === 'ai' && settings.level === 'easy';
  const movable = new Set(showMovable ? game.legal.map((m) => m.from) : []);
  const targets = new Set(candidates().map((m) => m.path[partial.length]));
  const last = game.moves[game.moves.length - 1];
  const lastSquares = new Set(last ? [last.from, ...last.path] : []);
  const pos = selectedPos();

  const frag = document.createDocumentFragment();
  for (const i of order()) {
    const sq = document.createElement('div');
    sq.className = 'sq ' + (isDark(i) ? 'sq--dark' : 'sq--light');
    sq.dataset.i = String(i);
    sq.setAttribute('role', 'gridcell');
    sq.setAttribute('aria-label', squareName(i));
    if (lastSquares.has(i) && !partial.length) sq.classList.add('sq--last');
    if (partial.includes(i)) sq.classList.add('sq--path');
    if (targets.has(i)) sq.classList.add('sq--target');
    if (movable.has(i) && selected === null) sq.classList.add('sq--movable');
    if (human && !partial.length && board[i]?.color === game.turn) sq.classList.add('sq--own');

    const p = board[i];
    if (p) {
      const el = document.createElement('div');
      el.className = `piece piece--${p.color}`;
      if (p.king) el.classList.add('piece--king');
      if (taken.has(i)) el.classList.add('piece--taken');
      if (i === pos) el.classList.add('piece--selected');
      if (drag?.ghost && i === drag.sq) el.classList.add('piece--lifted');
      sq.append(el);
    }
    frag.append(sq);
  }
  boardEl.replaceChildren(frag);
}

function renderCoords(): void {
  const files = 'abcdefgh'.split('');
  const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
  if (bottomColor() === 'b') {
    files.reverse();
    ranks.reverse();
  }
  const fill = (sel: string, labels: string[]) =>
    document.querySelectorAll(sel).forEach((el) => {
      el.replaceChildren(...labels.map((t) => Object.assign(document.createElement('span'), { textContent: t })));
    });
  fill('.files', files);
  fill('.ranks', ranks);
}

function renderPlayers(): void {
  const label = (c: Color) => {
    const who = settings.mode === 'ai' ? (c === aiColor() ? 'Компьютер' : 'Вы') : colorName[c];
    const n = game.count(c);
    const active = !game.result && game.turn === c;
    return `<span class="dot dot--${c}"></span><span class="who">${who}</span>` +
      `<span class="count">${n} ${plural(n, 'шашка', 'шашки', 'шашек')} · сбито ${12 - n}</span>` +
      (active ? '<span class="turn">ходит</span>' : '');
  };
  const bottom = bottomColor();
  $('player-bottom').innerHTML = label(bottom);
  $('player-top').innerHTML = label(bottom === 'w' ? 'b' : 'w');
}

function plural(n: number, one: string, few: string, many: string): string {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return one;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return few;
  return many;
}

function statusText(): string {
  const r = game.result;
  if (r) {
    if (!r.winner) return `Ничья: ${r.reason}.`;
    if (settings.mode === 'ai') return r.winner === settings.side ? `Вы победили: ${r.reason}.` : `Победил компьютер: ${r.reason}.`;
    return `Победили ${colorGenitive[r.winner]}: ${r.reason}.`;
  }
  if (thinking) return 'Компьютер думает…';
  if (hint) return hint;
  const forced = game.legal[0]?.captures.length ? ' Бить обязательно.' : '';
  if (partial.length) return 'Продолжайте взятие.';
  if (settings.mode === 'ai') return 'Ваш ход.' + forced;
  return `Ход ${colorGenitive[game.turn]}.` + forced;
}

function renderHistory(): void {
  const items: HTMLLIElement[] = [];
  for (let i = 0; i < game.notation.length; i += 2) {
    const li = document.createElement('li');
    li.innerHTML = `<span>${game.notation[i]}</span><span>${game.notation[i + 1] ?? ''}</span>`;
    items.push(li);
  }
  historyEl.replaceChildren(...items);
  historyEl.scrollTop = historyEl.scrollHeight;
}

function canUndo(): boolean {
  if (settings.mode === 'pvp') return game.moves.length > 0;
  return undoPlies() > 0;
}

/** Сколько полуходов откатить, чтобы вернуть последний ход человека. */
function undoPlies(): number {
  const moves = game.moves.length;
  // Белые ходят первыми, поэтому при нечётном числе ходов последний сделали белые.
  const lastByHuman = moves > 0 && (moves % 2 === 1) === (settings.side === 'w');
  if (lastByHuman) return 1;
  return moves >= 2 ? 2 : 0;
}

function render(): void {
  renderBoard();
  renderCoords();
  renderPlayers();
  renderHistory();
  statusEl.textContent = statusText();
  statusEl.classList.toggle('status--over', !!game.result);
  undoBtn.disabled = !canUndo();
  modeEl.value = settings.mode;
  sideEl.value = settings.side;
  levelEl.value = settings.level;
  document.body.classList.toggle('mode-pvp', settings.mode === 'pvp');
  $('level-note').hidden = settings.level !== 'easy';
}

// ---------- Ввод ----------

const squareAt = (x: number, y: number): number => {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('.sq');
  return el && boardEl.contains(el) ? Number(el.dataset.i) : -1;
};

boardEl.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const sq = squareAt(e.clientX, e.clientY);
  if (sq < 0 || !humanTurn()) return;
  const wasSelected = sq === selectedPos();
  if (!wasSelected) onSquare(sq);
  if (selected !== null && sq === selectedPos()) {
    drag = { pointerId: e.pointerId, sq, x: e.clientX, y: e.clientY, wasSelected, ghost: null };
    boardEl.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
});

boardEl.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.pointerId) return;
  if (!drag.ghost) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    const piece = boardEl.querySelector<HTMLElement>(`[data-i="${drag.sq}"] .piece`);
    if (!piece) return;
    const ghost = piece.cloneNode(true) as HTMLElement;
    const size = piece.getBoundingClientRect().width;
    ghost.classList.add('piece--ghost');
    ghost.style.width = ghost.style.height = `${size}px`;
    document.body.append(ghost);
    drag.ghost = ghost;
    render();
  }
  drag.ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
});

function endDrag(e: PointerEvent, cancelled: boolean): void {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const d = drag;
  drag = null;
  d.ghost?.remove();
  if (!d.ghost) {
    // Обычный клик по уже выбранной шашке снимает выбор.
    if (d.wasSelected && !partial.length && !cancelled) resetSelection();
    render();
    return;
  }
  const target = cancelled ? -1 : squareAt(e.clientX, e.clientY);
  if (target >= 0 && target !== d.sq) {
    if (candidates().some((m) => m.path[partial.length] === target)) return onSquare(target);
    // Шашка возвращается на место, выбор сохраняется.
    hint = game.legal.some((m) => m.from === selected) ? 'Так ходить нельзя.' : noMovesHint();
  }
  render();
}

boardEl.addEventListener('pointerup', (e) => endDrag(e, false));
boardEl.addEventListener('pointercancel', (e) => endDrag(e, true));

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !partial.length && selected !== null) {
    resetSelection();
    render();
  }
});

$('new').addEventListener('click', () => {
  cancelAi();
  resetSelection();
  game = new Game();
  save();
  render();
  scheduleAi();
});

undoBtn.addEventListener('click', () => {
  const plies = settings.mode === 'pvp' ? 1 : undoPlies();
  if (!plies) return;
  cancelAi();
  resetSelection();
  game = game.undo(plies);
  save();
  render();
  scheduleAi();
});

$('flip').addEventListener('click', () => {
  settings.flipped = !settings.flipped;
  save();
  render();
});

function onSettingsChange(): void {
  settings.mode = modeEl.value as Mode;
  settings.side = sideEl.value as Color;
  settings.level = levelEl.value as Level;
  cancelAi();
  resetSelection();
  save();
  render();
  scheduleAi();
}
[modeEl, sideEl, levelEl].forEach((el) => el.addEventListener('change', onSettingsChange));

// ---------- Тема ----------

function applyTheme(theme: string | null): void {
  if (theme) document.documentElement.dataset.theme = theme;
}

$('theme').addEventListener('click', () => {
  const current =
    document.documentElement.dataset.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    /* не страшно */
  }
});

try {
  applyTheme(localStorage.getItem(THEME_KEY));
} catch {
  /* не страшно */
}

load();
render();
scheduleAi();
