// Unit tests for the game rules in logic.js. These run in Node, without a browser.
const { test, expect } = require('@playwright/test');
const Gumdrop = require('../../logic.js');

// Colors are written as letters: R(ed) O(range) Y(ellow) G(reen) B(lue) P(urple).
// This board repeats a six-color pattern, so it has no matches and no swap that would make one.
const NO_MOVES = [
  'ROYGBPRO',
  'YGBPROYG',
  'BPROYGBP',
  'ROYGBPRO',
  'YGBPROYG',
  'BPROYGBP',
  'ROYGBPRO',
  'YGBPROYG',
];
// A line of three oranges along the bottom. Once they clear, the columns above them drop by one,
// which lines up three purples in row 6: a second link in the chain.
const WITH_MATCH = [...NO_MOVES.slice(0, 5), 'BPPOYGBP', 'ROYPBPRO', 'OOOPROYG'];
// Swapping (6, 2) with (7, 2) turns this into WITH_MATCH.
const ONE_SWAP_AWAY = [...NO_MOVES.slice(0, 5), 'BPPOYGBP', 'ROOPBPRO', 'OOYPROYG'];

const board = (rows) => Gumdrop.parseBoard(rows);

function gameWith(rows, seed = 1) {
  const state = Gumdrop.createGame(seed);
  state.board = board(rows);
  return state;
}

// The board written as rows of letters, with some squares changed: changes maps "row,col" to a letter.
function edited(rows, changes) {
  return rows.map((row, r) =>
    [...row].map((ch, c) => changes[`${r},${c}`] ?? ch).join(''));
}

function colorCounts(b) {
  const counts = Array(Gumdrop.COLORS).fill(0);
  for (const color of b.flat()) counts[color]++;
  return counts;
}

test.describe('boards', () => {
  test('can be written as letters and read back', () => {
    expect(Gumdrop.formatBoard(board(WITH_MATCH))).toEqual(WITH_MATCH);
    expect(Gumdrop.parseBoard(['RO.P'])).toEqual([[0, 1, null, 5]]);
  });

  test('the test boards are what they claim to be', () => {
    expect(Gumdrop.findRuns(board(NO_MOVES))).toEqual([]);
    expect(Gumdrop.findMoves(board(NO_MOVES))).toEqual([]);
    expect(Gumdrop.findRuns(board(ONE_SWAP_AWAY))).toEqual([]);
    expect(Gumdrop.findRuns(board(WITH_MATCH))).toHaveLength(1);
  });

  test('a new game starts 8 by 8, with no matches and at least one move', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { board: b, score } = Gumdrop.createGame(seed);
      expect(b).toHaveLength(8);
      for (const row of b) {
        expect(row).toHaveLength(8);
        for (const color of row) expect(color >= 0 && color < Gumdrop.COLORS).toBe(true);
      }
      expect(Gumdrop.findRuns(b)).toEqual([]);
      expect(Gumdrop.hasMoves(b)).toBe(true);
      expect(score).toBe(0);
    }
  });

  test('uses all six colors, and each game is different', () => {
    const b = Gumdrop.createGame(1).board;
    expect(colorCounts(b).every((count) => count > 0)).toBe(true);
    expect(Gumdrop.createGame(2).board).not.toEqual(b);
    expect(Gumdrop.createGame(1).board).toEqual(b); // the same seed gives the same game
  });
});

