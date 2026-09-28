// The rules of Tetris. This file has no drawing or keyboard code, so it runs both in the browser
// (where it defines window.Tetris for ui.js) and in Node (where the unit tests require() it).
(function () {
  'use strict';

  const BOARD_WIDTH = 10;
  const BOARD_HEIGHT = 20;

  // The pieces, drawn in the orientation they start in. Each shape sits in a square box so that
  // rotating the box turns the piece about its center.
  // Triominoes are made of three squares. There are only two of them.
  const PIECES = [
    { name: 'I', color: '#38c8ee', shape: ['...', 'XXX', '...'] },
    { name: 'L', color: '#f49a30', shape: ['X.', 'XX'] },
  ];

  // Points for clearing 1, 2, 3, or 4 rows at once, multiplied by the current level.
  const LINE_SCORES = [0, 100, 300, 500, 800];
  const LINES_PER_LEVEL = 10;
  // Offsets to try, in order, when a rotation is blocked: nudge sideways, then up (wall kicks).
  const KICKS = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1]];

  // Turns ['.X.', 'XXX'] into a grid of booleans.
  function parseShape(rows) {
    return rows.map((row) => [...row].map((ch) => ch !== '.'));
  }

  function rotateClockwise(shape) {
    const n = shape.length;
    return shape.map((row, r) => row.map((_, c) => shape[n - 1 - c][r]));
  }

  // The board coordinates [x, y] covered by a shape whose box's top-left corner is at (x, y).
  function cellsOf(shape, x, y) {
    const cells = [];
    shape.forEach((row, r) => row.forEach((filled, c) => {
      if (filled) cells.push([x + c, y + r]);
    }));
    return cells;
  }

  // A small seeded random number generator (mulberry32), so a game can be replayed exactly.
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function emptyBoard(width, height) {
    return Array.from({ length: height }, () => Array(width).fill(null));
  }

  function createGame(seed = Math.floor(Math.random() * 2 ** 32)) {
    const state = {
      width: BOARD_WIDTH,
      height: BOARD_HEIGHT,
      board: emptyBoard(BOARD_WIDTH, BOARD_HEIGHT), // board[y][x]: a color, or null if empty
      current: null, // the falling piece: { type, shape, x, y }
      nextType: 0,
      bag: [],
      rng: makeRng(seed),
      score: 0,
      lines: 0,
      level: 1,
      lastClear: null, // { lines, points, rows, before } for the most recent row clear
      paused: false,
      over: false,
    };
    state.nextType = drawFromBag(state);
    spawn(state);
    return state;
  }

  // Bag randomizer: deal each piece once, in shuffled order, then reshuffle and repeat. This
  // avoids long droughts of any one piece.
  function drawFromBag(state) {
    if (state.bag.length === 0) {
      state.bag = PIECES.map((_, i) => i);
      for (let i = state.bag.length - 1; i > 0; i--) {
        const j = Math.floor(state.rng() * (i + 1));
        [state.bag[i], state.bag[j]] = [state.bag[j], state.bag[i]];
      }
    }
    return state.bag.pop();
  }

  // Puts a new piece at the top center of the board. Uses the next piece in line unless a type is
  // given. If there's no room for it, the game is over.
  function spawn(state, type) {
    if (type === undefined) {
      type = state.nextType;
      state.nextType = drawFromBag(state);
    }
    const shape = parseShape(PIECES[type].shape);
    const topRow = shape.findIndex((row) => row.some(Boolean));
    state.current = { type, shape, x: Math.floor((state.width - shape.length) / 2), y: -topRow };
    if (collides(state, shape, state.current.x, state.current.y)) state.over = true;
  }

  // Whether the shape would overlap a wall, the floor, or a block already on the board. Cells
  // above the top of the board are allowed, so pieces can rotate right after they appear.
  function collides(state, shape, x, y) {
    return cellsOf(shape, x, y).some(([cx, cy]) =>
      cx < 0 || cx >= state.width || cy >= state.height ||
      (cy >= 0 && state.board[cy][cx] !== null));
  }

  function canAct(state) {
    return !state.over && !state.paused;
  }

  function move(state, dx) {
    const piece = state.current;
    if (!canAct(state) || collides(state, piece.shape, piece.x + dx, piece.y)) return false;
    piece.x += dx;
    return true;
  }

  function rotate(state) {
    if (!canAct(state)) return false;
    const piece = state.current;
    const rotated = rotateClockwise(piece.shape);
    for (const [dx, dy] of KICKS) {
      if (!collides(state, rotated, piece.x + dx, piece.y + dy)) {
        piece.shape = rotated;
        piece.x += dx;
        piece.y += dy;
        return true;
      }
    }
    return false;
  }

  // Gravity: moves the piece down a row, or locks it in place if it can't fall any further.
  function tick(state) {
    if (!canAct(state)) return;
    const piece = state.current;
    if (collides(state, piece.shape, piece.x, piece.y + 1)) lock(state);
    else piece.y += 1;
  }

  // How many rows the piece can fall before it lands.
  function dropDistance(state) {
    const piece = state.current;
    let distance = 0;
    while (!collides(state, piece.shape, piece.x, piece.y + distance + 1)) distance++;
    return distance;
  }

  // Moves the piece down a row, for 1 point. A piece that has already landed locks at once.
  // Returns whether the piece moved.
  function softDrop(state) {
    if (!canAct(state)) return false;
    const piece = state.current;
    if (collides(state, piece.shape, piece.x, piece.y + 1)) {
      lock(state);
      return false;
    }
    piece.y += 1;
    state.score += 1;
    return true;
  }

  // Makes the current piece part of the board, clears any full rows, and brings in the next piece.
  function lock(state) {
    const piece = state.current;
    let aboveTop = false;
    for (const [x, y] of cellsOf(piece.shape, piece.x, piece.y)) {
      if (y < 0) aboveTop = true;
      else state.board[y][x] = PIECES[piece.type].color;
    }

    const before = state.board.map((row) => row.slice());
    const rows = clearFullRows(state.board);
    if (rows.length > 0) {
      const points = scoreForLines(rows.length, state.level);
      state.score += points;
      state.lines += rows.length;
      state.level = 1 + Math.floor(state.lines / LINES_PER_LEVEL);
      // A new object each time, so the UI can spot it. `before` is the board as it was with the
      // full rows still in place, and `rows` says which rows those were, so the UI can animate.
      state.lastClear = { lines: rows.length, points, rows, before };
    }

    // A piece that comes to rest sticking out of the top of the board ends the game.
    if (aboveTop) state.over = true;
    else spawn(state);
  }

  // Removes every full row, moving the rows above it down. Returns the indices of the rows that
  // were full, from top to bottom.
  function clearFullRows(board) {
    const width = board[0].length;
    const full = [];
    board.forEach((row, y) => {
      if (row.every((cell) => cell !== null)) full.push(y);
    });
    const kept = board.filter((_, y) => !full.includes(y));
    const fresh = Array.from({ length: full.length }, () => Array(width).fill(null));
    board.splice(0, board.length, ...fresh, ...kept);
    return full;
  }

  function scoreForLines(count, level) {
    return LINE_SCORES[Math.min(count, LINE_SCORES.length - 1)] * level;
  }

  // Milliseconds between gravity steps: one second at level 1, 20% faster each level after that.
  function gravityInterval(level) {
    return Math.max(60, Math.round(1000 * Math.pow(0.8, level - 1)));
  }

  function togglePause(state) {
    if (!state.over) state.paused = !state.paused;
  }

  // For tests: replaces the bottom of the board with rows like 'XXX....XXX' ('.' is empty).
  function setBoard(state, rows) {
    state.board = emptyBoard(state.width, state.height);
    const top = state.height - rows.length;
    rows.forEach((row, r) => [...row].forEach((ch, x) => {
      if (ch !== '.') state.board[top + r][x] = '#8a8fa8';
    }));
  }

  const Tetris = {
    BOARD_WIDTH, BOARD_HEIGHT, PIECES, LINE_SCORES, LINES_PER_LEVEL,
    parseShape, rotateClockwise, cellsOf, makeRng, createGame, spawn, collides, move, rotate,
    tick, dropDistance, softDrop, clearFullRows, scoreForLines, gravityInterval, togglePause,
    setBoard,
  };

  if (typeof module === 'object' && module.exports) module.exports = Tetris;
  else globalThis.Tetris = Tetris;
})();
