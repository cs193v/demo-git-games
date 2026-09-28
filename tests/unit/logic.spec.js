// Unit tests for the puzzle rules in logic.js. These run in Node, without a browser.
const { test, expect } = require('@playwright/test');
const Jigsaw = require('../../logic.js');
const { countLayouts, fitInOrder } = require('../helpers/tetravex.js');

const ALL_PIECES = [...Array(16).keys()];
const board = (index) => ({ area: 'board', index });
const tray = (index) => ({ area: 'tray', index });
const sameTile = (digit) => ({ top: digit, right: digit, bottom: digit, left: digit });

test.describe('a new puzzle', () => {
  test('has an empty board and all 16 tiles in the tray', () => {
    const puzzle = Jigsaw.createPuzzle(Jigsaw.makeRng(1));
    expect(puzzle.board).toEqual(Array(16).fill(null));
    expect(puzzle.tray.slice().sort((a, b) => a - b)).toEqual(ALL_PIECES);
  });

  test('shuffles the tiles, differently each time', () => {
    const rng = Jigsaw.makeRng(2);
    const first = Jigsaw.createPuzzle(rng).tray;
    const second = Jigsaw.createPuzzle(rng).tray;
    expect(first).not.toEqual(ALL_PIECES);
    expect(second).not.toEqual(first);
  });

  test('is not solved', () => {
    expect(Jigsaw.isSolved(Jigsaw.createPuzzle(Jigsaw.makeRng(3)))).toBe(false);
  });
});

test.describe('moving a tile', () => {
  const start = () => ({ board: Array(16).fill(null), tray: ALL_PIECES.slice() });

  test('from the tray to an empty square on the board', () => {
    const after = Jigsaw.movePiece(start(), tray(5), board(0));
    expect(after.board[0]).toBe(5);
    expect(after.tray[5]).toBeNull();
  });

  test('from the board back to the tray, or to another square on the board', () => {
    let puzzle = Jigsaw.movePiece(start(), tray(5), board(0));
    puzzle = Jigsaw.movePiece(puzzle, board(0), board(9));
    expect(puzzle.board[9]).toBe(5);
    expect(puzzle.board[0]).toBeNull();
    puzzle = Jigsaw.movePiece(puzzle, board(9), tray(5)); // back to its empty square in the tray
    expect(puzzle).toEqual(start());
  });

  test('onto a square that has a tile makes them trade places', () => {
    let puzzle = Jigsaw.movePiece(start(), tray(1), board(3));
    puzzle = Jigsaw.movePiece(puzzle, tray(2), board(3));
    expect(puzzle.board[3]).toBe(2);
    expect(puzzle.tray[2]).toBe(1);
  });

  test('never loses or copies a tile', () => {
    const rng = Jigsaw.makeRng(4);
    let puzzle = Jigsaw.createPuzzle(rng);
    for (let i = 0; i < 500; i++) {
      const pick = () => ({ area: rng() < 0.5 ? 'board' : 'tray', index: Math.floor(rng() * 16) });
      puzzle = Jigsaw.movePiece(puzzle, pick(), pick());
      const pieces = [...puzzle.board, ...puzzle.tray].filter((piece) => piece !== null);
      expect(pieces.sort((a, b) => a - b)).toEqual(ALL_PIECES);
    }
  });
});

test.describe('solving', () => {
  test('happens when every tile is on its own square of the board', () => {
    expect(Jigsaw.isSolved({ board: ALL_PIECES, tray: Array(16).fill(null) })).toBe(true);
  });

  test('needs every tile: 15 of 16 is not enough', () => {
    const board15 = ALL_PIECES.map((piece) => (piece === 9 ? null : piece));
    expect(Jigsaw.isSolved({ board: board15, tray: [9, ...Array(15).fill(null)] })).toBe(false);
  });

  test('needs every tile in the right place', () => {
    const swapped = ALL_PIECES.slice();
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    expect(Jigsaw.isSolved({ board: swapped, tray: Array(16).fill(null) })).toBe(false);
  });
});

test.describe('tiles', () => {
  test('are 16 tiles, each with a digit from 0 to 9 on every side', () => {
    const tiles = Jigsaw.makeTiles(Jigsaw.makeRng(1));
    expect(tiles).toHaveLength(16);
    for (const tile of tiles) {
      expect(Object.keys(tile).sort()).toEqual(['bottom', 'left', 'right', 'top']);
      for (const digit of Object.values(tile)) expect(Number.isInteger(digit) && digit >= 0 && digit <= 9).toBe(true);
    }
  });

  test('fit together in the order they were made', () => {
    for (let seed = 1; seed <= 20; seed++) expect(fitInOrder(Jigsaw.makeTiles(Jigsaw.makeRng(seed)))).toBe(true);
  });

  test('use all ten digits, and are different every game', () => {
    const tiles = Jigsaw.makeTiles(Jigsaw.makeRng(1));
    const digits = new Set(tiles.flatMap((tile) => Object.values(tile)));
    expect(digits.size).toBeGreaterThanOrEqual(8);
    expect(Jigsaw.makeTiles(Jigsaw.makeRng(2))).not.toEqual(tiles);
  });
});

test.describe('counting solutions', () => {
  test('finds the layout the tiles were made in', () => {
    expect(Jigsaw.countSolutions(Jigsaw.makeTiles(Jigsaw.makeRng(5)), 100)).toBeGreaterThanOrEqual(1);
  });

  test('counts tiles that look the same as different, and stops at the limit', () => {
    const zeros = Array.from({ length: 16 }, () => sameTile(0)); // any layout works
    expect(Jigsaw.countSolutions(zeros)).toBe(2);
    expect(Jigsaw.countSolutions(zeros, 7)).toBe(7);
  });

  test('finds nothing when the tiles can\'t all fit', () => {
    const tiles = Jigsaw.makeTiles(Jigsaw.makeRng(8));
    tiles[5].top = (tiles[5].top + 1) % 10; // no longer matches the tile above it
    expect(Jigsaw.countSolutions(tiles)).toBe(0);
    expect(countLayouts(tiles)).toBe(0);
  });

  test('agrees with a separate solver', () => {
    const rng = Jigsaw.makeRng(6);
    for (let i = 0; i < 30; i++) {
      // Few digits make many solutions, which gives the solvers something to disagree about.
      const tiles = Jigsaw.makeTiles(() => rng() * 0.3);
      expect(Math.min(Jigsaw.countSolutions(tiles, 3), 3)).toBe(countLayouts(tiles, 3));
    }
  });
});

test.describe('a TetraVex puzzle', () => {
  test('always has exactly one solution: the order the tiles were made in', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const tiles = Jigsaw.createTetravex(Jigsaw.makeRng(seed));
      expect(fitInOrder(tiles), `seed ${seed}`).toBe(true);
      expect(Jigsaw.countSolutions(tiles, 5), `seed ${seed}`).toBe(1);
      expect(countLayouts(tiles, 5), `seed ${seed}`).toBe(1);
    }
  });

  test('never has two tiles exactly alike', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const tiles = Jigsaw.createTetravex(Jigsaw.makeRng(seed)).map((tile) => JSON.stringify(tile));
      expect(new Set(tiles).size).toBe(16);
    }
  });
});
