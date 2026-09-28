// The rules of the TetraVex puzzle. This file has no drawing or mouse code, so it runs both in the
// browser (where it defines window.Jigsaw for ui.js) and in Node (where the unit tests require() it).
//
// A puzzle has two areas of 16 squares: the board, where the tiles get put together, and the
// tray, where the tiles start out. Squares are numbered 0 to 15, left to right and top to bottom,
// and tile number n belongs in square n of the board. Each square holds a tile number, or null
// if it's empty.
(function () {
  'use strict';

  const ROWS = 4;
  const COLS = 4;
  const PIECES = ROWS * COLS;
  const DIGITS = 10;

  // A small seeded random number generator (mulberry32), so tests can replay a shuffle exactly.
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

  function shuffled(items, rng) {
    const result = items.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  // An empty board, with every piece in the tray in a random order.
  function createPuzzle(rng) {
    return {
      board: Array(PIECES).fill(null),
      tray: shuffled([...Array(PIECES).keys()], rng),
    };
  }

  // Moves the piece in square `from` to square `to`, where each is { area: 'board' or 'tray',
  // index }. If `to` already holds a piece, the two trade places. Returns the new puzzle.
  function movePiece(puzzle, from, to) {
    const next = { board: puzzle.board.slice(), tray: puzzle.tray.slice() };
    const moving = next[from.area][from.index];
    if (moving === null) return next;
    next[from.area][from.index] = next[to.area][to.index];
    next[to.area][to.index] = moving;
    return next;
  }

  // Whether every square of the board has its own tile. Because the tiles only fit together one
  // way (see createTetravex), that's the same as every pair of touching sides matching.
  function isSolved(puzzle) {
    return puzzle.board.every((piece, square) => piece === square);
  }

  // Which row and column of the board a square (or the tile that belongs there) is in.
  function pieceRow(piece) {
    return Math.floor(piece / COLS);
  }

  function pieceCol(piece) {
    return piece % COLS;
  }

  // ---- Tiles ----
  // A tile has a digit on each side: { top, right, bottom, left }.

  function randomDigit(rng) {
    return Math.floor(rng() * DIGITS);
  }

  // 16 tiles with random digits that fit together on the board in order: wherever two tiles touch,
  // the touching sides have the same digit.
  function makeTiles(rng) {
    const tiles = [];
    for (let square = 0; square < PIECES; square++) {
      tiles.push({
        top: pieceRow(square) > 0 ? tiles[square - COLS].bottom : randomDigit(rng),
        right: randomDigit(rng),
        bottom: randomDigit(rng),
        left: pieceCol(square) > 0 ? tiles[square - 1].right : randomDigit(rng),
      });
    }
    return tiles;
  }

  // How many ways the tiles can be laid out on the board with every pair of touching sides
  // matching, counting up to `limit`. Each tile counts as different, even two with the same digits.
  function countSolutions(tiles, limit = 2) {
    const placed = []; // placed[square] is the tile put there
    const used = Array(tiles.length).fill(false);
    let count = 0;

    // Tries every tile that fits in `square`, then fills the squares after it.
    function fill(square) {
      if (square === PIECES) {
        count++;
        return;
      }
      for (let t = 0; t < tiles.length && count < limit; t++) {
        if (used[t]) continue;
        if (pieceCol(square) > 0 && tiles[placed[square - 1]].right !== tiles[t].left) continue;
        if (pieceRow(square) > 0 && tiles[placed[square - COLS]].bottom !== tiles[t].top) continue;
        used[t] = true;
        placed[square] = t;
        fill(square + 1);
        used[t] = false;
      }
    }

    fill(0);
    return count;
  }

  // Tiles that fit together in exactly one way: the order they were made in. So the puzzle is
  // solved exactly when every tile is back in its own square.
  function createTetravex(rng) {
    for (;;) {
      const tiles = makeTiles(rng);
      if (countSolutions(tiles) === 1) return tiles;
    }
  }

  const Jigsaw = {
    ROWS, COLS, PIECES, DIGITS,
    makeRng, shuffled, createPuzzle, movePiece, isSolved, pieceRow, pieceCol,
    makeTiles, countSolutions, createTetravex,
  };

  if (typeof module === 'object' && module.exports) module.exports = Jigsaw;
  else globalThis.Jigsaw = Jigsaw;
})();
