// End-to-end tests: open index.html in a real (headless) browser and do the puzzles.
const fs = require('fs');
const path = require('path');
const { test, expect, GAME_URL } = require('../helpers/page.js');

// The picture files, from the same list the game uses.
const PICTURES = require('../../pictures.js').map((picture) => picture.file);

test.beforeEach(async ({ page }) => {
  await page.goto(GAME_URL);
});

const puzzle = (page) => page.evaluate(() => game.puzzle);
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

// Drags every piece from the tray to its own square on the board.
async function solve(page) {
  const { tray } = await puzzle(page);
  for (let i = 0; i < tray.length; i++) {
    if (tray[i] !== null) await drag(page, ['tray', i], ['board', tray[i]]);
  }
}

// The piece number showing in a square on the page, or null.
const pieceShownIn = (page, area, index) =>
  page.locator(`#${area} .slot`).nth(index).locator('.piece')
    .evaluateAll((pieces) => (pieces.length ? Number(pieces[0].dataset.piece) : null));

test('shows an empty board on the left and 16 pieces on the right', async ({ page }) => {
  await expect(page).toHaveTitle('CS193V Jigsaw');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('CS193V Jigsaw');
  await expect(page.locator('.help')).toContainText('Drag the pieces');
  await expect(page.locator('#board .slot')).toHaveCount(16);
  await expect(page.locator('#board .piece')).toHaveCount(0);
  await expect(page.locator('#tray .piece')).toHaveCount(16);

  const board = await page.locator('#board').boundingBox();
  const tray = await page.locator('#tray').boundingBox();
  expect(board.x + board.width).toBeLessThan(tray.x);
  expect(board.width).toBeCloseTo(board.height, 0);
  expect(tray.width).toBeCloseTo(board.width, 0);
  await expect(page.locator('#win')).toBeHidden();
});

test('each piece shows its own part of the picture', async ({ page }) => {
  const picture = await page.evaluate(() => game.picture);
  expect(PICTURES).toContain(picture);
  const pieces = await page.locator('.piece').evaluateAll((elements) => elements.map((el) => ({
    n: Number(el.dataset.piece),
    image: el.style.backgroundImage,
    position: el.style.backgroundPosition,
  })));
  for (const { n, image, position } of pieces) {
    expect(image).toContain(picture);
    const [x, y] = position.split(' ').map(parseFloat);
    expect(x).toBeCloseTo(((n % 4) * 100) / 3, 1);
    expect(y).toBeCloseTo((Math.floor(n / 4) * 100) / 3, 1);
  }
});

test('the pictures are all there, and square', async ({ page }) => {
  const sizes = await page.evaluate(async (files) => Promise.all(files.map(async (file) => {
    const image = new Image();
    image.src = file;
    await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  })), PICTURES);
  for (const [width, height] of sizes) {
    expect(width).toBe(800);
    expect(height).toBe(800);
  }
});

test('the pieces are shuffled differently each time the page opens', async ({ page }) => {
  const first = (await puzzle(page)).tray;
  await page.reload();
  const second = (await puzzle(page)).tray;
  expect(second).not.toEqual(first);
  expect([...first].sort((a, b) => a - b)).toEqual([...Array(16).keys()]);
});

test('a dragged piece lights up the square under it, then snaps into it', async ({ page }) => {
  const piece = (await puzzle(page)).tray[0];
  const start = await center(page, ['tray', 0]);
  const end = await center(page, ['board', 5]);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await expect(page.locator('#board .slot').nth(5)).toHaveClass(/target/);
  await expect(page.locator('.slot.target')).toHaveCount(1);
  await page.mouse.up();

  await expect(page.locator('.slot.target')).toHaveCount(0);
  expect((await puzzle(page)).board[5]).toBe(piece);
  expect(await pieceShownIn(page, 'board', 5)).toBe(piece);
  expect(await pieceShownIn(page, 'tray', 0)).toBeNull();
});

test('dropping a piece on another one makes them trade places', async ({ page }) => {
  const { tray } = await puzzle(page);
  await drag(page, ['tray', 0], ['board', 0]);
  await drag(page, ['tray', 1], ['board', 0]);
  const after = await puzzle(page);
  expect(after.board[0]).toBe(tray[1]);
  expect(after.tray[1]).toBe(tray[0]);
  expect(await pieceShownIn(page, 'board', 0)).toBe(tray[1]);
  expect(await pieceShownIn(page, 'tray', 1)).toBe(tray[0]);
});

