// The rules of the jigsaw puzzle. This file has no drawing or mouse code, so it runs both in the
// browser (where it defines window.Jigsaw for ui.js) and in Node (where the unit tests require() it).
//
// A puzzle has two areas of 16 squares: the board, where the picture gets put together, and the
// tray, where the pieces start out. Squares are numbered 0 to 15, left to right and top to bottom,
// and piece number n belongs in square n of the board. Each square holds a piece number, or null
// if it's empty.
(function () {
  'use strict';

  const ROWS = 4;
  const COLS = 4;
  const PIECES = ROWS * COLS;

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

  function isSolved(puzzle) {
    return puzzle.board.every((piece, square) => piece === square);
  }

  // Which row and column of the picture a piece shows.
  function pieceRow(piece) {
    return Math.floor(piece / COLS);
  }

  function pieceCol(piece) {
    return piece % COLS;
  }

  // The order to show the pictures in: all of them, shuffled, but never starting with `avoid` (the
  // one just finished) if there's any choice.
  function pictureOrder(count, rng, avoid = null) {
    for (;;) {
      const order = shuffled([...Array(count).keys()], rng);
      if (count === 1 || order[0] !== avoid) return order;
    }
  }

  // Keeps track of which picture comes next: { order, position }.
  function createPlaylist(count, rng) {
    return { order: pictureOrder(count, rng), position: 0 };
  }

  function currentPicture(playlist) {
    return playlist.order[playlist.position];
  }

  // Moves on to the next picture. After the last one, reshuffles for another round.
  function nextPicture(playlist, rng) {
    if (playlist.position + 1 < playlist.order.length) {
      return { order: playlist.order, position: playlist.position + 1 };
    }
    return { order: pictureOrder(playlist.order.length, rng, currentPicture(playlist)), position: 0 };
  }

  const Jigsaw = {
    ROWS, COLS, PIECES,
    makeRng, shuffled, createPuzzle, movePiece, isSolved, pieceRow, pieceCol,
    pictureOrder, createPlaylist, currentPicture, nextPicture,
  };

  if (typeof module === 'object' && module.exports) module.exports = Jigsaw;
  else globalThis.Jigsaw = Jigsaw;
})();
