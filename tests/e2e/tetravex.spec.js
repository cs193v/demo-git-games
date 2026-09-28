// End-to-end tests: open index.html in a real (headless) browser and do the puzzles.
const { test, expect, GAME_URL } = require('../helpers/page.js');
const { countLayouts, fitInOrder } = require('../helpers/tetravex.js');

const SIDES = ['top', 'right', 'bottom', 'left'];

test.beforeEach(async ({ page }) => {
  await page.goto(GAME_URL);
});

const puzzle = (page) => page.evaluate(() => game.puzzle);
const tiles = (page) => page.evaluate(() => game.tiles);
const center = (page, [area, index]) =>
  page.evaluate(([a, i]) => game.squareCenter(a, i), [area, index]);

// Drags from the middle of one square to another square, or to a point { x, y } on the page.
async function drag(page, from, to) {
  const start = await center(page, from);
  const end = Array.isArray(to) ? await center(page, to) : to;
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await page.mouse.up();
}

// Drags every tile from the tray to its own square on the board.
async function solve(page) {
  const { tray } = await puzzle(page);
  for (let i = 0; i < tray.length; i++) {
    if (tray[i] !== null) await drag(page, ['tray', i], ['board', tray[i]]);
  }
}

// The tile number in a square on the page, or null.
const tileShownIn = (page, area, index) =>
  page.locator(`#${area} .slot`).nth(index).locator('.piece')
    .evaluateAll((pieces) => (pieces.length ? Number(pieces[0].dataset.piece) : null));

// What a tile element shows: its digit and color on each side.
const showing = (piece) => piece.evaluate((element) => Object.fromEntries(
  ['top', 'right', 'bottom', 'left'].map((side) => [side, {
    digit: Number(element.querySelector(`text[data-side="${side}"]`).textContent),
    color: element.querySelector(`polygon[data-side="${side}"]`).getAttribute('fill'),
  }])));

test('shows an empty board on the left and 16 tiles on the right', async ({ page }) => {
  await expect(page).toHaveTitle('TetraVex');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('TetraVex');
  await expect(page.locator('.help')).toContainText('number on each side');
  await expect(page.locator('#board .slot')).toHaveCount(16);
  await expect(page.locator('#board .piece')).toHaveCount(0);
  await expect(page.locator('#tray .piece')).toHaveCount(16);

  const board = await page.locator('#board').boundingBox();
  const tray = await page.locator('#tray').boundingBox();
  expect(board.x + board.width).toBeLessThan(tray.x);
  expect(board.width).toBeCloseTo(board.height, 0);
  await expect(page.locator('#win')).toBeHidden();
});

test('each tile shows its four digits, each digit always in the same color', async ({ page }) => {
  const digits = await tiles(page);
  const colorOf = new Map();
  for (const piece of await page.locator('.piece').all()) {
    const n = Number(await piece.getAttribute('data-piece'));
    const shown = await showing(piece);
    for (const side of SIDES) {
      expect(shown[side].digit).toBe(digits[n][side]);
      const { digit, color } = shown[side];
      if (colorOf.has(digit)) expect(color).toBe(colorOf.get(digit));
      colorOf.set(digit, color);
    }
  }
  expect(new Set(colorOf.values()).size).toBe(colorOf.size); // different digits, different colors
});

test('every puzzle has exactly one solution', async ({ page }) => {
  for (let i = 0; i < 5; i++) {
    const current = await tiles(page);
    expect(fitInOrder(current)).toBe(true);
    expect(countLayouts(current)).toBe(1); // checked by a solver separate from the game's
    await page.reload();
  }
});

test('the tiles are shuffled differently each time the page opens', async ({ page }) => {
  const first = await tiles(page);
  await page.reload();
  expect(await tiles(page)).not.toEqual(first);
  expect((await puzzle(page)).tray).not.toEqual([...Array(16).keys()]);
});

