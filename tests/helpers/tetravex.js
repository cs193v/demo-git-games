// A second TetraVex solver, separate from the game's, for checking it. The game fills the board row
// by row; this one fills it column by column.

// How many ways the tiles ({ top, right, bottom, left }) can be laid out on the 4 × 4 board with
// every pair of touching sides matching, counting up to `limit`.
function countLayouts(tiles, limit = 3) {
  const order = [];
  for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) order.push(row * 4 + col);
  const at = Array(16).fill(null); // at[square] is the tile placed there
  const used = new Set();
  let count = 0;

  // In column order, the squares to the left and above are always filled already.
  const fits = (square, tile) => {
    const left = square % 4 > 0 ? at[square - 1] : null;
    const above = square >= 4 ? at[square - 4] : null;
    return (left === null || tiles[left].right === tile.left) &&
      (above === null || tiles[above].bottom === tile.top);
  };

  (function place(k) {
    if (count >= limit) return;
    if (k === order.length) {
      count++;
      return;
    }
    const square = order[k];
    tiles.forEach((tile, t) => {
      if (used.has(t) || !fits(square, tile)) return;
      used.add(t);
      at[square] = t;
      place(k + 1);
      used.delete(t);
      at[square] = null;
    });
  })(0);
  return count;
}

// Whether tiles laid out in order (tile n in square n) match wherever they touch.
function fitInOrder(tiles) {
  return tiles.every((tile, square) =>
    (square % 4 === 3 || tile.right === tiles[square + 1].left) &&
    (square >= 12 || tile.bottom === tiles[square + 4].top));
}

module.exports = { countLayouts, fitInOrder };
