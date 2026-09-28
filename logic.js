// The rules of Gumdrop Swap. This file has no drawing or mouse code, so it runs both in the browser
// (where it defines window.Gumdrop for ui.js) and in Node (where the unit tests require() it).
//
// The board is board[row][col], row 0 at the top. Each square holds a color number from 0 to
// COLORS - 1, or null while it's empty.
(function () {
  'use strict';

  const SIZE = 8;
  const COLORS = 6;
  const POINTS_PER_GUMDROP = 10;
  // One letter per color, for writing boards out in tests: red, orange, yellow, green, blue, purple.
  const COLOR_LETTERS = 'ROYGBP';

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

  function randomColor(rng) {
    return Math.floor(rng() * COLORS);
  }

  function copyBoard(board) {
    return board.map((row) => row.slice());
  }

  // Turns ['ROYG...', ...] into a board ('.' is an empty square), and back again.
  function parseBoard(rows) {
    return rows.map((row) => [...row].map((ch) => (ch === '.' ? null : COLOR_LETTERS.indexOf(ch))));
  }

  function formatBoard(board) {
    return board.map((row) => row.map((color) => (color === null ? '.' : COLOR_LETTERS[color])).join(''));
  }

  function inBounds([row, col]) {
    return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
  }

  function isAdjacent([r1, c1], [r2, c2]) {
    return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
  }

  // Every line of 3 or more same-colored gumdrops in a row or column, as lists of [row, col].
  // A gumdrop can be in two runs at once, one across and one down, when they form an L or T.
  function findRuns(board) {
    const runs = [];
    // cellAt(line, i) is the [row, col] of the i-th square along a row or column.
    const scan = (cellAt) => {
      for (let line = 0; line < SIZE; line++) {
        const colorAt = (i) => {
          const [row, col] = cellAt(line, i);
          return board[row][col];
        };
        let start = 0; // where the current stretch of one color began
        for (let i = 1; i <= SIZE; i++) {
          if (i < SIZE && colorAt(i) === colorAt(start)) continue;
          if (colorAt(start) !== null && i - start >= 3) {
            runs.push(Array.from({ length: i - start }, (_, k) => cellAt(line, start + k)));
          }
          start = i;
        }
      }
    };
    scan((row, col) => [row, col]); // across each row
    scan((col, row) => [row, col]); // down each column
    return runs;
  }

  // The gumdrops that are part of any run, each listed once.
  function matchedCells(runs) {
    const seen = new Map();
    for (const run of runs) for (const cell of run) seen.set(cell.join(','), cell);
    return [...seen.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }

  function swapped(board, [r1, c1], [r2, c2]) {
    const next = copyBoard(board);
    [next[r1][c1], next[r2][c2]] = [next[r2][c2], next[r1][c1]];
    return next;
  }

  // A swap is allowed if the two gumdrops are side by side and swapping them makes a match.
  function canSwap(board, a, b) {
    return inBounds(a) && inBounds(b) && isAdjacent(a, b) && findRuns(swapped(board, a, b)).length > 0;
  }

  // Every allowed swap on the board, as [a, b] pairs.
  function findMoves(board) {
    const moves = [];
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        for (const other of [[row, col + 1], [row + 1, col]]) {
          if (canSwap(board, [row, col], other)) moves.push([[row, col], other]);
        }
      }
    }
    return moves;
  }

  function hasMoves(board) {
    return findMoves(board).length > 0;
  }

  // A random board with no matches already on it and at least one allowed swap.
  function createBoard(rng) {
    for (;;) {
      const board = [];
      for (let row = 0; row < SIZE; row++) {
        board.push([]);
        for (let col = 0; col < SIZE; col++) {
          // Rule out any color that would finish a line of three to the left or above.
          const banned = new Set();
          if (col >= 2 && board[row][col - 1] === board[row][col - 2]) banned.add(board[row][col - 1]);
          if (row >= 2 && board[row - 1][col] === board[row - 2][col]) banned.add(board[row - 1][col]);
          const choices = [...Array(COLORS).keys()].filter((color) => !banned.has(color));
          board[row].push(choices[Math.floor(rng() * choices.length)]);
        }
      }
      if (hasMoves(board)) return board;
    }
  }

  function createGame(seed = Math.floor(Math.random() * 2 ** 32)) {
    const rng = makeRng(seed);
    return {
      board: createBoard(rng),
      score: 0,
      chain: 0, // how many times in a row the current move has made matches
      rng,
    };
  }

  // Swaps two gumdrops if that's allowed. Returns whether it was.
  function swap(state, a, b) {
    if (!canSwap(state.board, a, b)) return false;
    state.board = swapped(state.board, a, b);
    state.chain = 0;
    return true;
  }

  // Lets every gumdrop fall as far as it can, leaving the empty squares at the tops of the columns.
  // Returns the new board and a list of the gumdrops that moved: { from: [row, col], to: [row, col] }.
  function applyGravity(board) {
    const next = board.map((row) => row.map(() => null));
    const falls = [];
    for (let col = 0; col < SIZE; col++) {
      let target = SIZE - 1;
      for (let row = SIZE - 1; row >= 0; row--) {
        if (board[row][col] === null) continue;
        next[target][col] = board[row][col];
        if (target !== row) falls.push({ from: [row, col], to: [target, col] });
        target--;
      }
    }
    return { board: next, falls };
  }

  function emptyCells(board) {
    const cells = [];
    board.forEach((row, r) => row.forEach((color, c) => {
      if (color === null) cells.push([r, c]);
    }));
    return cells;
  }

  // Picks a color for each new gumdrop that drops in to fill the empty squares. Here the colors
  // are simply random.
  function chooseRefillColors(board, cells, rng) {
    return cells.map(() => randomColor(rng));
  }

  function pointsFor(count, chain) {
    return POINTS_PER_GUMDROP * count * chain;
  }

  // One link of a chain reaction: clear every match on the board, score it, let the gumdrops above
  // fall, and drop in new ones. Returns null if there's nothing to match. Otherwise it returns what
  // happened, so the screen can animate it:
  //   before: the board with the matches still on it   matched: the [row, col] of each one cleared
  //   falls: gumdrops that fell (see applyGravity)      added: [{ cell, color }] for each new one
  //   after: the board once it's full again             points, chain: what this link scored
  function cascadeStep(state) {
    const runs = findRuns(state.board);
    if (runs.length === 0) return null;

    const before = state.board;
    const matched = matchedCells(runs);
    state.chain += 1;
    const points = pointsFor(matched.length, state.chain);
    state.score += points;

    const cleared = copyBoard(before);
    for (const [row, col] of matched) cleared[row][col] = null;
    const { board: fallen, falls } = applyGravity(cleared);
    const empty = emptyCells(fallen);
    const colors = chooseRefillColors(fallen, empty, state.rng);
    const after = copyBoard(fallen);
    empty.forEach(([row, col], i) => { after[row][col] = colors[i]; });
    state.board = after;

    return {
      before, runs, matched, falls, after, points, chain: state.chain,
      added: empty.map((cell, i) => ({ cell, color: colors[i] })),
    };
  }

  // Rearranges the gumdrops already on the board so there's at least one allowed swap and no
  // matches waiting to happen. Used when the player has no moves left.
  function reshuffle(state) {
    const colors = state.board.flat();
    for (let attempt = 0; attempt < 1000; attempt++) {
      for (let i = colors.length - 1; i > 0; i--) {
        const j = Math.floor(state.rng() * (i + 1));
        [colors[i], colors[j]] = [colors[j], colors[i]];
      }
      const board = Array.from({ length: SIZE }, (_, row) => colors.slice(row * SIZE, (row + 1) * SIZE));
      if (findRuns(board).length === 0 && hasMoves(board)) {
        state.board = board;
        return;
      }
    }
    state.board = createBoard(state.rng); // almost impossible to need, but always works
  }

  const Gumdrop = {
    SIZE, COLORS, POINTS_PER_GUMDROP, COLOR_LETTERS,
    makeRng, parseBoard, formatBoard, inBounds, isAdjacent, findRuns, matchedCells, canSwap,
    findMoves, hasMoves, createBoard, createGame, swap, applyGravity, emptyCells,
    chooseRefillColors, pointsFor, cascadeStep, reshuffle,
  };

  if (typeof module === 'object' && module.exports) module.exports = Gumdrop;
  else globalThis.Gumdrop = Gumdrop;
})();
