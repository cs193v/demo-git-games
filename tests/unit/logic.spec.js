// Unit tests for the game rules in logic.js. These run in Node, without a browser.
const { test, expect } = require('@playwright/test');
const Tetris = require('../../logic.js');
const { canonicalKey, oneSidedPolyominoes } = require('../helpers/polyominoes.js');

const pieceIndex = (name) => Tetris.PIECES.findIndex((piece) => piece.name === name);
const cellsOfPiece = (piece) => Tetris.cellsOf(Tetris.parseShape(piece.shape), 0, 0);
const currentCells = (state) =>
  Tetris.cellsOf(state.current.shape, state.current.x, state.current.y);
const filledCount = (state) => state.board.flat().filter((cell) => cell !== null).length;

// Moves the piece down until it lands and locks, like pressing Down over and over. Returns how
// many rows it moved.
function dropAndLock(state) {
  let rows = 0;
  while (Tetris.softDrop(state)) rows++;
  return rows;
}

// A game whose falling piece is the given type, sitting where it spawns.
function gameWith(name, seed = 1) {
  const state = Tetris.createGame(seed);
  Tetris.spawn(state, pieceIndex(name));
  return state;
}

test.describe('the pieces', () => {
  test('are exactly the 7 tetrominoes', () => {
    const actual = Tetris.PIECES.map((piece) => canonicalKey(cellsOfPiece(piece))).sort();
    expect(actual).toEqual(oneSidedPolyominoes(4));
    expect(actual).toHaveLength(7);
  });

  test('each have their own name and color', () => {
    expect(new Set(Tetris.PIECES.map((piece) => piece.name)).size).toBe(Tetris.PIECES.length);
    expect(new Set(Tetris.PIECES.map((piece) => piece.color)).size).toBe(Tetris.PIECES.length);
  });

  test('are drawn in square boxes, so they rotate about their centers', () => {
    for (const piece of Tetris.PIECES) {
      for (const row of piece.shape) expect(row).toHaveLength(piece.shape.length);
    }
  });
});

test.describe('rotation', () => {
  test('turns a shape a quarter turn clockwise', () => {
    const t = Tetris.parseShape(['.X.', 'XXX', '...']);
    expect(Tetris.rotateClockwise(t)).toEqual(Tetris.parseShape(['.X.', '.XX', '.X.']));
  });

  test('four quarter turns bring every piece back to where it started', () => {
    for (const piece of Tetris.PIECES) {
      const start = Tetris.parseShape(piece.shape);
      let shape = start;
      for (let i = 0; i < 4; i++) shape = Tetris.rotateClockwise(shape);
      expect(shape).toEqual(start);
    }
  });

  test('rotates the falling piece when there is room', () => {
    const state = gameWith('T');
    expect(Tetris.rotate(state)).toBe(true);
    expect(state.current.shape).toEqual(Tetris.parseShape(['.X.', '.XX', '.X.']));
  });

  test('kicks a piece away from the wall when rotating against it', () => {
    const state = gameWith('I');
    Tetris.rotate(state); // now vertical
    while (Tetris.move(state, -1));
    expect(Math.min(...currentCells(state).map(([x]) => x))).toBe(0);

    expect(Tetris.rotate(state)).toBe(true); // back to flat, which needs a nudge right
    const xs = currentCells(state).map(([x]) => x);
    expect(Math.min(...xs)).toBe(0);
    expect(new Set(currentCells(state).map(([, y]) => y)).size).toBe(1);
  });

  test('leaves the piece alone when it cannot rotate at all', () => {
    const state = Tetris.createGame(1);
    Tetris.setBoard(state, Array(8).fill('.XXXXXXXXX'));
    const vertical = Tetris.rotateClockwise(Tetris.parseShape(Tetris.PIECES[pieceIndex('I')].shape));
    state.current = { type: pieceIndex('I'), shape: vertical, x: -2, y: 16 }; // in the 1-wide well
    const before = JSON.stringify(state.current);
    expect(Tetris.rotate(state)).toBe(false);
    expect(JSON.stringify(state.current)).toBe(before);
  });
});

