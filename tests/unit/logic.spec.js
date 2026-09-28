// Unit tests for the puzzle rules in logic.js. These run in Node, without a browser.
const { test, expect } = require('@playwright/test');
const Jigsaw = require('../../logic.js');

const ALL_PIECES = [...Array(16).keys()];
const board = (index) => ({ area: 'board', index });
const tray = (index) => ({ area: 'tray', index });

test.describe('a new puzzle', () => {
  test('has an empty board and all 16 pieces in the tray', () => {
    const puzzle = Jigsaw.createPuzzle(Jigsaw.makeRng(1));
    expect(puzzle.board).toEqual(Array(16).fill(null));
    expect(puzzle.tray.slice().sort((a, b) => a - b)).toEqual(ALL_PIECES);
  });

  test('shuffles the pieces, differently each time', () => {
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

test.describe('moving a piece', () => {
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
    expect(puzzle.board[9]).toBeNull();
    expect(puzzle).toEqual(start());
  });

  test('onto a square that has a piece makes them trade places', () => {
    let puzzle = Jigsaw.movePiece(start(), tray(1), board(3));
    puzzle = Jigsaw.movePiece(puzzle, tray(2), board(3));
    expect(puzzle.board[3]).toBe(2);
    expect(puzzle.tray[2]).toBe(1);
  });

  test('onto the square it came from changes nothing', () => {
    expect(Jigsaw.movePiece(start(), tray(4), tray(4))).toEqual(start());
  });

  test('from an empty square does nothing', () => {
    const puzzle = Jigsaw.movePiece(start(), tray(7), board(7));
    expect(Jigsaw.movePiece(puzzle, tray(7), board(0))).toEqual(puzzle);
  });

  test('never loses or copies a piece', () => {
    const rng = Jigsaw.makeRng(4);
    let puzzle = Jigsaw.createPuzzle(rng);
    for (let i = 0; i < 500; i++) {
      const pick = () => ({ area: rng() < 0.5 ? 'board' : 'tray', index: Math.floor(rng() * 16) });
      puzzle = Jigsaw.movePiece(puzzle, pick(), pick());
      const pieces = [...puzzle.board, ...puzzle.tray].filter((piece) => piece !== null);
      expect(pieces.sort((a, b) => a - b)).toEqual(ALL_PIECES);
    }
  });

  test('leaves the original puzzle alone', () => {
    const puzzle = start();
    Jigsaw.movePiece(puzzle, tray(0), board(0));
    expect(puzzle).toEqual(start());
  });
});

test.describe('solving', () => {
  test('happens when every piece is on its own square of the board', () => {
    expect(Jigsaw.isSolved({ board: ALL_PIECES, tray: Array(16).fill(null) })).toBe(true);
  });

  test('needs every piece: 15 of 16 is not enough', () => {
    const board15 = ALL_PIECES.map((piece) => (piece === 9 ? null : piece));
    expect(Jigsaw.isSolved({ board: board15, tray: [9, ...Array(15).fill(null)] })).toBe(false);
  });

  test('needs every piece in the right place', () => {
    const swapped = ALL_PIECES.slice();
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    expect(Jigsaw.isSolved({ board: swapped, tray: Array(16).fill(null) })).toBe(false);
  });

  test('lets pieces that look alike go in each other\'s squares', () => {
    const rotated = ALL_PIECES.slice();
    [rotated[2], rotated[7], rotated[14]] = [7, 14, 2];
    const puzzle = { board: rotated, tray: Array(16).fill(null) };
    expect(Jigsaw.isSolved(puzzle, [[2, 7, 14]])).toBe(true);
    expect(Jigsaw.isSolved(puzzle)).toBe(false); // unless they're said to look alike
  });

  test('still needs a look-alike to be in one of its own group\'s squares', () => {
    const swapped = ALL_PIECES.slice();
    [swapped[2], swapped[3]] = [3, 2]; // 3 isn't one of the look-alikes
    expect(Jigsaw.isSolved({ board: swapped, tray: Array(16).fill(null) }, [[2, 7, 14]])).toBe(false);
    const board15 = ALL_PIECES.map((piece) => (piece === 7 ? null : piece));
    expect(Jigsaw.isSolved({ board: board15, tray: [7, ...Array(15).fill(null)] }, [[2, 7, 14]])).toBe(false);
  });

  test('piece n shows row n / 4, column n % 4 of the picture', () => {
    expect([Jigsaw.pieceRow(0), Jigsaw.pieceCol(0)]).toEqual([0, 0]);
    expect([Jigsaw.pieceRow(6), Jigsaw.pieceCol(6)]).toEqual([1, 2]);
    expect([Jigsaw.pieceRow(15), Jigsaw.pieceCol(15)]).toEqual([3, 3]);
  });
});

test.describe('the order of the pictures', () => {
  test('goes through all of them before repeating any', () => {
    const rng = Jigsaw.makeRng(5);
    let playlist = Jigsaw.createPlaylist(5, rng);
    for (let round = 0; round < 10; round++) {
      const seen = [];
      for (let i = 0; i < 5; i++) {
        seen.push(Jigsaw.currentPicture(playlist));
        playlist = Jigsaw.nextPicture(playlist, rng);
      }
      expect(seen.sort()).toEqual([0, 1, 2, 3, 4]);
    }
  });

  test('never shows the same picture twice in a row, even between rounds', () => {
    const rng = Jigsaw.makeRng(6);
    let playlist = Jigsaw.createPlaylist(5, rng);
    for (let i = 0; i < 200; i++) {
      const before = Jigsaw.currentPicture(playlist);
      playlist = Jigsaw.nextPicture(playlist, rng);
      expect(Jigsaw.currentPicture(playlist)).not.toBe(before);
    }
  });

  test('is shuffled differently from one visit to the next', () => {
    const orders = new Set();
    for (let seed = 1; seed <= 10; seed++) orders.add(Jigsaw.createPlaylist(5, Jigsaw.makeRng(seed)).order.join());
    expect(orders.size).toBeGreaterThan(5);
  });

  test('works with just one picture', () => {
    const rng = Jigsaw.makeRng(7);
    let playlist = Jigsaw.createPlaylist(1, rng);
    for (let i = 0; i < 3; i++) {
      expect(Jigsaw.currentPicture(playlist)).toBe(0);
      playlist = Jigsaw.nextPicture(playlist, rng);
    }
  });
});