test('a piece dropped outside the grids goes back where it came from', async ({ page }) => {
  const before = await puzzle(page);
  await drag(page, ['tray', 2], { x: 5, y: 5 });
  expect(await puzzle(page)).toEqual(before);
  expect(await pieceShownIn(page, 'tray', 2)).toBe(before.tray[2]);
  await expect(page.locator('.piece.dragging')).toHaveCount(0);
});

test('pieces can move around the board and back to the tray', async ({ page }) => {
  const piece = (await puzzle(page)).tray[0];
  await drag(page, ['tray', 0], ['board', 0]);
  await drag(page, ['board', 0], ['board', 15]);
  expect((await puzzle(page)).board[15]).toBe(piece);
  await drag(page, ['board', 15], ['tray', 0]);
  const after = await puzzle(page);
  expect(after.board).toEqual(Array(16).fill(null));
  expect(after.tray[0]).toBe(piece);
});

test('pieces in the wrong places are not a win', async ({ page }) => {
  // Put every piece on the board, but with the pieces for squares 0 and 1 the wrong way round.
  const { tray } = await puzzle(page);
  for (let i = 0; i < 16; i++) {
    const square = tray[i] === 0 ? 1 : tray[i] === 1 ? 0 : tray[i];
    await drag(page, ['tray', i], ['board', square]);
  }
  await expect(page.locator('#tray .piece')).toHaveCount(0);
  await expect(page.locator('#win')).toBeHidden();

  await drag(page, ['board', 0], ['board', 1]); // fix it
  await expect(page.locator('#win')).toBeVisible();
});

test('finishing the picture says so, and the pieces stay put', async ({ page }) => {
  await solve(page);
  await expect(page.locator('#win')).toBeVisible();
  await expect(page.locator('#win h3')).toHaveText('You did it!');
  await expect(page.locator('#win-text')).toHaveText("That's the CS193V logo!");
  await expect(page.getByRole('button', { name: 'Play again' })).toBeVisible();
  for (let i = 0; i < 16; i++) expect(await pieceShownIn(page, 'board', i)).toBe(i);

  await drag(page, ['board', 0], ['board', 5]); // too late to move anything
  expect((await puzzle(page)).board).toEqual([...Array(16).keys()]);
});

test('Play again brings the logo back, freshly shuffled', async ({ page }) => {
  const firstShuffle = (await puzzle(page)).tray;
  await solve(page);
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.locator('#win')).toBeHidden();
  expect(await page.evaluate(() => game.picture)).toBe(PICTURES[0]);
  await expect(page.locator('#board .piece')).toHaveCount(0);
  await expect(page.locator('#tray .piece')).toHaveCount(16);
  expect((await puzzle(page)).tray).not.toEqual(firstShuffle);
  expect(await page.evaluate(() => game.solved)).toBe(false);
});

test('the three plain maroon pieces can go in any of their three squares', async ({ page }) => {
  // Pieces 2, 7 and 14 look exactly alike, so a mix-up among them still finishes the picture.
  const { tray } = await puzzle(page);
  const swap = { 2: 7, 7: 14, 14: 2 };
  for (let i = 0; i < 16; i++) await drag(page, ['tray', i], ['board', swap[tray[i]] ?? tray[i]]);
  expect((await puzzle(page)).board[2]).toBe(14);
  await expect(page.locator('#win')).toBeVisible();
});

test('the logo is trimmed to its rounded square, on white', async ({ page }) => {
  const file = path.join(__dirname, '..', '..', 'images', 'cs193v.png');
  const dataUrl = `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
  const colorAt = await page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const at = (x, y) => [...ctx.getImageData(x, y, 1, 1).data];
    return { corner: at(2, 2), topEdge: at(400, 3), leftEdge: at(3, 400), middle: at(700, 200) };
  }, dataUrl);
  expect(colorAt.corner).toEqual([255, 255, 255, 255]); // white, not see-through
  const isMaroon = ([r, g, b]) => r > 100 && r < 160 && g < 30 && b < 30;
  for (const spot of [colorAt.topEdge, colorAt.leftEdge, colorAt.middle]) expect(isMaroon(spot)).toBe(true);
});