test.describe('a new game', () => {
  test('starts with an empty board, no score, and a piece at the top center', () => {
    const state = Tetris.createGame(7);
    expect(filledCount(state)).toBe(0);
    expect([state.score, state.lines, state.level]).toEqual([0, 0, 1]);
    const cells = currentCells(state);
    expect(Math.min(...cells.map(([, y]) => y))).toBe(0);
    const xs = cells.map(([x]) => x);
    const middle = (Math.min(...xs) + Math.max(...xs) + 1) / 2;
    expect(Math.abs(middle - Tetris.BOARD_WIDTH / 2)).toBeLessThanOrEqual(1);
  });

  test('deals every piece once before repeating any of them', () => {
    const state = Tetris.createGame(123);
    for (let round = 0; round < 3; round++) {
      const dealt = [];
      for (let i = 0; i < Tetris.PIECES.length; i++) {
        dealt.push(state.current.type);
        Tetris.spawn(state);
      }
      expect(dealt.sort((a, b) => a - b)).toEqual(Tetris.PIECES.map((_, i) => i));
    }
  });

  test('deals the same pieces for the same seed', () => {
    const deal = (seed) => {
      const state = Tetris.createGame(seed);
      const types = [];
      for (let i = 0; i < 20; i++) {
        types.push(state.current.type);
        Tetris.spawn(state);
      }
      return types;
    };
    expect(deal(99)).toEqual(deal(99));
    expect(deal(99)).not.toEqual(deal(100));
  });

  test('shows the next piece before it arrives', () => {
    const state = Tetris.createGame(5);
    const next = state.nextType;
    dropAndLock(state);
    expect(state.current.type).toBe(next);
  });
});

test.describe('moving', () => {
  test('stops at the walls', () => {
    const state = gameWith('O'); // columns 4 and 5
    let moves = 0;
    while (Tetris.move(state, -1)) moves++;
    expect(moves).toBe(4);
    moves = 0;
    while (Tetris.move(state, 1)) moves++;
    expect(moves).toBe(Tetris.BOARD_WIDTH - 2);
  });

  test('stops at blocks already on the board', () => {
    const state = gameWith('O');
    Tetris.setBoard(state, Array(20).fill('X.........'));
    let moves = 0;
    while (Tetris.move(state, -1)) moves++;
    expect(moves).toBe(3);
  });
});

test.describe('falling', () => {
  test('gravity moves the piece down one row at a time', () => {
    const state = gameWith('T');
    const y = state.current.y;
    Tetris.tick(state);
    Tetris.tick(state);
    expect(state.current.y).toBe(y + 2);
  });

  test('a piece that has landed locks in place and the next one appears', () => {
    const state = gameWith('O');
    for (let i = 0; i < Tetris.BOARD_HEIGHT - 2; i++) Tetris.tick(state);
    expect(filledCount(state)).toBe(0);
    Tetris.tick(state); // can't fall further
    expect(filledCount(state)).toBe(4);
    expect(state.board[Tetris.BOARD_HEIGHT - 1][4]).toBe(Tetris.PIECES[pieceIndex('O')].color);
    expect(Math.min(...currentCells(state).map(([, y]) => y))).toBe(0);
  });

  test('moving down goes one row at a time and scores 1 point per row', () => {
    const state = gameWith('T');
    const y = state.current.y;
    expect(Tetris.softDrop(state)).toBe(true);
    expect(Tetris.softDrop(state)).toBe(true);
    expect(state.current.y).toBe(y + 2);
    expect(state.score).toBe(2);
  });

  test('moving down a piece that has landed locks it at once', () => {
    const state = gameWith('O');
    expect(dropAndLock(state)).toBe(Tetris.BOARD_HEIGHT - 2);
    expect(state.score).toBe(Tetris.BOARD_HEIGHT - 2);
    expect(state.board[Tetris.BOARD_HEIGHT - 1].slice(4, 6)).toEqual(Array(2).fill('#f4d03f'));
    expect(Math.min(...currentCells(state).map(([, y]) => y))).toBe(0); // the next piece is up
  });

  test('knows how far the piece can fall before landing on other blocks', () => {
    const state = gameWith('O');
    expect(Tetris.dropDistance(state)).toBe(Tetris.BOARD_HEIGHT - 2);
    Tetris.setBoard(state, ['....XX....', '....XX....', '....XX....']);
    expect(Tetris.dropDistance(state)).toBe(Tetris.BOARD_HEIGHT - 5);
  });
});