test.describe('finding matches', () => {
  test('finds a line of three across a row', () => {
    expect(Gumdrop.findRuns(board(WITH_MATCH))).toEqual([[[7, 0], [7, 1], [7, 2]]]);
  });

  test('finds lines down a column, and lines longer than three', () => {
    const rows = edited(NO_MOVES, { '0,0': 'G', '1,0': 'G', '2,0': 'G', '3,0': 'G' });
    expect(Gumdrop.findRuns(board(rows))).toEqual([[[0, 0], [1, 0], [2, 0], [3, 0]]]);
  });

  test('an L shape is two lines, but its corner gumdrop only counts once', () => {
    const rows = edited(NO_MOVES, { '5,0': 'O', '6,0': 'O', '7,0': 'O', '7,1': 'O', '7,2': 'O' });
    const runs = Gumdrop.findRuns(board(rows));
    expect(runs).toHaveLength(2);
    expect(Gumdrop.matchedCells(runs)).toEqual([[5, 0], [6, 0], [7, 0], [7, 1], [7, 2]]);
  });

  test('ignores empty squares', () => {
    const rows = edited(NO_MOVES, { '0,0': '.', '0,1': '.', '0,2': '.' });
    expect(Gumdrop.findRuns(board(rows))).toEqual([]);
  });
});

test.describe('swapping', () => {
  test('is only allowed between side-by-side gumdrops', () => {
    const b = board(ONE_SWAP_AWAY);
    expect(Gumdrop.canSwap(b, [6, 2], [7, 2])).toBe(true);
    expect(Gumdrop.canSwap(b, [7, 2], [6, 2])).toBe(true);
    expect(Gumdrop.canSwap(b, [6, 2], [7, 3])).toBe(false); // diagonal
    expect(Gumdrop.canSwap(b, [5, 2], [7, 2])).toBe(false); // two apart
    expect(Gumdrop.canSwap(b, [7, 2], [8, 2])).toBe(false); // off the board
  });

  test('is only allowed if it makes a match', () => {
    expect(Gumdrop.canSwap(board(ONE_SWAP_AWAY), [0, 0], [0, 1])).toBe(false);
  });

  test('swaps an allowed pair and starts a new chain', () => {
    const state = gameWith(ONE_SWAP_AWAY);
    state.chain = 3;
    expect(Gumdrop.swap(state, [6, 2], [7, 2])).toBe(true);
    expect(Gumdrop.formatBoard(state.board)).toEqual(WITH_MATCH);
    expect(state.chain).toBe(0);
  });

  test('leaves the board alone for a pair that is not allowed', () => {
    const state = gameWith(ONE_SWAP_AWAY);
    expect(Gumdrop.swap(state, [0, 0], [0, 1])).toBe(false);
    expect(Gumdrop.formatBoard(state.board)).toEqual(ONE_SWAP_AWAY);
  });

  test('lists every allowed move', () => {
    expect(Gumdrop.findMoves(board(NO_MOVES))).toEqual([]);
    const moves = Gumdrop.findMoves(board(ONE_SWAP_AWAY));
    expect(moves).toContainEqual([[6, 2], [7, 2]]);
    for (const [a, b] of moves) expect(Gumdrop.canSwap(board(ONE_SWAP_AWAY), a, b)).toBe(true);
    expect(Gumdrop.hasMoves(board(ONE_SWAP_AWAY))).toBe(true);
  });
});

test.describe('gravity', () => {
  test('drops gumdrops into the empty squares below them, leaving the gaps at the top', () => {
    const holes = board(edited(NO_MOVES, { '7,0': '.', '7,1': '.', '5,1': '.' }));
    const { board: after, falls } = Gumdrop.applyGravity(holes);
    expect(Gumdrop.formatBoard(after)).toEqual([
      '..YGBPRO',
      'R.BPROYG',
      'YOROYGBP',
      'BGYGBPRO',
      'RPBPROYG',
      'YOROYGBP',
      'BGYGBPRO',
      'ROBPROYG',
    ]);
    expect(falls).toHaveLength(13);
    expect(falls).toContainEqual({ from: [6, 1], to: [7, 1] });
    expect(falls).toContainEqual({ from: [0, 1], to: [2, 1] });
    expect(Gumdrop.emptyCells(after)).toEqual([[0, 0], [0, 1], [1, 1]]);
  });
});

