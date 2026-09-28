// Works out every polyomino of a given size independently of the game, so the tests can check that
// the game's piece set is exactly right.
//
// "One-sided" means shapes that are the same up to rotation count as one piece, but mirror images
// count as different pieces (S and Z are different tetrominoes). That matches falling-block games,
// where you can rotate a piece but not flip it.

// A string key for a set of [x, y] cells that doesn't depend on where the cells are.
function key(cells) {
  const minX = Math.min(...cells.map(([x]) => x));
  const minY = Math.min(...cells.map(([, y]) => y));
  return cells
    .map(([x, y]) => [x - minX, y - minY])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0])
    .map(([x, y]) => `${x},${y}`)
    .join(' ');
}

// The same key for a shape and all its rotations.
function canonicalKey(cells) {
  const keys = [];
  let turned = cells;
  for (let i = 0; i < 4; i++) {
    keys.push(key(turned));
    turned = turned.map(([x, y]) => [-y, x]);
  }
  return keys.sort()[0];
}

function fromKey(k) {
  return k.split(' ').map((pair) => pair.split(',').map(Number));
}

// canonicalKey() of each one-sided polyomino with `size` cells.
function oneSidedPolyominoes(size) {
  let shapes = new Set([canonicalKey([[0, 0]])]);
  for (let n = 2; n <= size; n++) {
    const bigger = new Set();
    for (const k of shapes) {
      const cells = fromKey(k);
      const taken = new Set(cells.map(([x, y]) => `${x},${y}`));
      for (const [x, y] of cells) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (!taken.has(`${x + dx},${y + dy}`)) bigger.add(canonicalKey([...cells, [x + dx, y + dy]]));
        }
      }
    }
    shapes = bigger;
  }
  return [...shapes].sort();
}

module.exports = { canonicalKey, oneSidedPolyominoes };