test('a dragged tile lights up the square under it, then snaps into it', async ({ page }) => {
  const tile = (await puzzle(page)).tray[0];
  const start = await center(page, ['tray', 0]);
  const end = await center(page, ['board', 5]);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await expect(page.locator('#board .slot').nth(5)).toHaveClass(/target/);
  await expect(page.locator('.slot.target')).toHaveCount(1);
  await page.mouse.up();

  await expect(page.locator('.slot.target')).toHaveCount(0);
  expect((await puzzle(page)).board[5]).toBe(tile);
  expect(await tileShownIn(page, 'board', 5)).toBe(tile);
  expect(await tileShownIn(page, 'tray', 0)).toBeNull();
});

test('dropping a tile on another one makes them trade places', async ({ page }) => {
  const { tray } = await puzzle(page);
  await drag(page, ['tray', 0], ['board', 0]);
  await drag(page, ['tray', 1], ['board', 0]);
  const after = await puzzle(page);
  expect(after.board[0]).toBe(tray[1]);
  expect(after.tray[1]).toBe(tray[0]);
});

test('a tile dropped outside the grids goes back where it came from', async ({ page }) => {
  const before = await puzzle(page);
  await drag(page, ['tray', 2], { x: 5, y: 5 });
  expect(await puzzle(page)).toEqual(before);
  expect(await tileShownIn(page, 'tray', 2)).toBe(before.tray[2]);
});

test('tiles can move around the board and back to the tray', async ({ page }) => {
  const tile = (await puzzle(page)).tray[0];
  await drag(page, ['tray', 0], ['board', 0]);
  await drag(page, ['board', 0], ['board', 15]);
  expect((await puzzle(page)).board[15]).toBe(tile);
  await drag(page, ['board', 15], ['tray', 0]);
  expect((await puzzle(page)).tray[0]).toBe(tile);
});

test('tiles in the wrong places are not a win', async ({ page }) => {
  const { tray } = await puzzle(page);
  for (let i = 0; i < 16; i++) {
    const square = tray[i] === 0 ? 1 : tray[i] === 1 ? 0 : tray[i];
    await drag(page, ['tray', i], ['board', square]);
  }
  await expect(page.locator('#win')).toBeHidden();
  await drag(page, ['board', 0], ['board', 1]); // fix it
  await expect(page.locator('#win')).toBeVisible();
});

test('a finished puzzle says so, with matching numbers wherever tiles touch', async ({ page }) => {
  await solve(page);
  await expect(page.locator('#win h3')).toHaveText('You did it!');
  await expect(page.locator('#win-text')).toHaveText('Every edge matches!');
  await expect(page.getByRole('button', { name: 'New puzzle' })).toBeVisible();

  // Read the digits off the page, square by square.
  const squares = page.locator('#board .slot');
  const shown = [];
  for (let i = 0; i < 16; i++) shown.push(await showing(squares.nth(i).locator('.piece')));
  for (let i = 0; i < 16; i++) {
    if (i % 4 < 3) expect(shown[i].right.digit).toBe(shown[i + 1].left.digit);
    if (i < 12) expect(shown[i].bottom.digit).toBe(shown[i + 4].top.digit);
  }

  await drag(page, ['board', 0], ['board', 5]); // too late to move anything
  expect((await puzzle(page)).board).toEqual([...Array(16).keys()]);
});

test('New puzzle brings new tiles, freshly shuffled', async ({ page }) => {
  const first = await tiles(page);
  await solve(page);
  await page.getByRole('button', { name: 'New puzzle' }).click();
  await expect(page.locator('#win')).toBeHidden();
  expect(await tiles(page)).not.toEqual(first);
  await expect(page.locator('#board .piece')).toHaveCount(0);
  await expect(page.locator('#tray .piece')).toHaveCount(16);
  expect(await page.evaluate(() => game.solved)).toBe(false);

  await solve(page); // and the new one can be finished too
  await expect(page.locator('#win')).toBeVisible();
});