test.describe('refilling', () => {
  test('picks one ordinary color for each empty square', () => {
    const colors = Gumdrop.chooseRefillColors(null, [[0, 0], [0, 1], [1, 1]], Gumdrop.makeRng(5));
    expect(colors).toHaveLength(3);
    for (const color of colors) expect(Number.isInteger(color) && color >= 0 && color < 6).toBe(true);
  });

  test('picks the colors at random', () => {
    const rng = Gumdrop.makeRng(9);
    const colors = Gumdrop.chooseRefillColors(null, Array(600).fill([0, 0]), rng);
    for (const count of colorCounts([colors])) expect(count).toBeGreaterThan(60);
  });
});

test.describe('chain reactions', () => {
  test('do nothing when nothing matches', () => {
    const state = gameWith(ONE_SWAP_AWAY);
    expect(Gumdrop.cascadeStep(state)).toBeNull();
    expect([state.score, state.chain]).toEqual([0, 0]);
  });

  test('clear a match, score it, and drop new gumdrops in at the top', () => {
    const state = gameWith(WITH_MATCH);
    const step = Gumdrop.cascadeStep(state);
    expect(step.matched).toEqual([[7, 0], [7, 1], [7, 2]]);
    expect([step.points, step.chain, state.score]).toEqual([30, 1, 30]);
    expect(Gumdrop.formatBoard(step.before)).toEqual(WITH_MATCH);
    expect(step.added.map(({ cell }) => cell)).toEqual([[0, 0], [0, 1], [0, 2]]);
    expect(state.board).toBe(step.after);

    // Columns 0 to 2 each dropped by one; everything else stayed put.
    const after = Gumdrop.formatBoard(step.after);
    for (let row = 1; row < 8; row++) {
      expect(after[row].slice(0, 3)).toBe(WITH_MATCH[row - 1].slice(0, 3));
      expect(after[row].slice(3)).toBe(WITH_MATCH[row].slice(3));
    }
    expect(step.after.flat()).not.toContain(null);
    for (const { from, to } of step.falls) {
      expect(to[1]).toBe(from[1]);
      expect(to[0]).toBeGreaterThan(from[0]);
    }
  });

  test('score double on the second link, when falling gumdrops line up', () => {
    const state = gameWith(WITH_MATCH);
    Gumdrop.cascadeStep(state);
    const second = Gumdrop.cascadeStep(state);
    expect(second.chain).toBe(2);
    expect(second.matched).toEqual(expect.arrayContaining([[6, 1], [6, 2], [6, 3]]));
    expect(second.points).toBe(10 * second.matched.length * 2);
  });

  test('keep going until nothing matches, adding up the points', () => {
    const state = gameWith(WITH_MATCH, 7);
    let total = 0;
    let links = 0;
    for (let step; (step = Gumdrop.cascadeStep(state)); links++) {
      total += step.points;
      expect(links).toBeLessThan(50);
    }
    expect(links).toBeGreaterThanOrEqual(2);
    expect(state.score).toBe(total);
    expect(state.chain).toBe(links);
    expect(Gumdrop.findRuns(state.board)).toEqual([]);
  });
});

test.describe('scoring', () => {
  test('is 10 points a gumdrop, times the link of the chain', () => {
    expect(Gumdrop.pointsFor(3, 1)).toBe(30);
    expect(Gumdrop.pointsFor(4, 1)).toBe(40);
    expect(Gumdrop.pointsFor(3, 2)).toBe(60);
    expect(Gumdrop.pointsFor(5, 3)).toBe(150);
  });
});

test.describe('shuffling', () => {
  test('rearranges the same gumdrops so there is a move but no ready-made match', () => {
    const state = gameWith(NO_MOVES);
    const before = colorCounts(state.board);
    Gumdrop.reshuffle(state);
    expect(colorCounts(state.board)).toEqual(before);
    expect(Gumdrop.findRuns(state.board)).toEqual([]);
    expect(Gumdrop.hasMoves(state.board)).toBe(true);
  });
});
