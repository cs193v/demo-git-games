// End-to-end tests: open index.html in a real (headless) browser and play.
const { test, expect, GAME_URL } = require('../helpers/page.js');

const START = new Date('2026-01-01T09:00:00');

test.beforeEach(async ({ page }) => {
  // A fake clock, paused, so pieces only fall when a test lets time pass.
  await page.clock.install({ time: START });
  await page.goto(GAME_URL);
  await page.clock.pauseAt(new Date(START.getTime() + 1000));
});

const startGame = (page, seed = 1) => page.evaluate((s) => game.newGame(s), seed);
const setPiece = (page, name) => page.evaluate((n) => game.setPiece(n), name);
const setBoard = (page, rows) => page.evaluate((r) => game.setBoard(r), rows);
const currentPiece = (page) => page.evaluate(() => game.state.current);
const filledCount = (page) =>
  page.evaluate(() => game.state.board.flat().filter((cell) => cell !== null).length);
const overlay = (page) => page.locator('#overlay');

// Presses Down until the piece lands, then once more to lock it in place.
async function dropAndLock(page) {
  const rows = await page.evaluate(() => Tetris.dropDistance(game.state));
  for (let i = 0; i <= rows; i++) await page.keyboard.press('ArrowDown');
}

// The color [r, g, b] in the middle of board square (x, y), as drawn on the canvas.
const colorAt = (page, x, y) => page.evaluate(([x, y]) => {
  const canvas = document.getElementById('board');
  const size = canvas.width / Tetris.BOARD_WIDTH;
  const pixel = canvas.getContext('2d').getImageData(x * size + size / 2, y * size + size / 2, 1, 1);
  return [...pixel.data.slice(0, 3)];
}, [x, y]);
const isWhite = ([r, g, b]) => Math.min(r, g, b) > 215;
const isEmpty = ([r, g, b]) => Math.max(r, g, b) < 40;
const isBlock = (color) => !isWhite(color) && !isEmpty(color);

test('shows the board, the controls, and a prompt to start', async ({ page }) => {
  await expect(page).toHaveTitle('Tetris: Very Silly Version');
  await expect(page.locator('.subtitle')).toHaveText('the very silly version');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tetris');

  const box = await page.locator('#board').boundingBox();
  expect(box.height).toBeGreaterThan(400);
  expect(box.width / box.height).toBeCloseTo(10 / 20, 2);

  for (const control of ['Move left', 'Move right', 'Rotate', 'Move down', 'Pause']) {
    await expect(page.locator('.keys')).toContainText(control);
  }
  await expect(overlay(page)).toBeVisible();
  await expect(overlay(page).getByRole('heading')).toHaveText('Ready?');
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
});

test('Enter starts the game', async ({ page }) => {
  await page.keyboard.press('Enter');
  await expect(overlay(page)).toBeHidden();
  expect(await page.evaluate(() => game.started)).toBe(true);
});

test('the Start button starts the game and gets out of the way', async ({ page }) => {
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(overlay(page)).toBeHidden();
  expect(await page.evaluate(() => game.started)).toBe(true);
  expect(await page.evaluate(() => document.activeElement.tagName)).not.toBe('BUTTON');
});

test('the arrow keys and A/D move the piece left and right', async ({ page }) => {
  await startGame(page);
  await setPiece(page, 'I');
  const { x } = await currentPiece(page);

  await page.keyboard.press('ArrowLeft');
  expect((await currentPiece(page)).x).toBe(x - 1);
  await page.keyboard.press('KeyA');
  expect((await currentPiece(page)).x).toBe(x - 2);
  await page.keyboard.press('ArrowRight');
  expect((await currentPiece(page)).x).toBe(x - 1);
  await page.keyboard.press('KeyD');
  expect((await currentPiece(page)).x).toBe(x);
});

test('Up and W rotate the piece clockwise', async ({ page }) => {
  await startGame(page);
  await setPiece(page, 'I');
  const shape = (rows) => rows.map((row) => [...row].map((ch) => ch === 'X'));

  await page.keyboard.press('ArrowUp');
  expect((await currentPiece(page)).shape).toEqual(shape(['..X.', '..X.', '..X.', '..X.']));
  await page.keyboard.press('KeyW');
  expect((await currentPiece(page)).shape).toEqual(shape(['....', '....', 'XXXX', '....']));
});

test('Down and S move the piece down a row, for a point each', async ({ page }) => {
  await startGame(page);
  await setPiece(page, 'I');
  const { y } = await currentPiece(page);

  await page.keyboard.press('ArrowDown');
  expect((await currentPiece(page)).y).toBe(y + 1);
  await page.keyboard.press('KeyS');
  expect((await currentPiece(page)).y).toBe(y + 2);
  await expect(page.locator('#score')).toHaveText('2');
});

test('pressing Down on a piece that has landed locks it in place', async ({ page }) => {
  await startGame(page);
  await setPiece(page, 'I');
  await dropAndLock(page);

  expect(await filledCount(page)).toBe(4);
  expect(await page.evaluate(() => game.state.board[19][4])).not.toBeNull();
  await expect(page.locator('#score')).toHaveText('19'); // 1 point for each of 19 rows
  const next = await currentPiece(page);
  expect(Math.min(...next.shape.map((row, r) => (row.some(Boolean) ? r : 99))) + next.y).toBe(0);
});

test('holding Down moves the piece to the bottom but does not lock it', async ({ page }) => {
  await startGame(page);
  await setPiece(page, 'I');
  for (let i = 0; i < 25; i++) await page.keyboard.down('ArrowDown'); // repeats after the first
  await page.keyboard.up('ArrowDown');
  expect((await currentPiece(page)).y).toBe(18);
  expect(await filledCount(page)).toBe(0);

  await page.keyboard.press('ArrowDown'); // a fresh press does lock it
  expect(await filledCount(page)).toBe(4);
});