test.describe('clearing rows', () => {
  test('removes full rows and moves the rows above them down', () => {
    const board = [
      ['a', null, null],
      ['b', 'b', 'b'],
      [null, 'c', null],
      ['d', 'd', 'd'],
    ];
    expect(Tetris.clearFullRows(board)).toEqual([1, 3]);
    expect(board).toEqual([
      [null, null, null],
      [null, null, null],
      ['a', null, null],
      [null, 'c', null],
    ]);
  });

  test('leaves the board alone when no row is full', () => {
    const board = [['a', null], [null, 'b']];
    expect(Tetris.clearFullRows(board)).toEqual([]);
    expect(board).toEqual([['a', null], [null, 'b']]);
  });

  test('completing a row clears it and scores for it', () => {
    const state = gameWith('I'); // flat, in columns 3 to 6
    Tetris.setBoard(state, ['XXX....XXX']);
    const distance = dropAndLock(state);
    expect(state.lines).toBe(1);
    expect(filledCount(state)).toBe(0);
    expect(state.score).toBe(distance + 100);
    expect(state.lastClear).toMatchObject({ lines: 1, points: 100, rows: [19] });
  });

  test('remembers the board as it was before the rows cleared, for the animation', () => {
    const state = gameWith('I');
    Tetris.setBoard(state, ['X.........', 'XXX....XXX']);
    dropAndLock(state);
    const { before, rows } = state.lastClear;
    expect(rows).toEqual([19]);
    expect(before[19].every((cell) => cell !== null)).toBe(true); // the full row, still there
    expect(before[18][0]).not.toBeNull();
    expect(state.board[19][0]).not.toBeNull(); // on the real board, that block has moved down
    expect(state.board[18][0]).toBeNull();
  });

  test('clearing four rows at once scores 800 per level', () => {
    const state = gameWith('I');
    Tetris.rotate(state); // vertical, in column 5
    Tetris.setBoard(state, Array(4).fill('XXXXX.XXXX'));
    dropAndLock(state);
    expect(state.lines).toBe(4);
    expect(state.lastClear).toMatchObject({ lines: 4, points: 800, rows: [16, 17, 18, 19] });
  });

  test('scores more for more rows at once, times the level', () => {
    expect([1, 2, 3, 4].map((n) => Tetris.scoreForLines(n, 1))).toEqual([100, 300, 500, 800]);
    expect(Tetris.scoreForLines(4, 3)).toBe(2400);
  });

  test('every 10 rows moves up a level, scored at the old level', () => {
    const state = gameWith('I');
    state.lines = 9;
    Tetris.setBoard(state, ['XXX....XXX']);
    dropAndLock(state);
    expect(state.level).toBe(2);
    expect(state.lastClear.points).toBe(100);
  });

  test('pieces fall faster at higher levels, down to a limit', () => {
    expect(Tetris.gravityInterval(1)).toBe(1000);
    for (let level = 2; level < 30; level++) {
      expect(Tetris.gravityInterval(level)).toBeLessThanOrEqual(Tetris.gravityInterval(level - 1));
    }
    expect(Tetris.gravityInterval(2)).toBeLessThan(1000);
    expect(Tetris.gravityInterval(100)).toBe(60);
  });
});

test.describe('the end of the game', () => {
  test('comes when a new piece has no room to appear', () => {
    const state = Tetris.createGame(3);
    Tetris.setBoard(state, Array(Tetris.BOARD_HEIGHT).fill('XXXXXXXXX.'));
    Tetris.spawn(state);
    expect(state.over).toBe(true);
  });

  test('comes when a piece lands sticking out of the top', () => {
    const state = gameWith('I');
    Tetris.rotate(state); // vertical, in rows -1 to 2, so its top is above the board
    Tetris.setBoard(state, Array(Tetris.BOARD_HEIGHT - 3).fill('XXXXXXXXX.')); // rows 3 and down
    dropAndLock(state);
    expect(state.over).toBe(true);
  });

  test('stops the pieces from moving', () => {
    const state = Tetris.createGame(3);
    state.over = true;
    const before = JSON.stringify(state.current);
    expect(Tetris.move(state, -1)).toBe(false);
    expect(Tetris.rotate(state)).toBe(false);
    expect(Tetris.softDrop(state)).toBe(false);
    Tetris.tick(state);
    expect(JSON.stringify(state.current)).toBe(before);
  });
});

test.describe('pausing', () => {
  test('freezes the piece until unpaused', () => {
    const state = gameWith('T');
    Tetris.togglePause(state);
    const before = JSON.stringify(state.current);
    expect(Tetris.move(state, 1)).toBe(false);
    expect(Tetris.rotate(state)).toBe(false);
    expect(Tetris.softDrop(state)).toBe(false);
    Tetris.tick(state);
    expect(JSON.stringify(state.current)).toBe(before);

    Tetris.togglePause(state);
    expect(Tetris.move(state, 1)).toBe(true);
  });
});