test('completing a row clears it and updates the score and lines', async ({ page }) => {
  await startGame(page);
  await setBoard(page, ['XXX....XXX']);
  await setPiece(page, 'I');

  await dropAndLock(page);
  expect(await filledCount(page)).toBe(0);
  await expect(page.locator('#lines')).toHaveText('1');
  await expect(page.locator('#score')).toHaveText('119'); // 100 for the row + 19 for moving down
  await expect(page.locator('#toast')).toHaveText(/Single\s*\+100/);
});

test('a cleared row flashes white and fades, then the blocks above slide down', async ({ page }) => {
  await startGame(page);
  await setBoard(page, ['X.........', 'XXX....XXX']);
  await setPiece(page, 'I');
  await dropAndLock(page);
  expect(await page.evaluate(() => game.clearing)).toBe(true);

  // Nearly through the flash: the full row is white, and the block above it hasn't moved.
  await page.clock.runFor(190);
  expect(isWhite(await colorAt(page, 5, 19))).toBe(true);
  expect(isBlock(await colorAt(page, 0, 18))).toBe(true);

  // Keys and gravity wait for the animation.
  const waiting = await currentPiece(page);
  await page.keyboard.press('ArrowLeft');
  expect(await currentPiece(page)).toEqual(waiting);

  // Partway through fading, the row is still pale but no longer solid white.
  await page.clock.runFor(120);
  const fading = await colorAt(page, 5, 19);
  expect(isWhite(fading) || isEmpty(fading)).toBe(false);

  // Afterward, the row is gone and the block above has slid down into its place.
  await page.clock.runFor(400);
  expect(await page.evaluate(() => game.clearing)).toBe(false);
  expect(isEmpty(await colorAt(page, 5, 19))).toBe(true);
  expect(isBlock(await colorAt(page, 0, 19))).toBe(true);
  expect(isEmpty(await colorAt(page, 0, 18))).toBe(true);
  expect(await currentPiece(page)).toEqual(waiting); // no gravity during the animation

  await page.keyboard.press('ArrowLeft');
  expect((await currentPiece(page)).x).toBe(waiting.x - 1);
});

test('the next piece is shown before it arrives', async ({ page }) => {
  await startGame(page);
  const nextType = await page.evaluate(() => game.state.nextType);
  const nextBoxHasPixels = await page.evaluate(() => {
    const canvas = document.getElementById('next');
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    return pixels.some((value, i) => i % 4 === 3 && value > 0);
  });
  expect(nextBoxHasPixels).toBe(true);

  await dropAndLock(page);
  expect((await currentPiece(page)).type).toBe(nextType);
});

test('pieces fall on their own, and faster at higher levels', async ({ page }) => {
  await startGame(page);
  await setPiece(page, 'I');
  const { y } = await currentPiece(page);

  await page.clock.runFor(3100); // 1 row per second at level 1
  expect((await currentPiece(page)).y).toBe(y + 3);

  await page.evaluate(() => { game.state.level = 4; }); // about 1 row per half second
  await page.clock.runFor(1100);
  expect((await currentPiece(page)).y).toBe(y + 5);
});

test('P pauses and resumes the game', async ({ page }) => {
  await startGame(page);
  await setPiece(page, 'I');
  const before = await currentPiece(page);

  await page.keyboard.press('KeyP');
  await expect(overlay(page).getByRole('heading')).toHaveText('Paused');
  await page.keyboard.press('ArrowLeft');
  await page.clock.runFor(3000);
  expect(await currentPiece(page)).toEqual(before);

  await page.keyboard.press('KeyP');
  await expect(overlay(page)).toBeHidden();
  await page.keyboard.press('ArrowLeft');
  expect((await currentPiece(page)).x).toBe(before.x - 1);

  await page.keyboard.press('KeyP');
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(overlay(page)).toBeHidden();
});

test('the game ends when the pile reaches the top, and Enter starts over', async ({ page }) => {
  await startGame(page);
  await setBoard(page, Array(19).fill('XXXXXXXXX.'));
  await setPiece(page, 'I');

  await page.keyboard.press('ArrowDown');
  await expect(overlay(page).getByRole('heading')).toHaveText('Game over');
  await expect(overlay(page)).toContainText('You scored');
  await page.keyboard.press('ArrowLeft'); // ignored once the game is over

  await page.keyboard.press('Enter');
  await expect(overlay(page)).toBeHidden();
  expect(await filledCount(page)).toBe(0);
  await expect(page.locator('#score')).toHaveText('0');
});

test('the Play again button starts over after a game ends', async ({ page }) => {
  await startGame(page);
  await setBoard(page, Array(19).fill('XXXXXXXXX.'));
  await setPiece(page, 'I');
  await page.keyboard.press('ArrowDown');

  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(overlay(page)).toBeHidden();
  expect(await page.evaluate(() => game.state.over)).toBe(false);
});

test('the arrow keys do not scroll the page', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 400 }); // short enough to need scrolling
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
  await startGame(page);
  for (const key of ['ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowDown']) await page.keyboard.press(key);
  expect(await page.evaluate(() => scrollY)).toBe(0);
});

test('every piece that comes down is the straight one', async ({ page }) => {
  await startGame(page, 11);
  for (let i = 0; i < 12; i++) {
    const piece = await currentPiece(page);
    expect(piece.shape).toEqual(Array.from({ length: 4 }, (_, r) => Array(4).fill(r === 1)));
    expect(await page.evaluate(() => game.state.nextType)).toBe(piece.type);
    await setBoard(page, []); // keep the board clear so the game never ends
    await dropAndLock(page);
  }
});
