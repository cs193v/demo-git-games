// End-to-end tests: open index.html in a real (headless) browser and play.
const { test, expect, GAME_URL } = require('../helpers/page.js');

const START = new Date('2026-01-01T09:00:00');

// Boards written as rows of letters: R(ed) O(range) Y(ellow) G(reen) B(lue) P(urple).
// A repeating pattern with no matches and no swap that would make one.
const NO_MOVES = [
  'ROYGBPRO',
  'YGBPROYG',
  'BPROYGBP',
  'ROYGBPRO',
  'YGBPROYG',
  'BPROYGBP',
  'ROYGBPRO',
  'YGBPROYG',
];
// Swapping (6, 2) and (7, 2) lines up three oranges along the bottom. When they clear, the columns
// above drop by one and line up three purples: a chain reaction.
const ONE_SWAP_AWAY = [...NO_MOVES.slice(0, 5), 'BPPOYGBP', 'ROOPBPRO', 'OOYPROYG'];
// Swapping (7, 2) and (7, 3), side by side, lines up three reds along the bottom.
const SIDEWAYS_SWAP = [...NO_MOVES.slice(0, 7), 'RRBRROYG'];

// Opens the game with a fake clock, paused, so time only passes when a test says so.
async function open(page) {
  await page.clock.install({ time: START });
  await page.goto(GAME_URL);
  await page.clock.pauseAt(new Date(START.getTime() + 1000));
}

// Presses on one square and drags to another (which may be off the board).
async function drag(page, from, to) {
  const start = await page.evaluate(([r, c]) => game.cellCenter(r, c), from);
  const end = await page.evaluate(([r, c]) => game.cellCenter(r, c), to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await page.mouse.up();
}

// Lets time pass until the gumdrops stop moving.
async function waitForBoard(page) {
  for (let i = 0; i < 200; i++) {
    if (!(await page.evaluate(() => game.busy))) return;
    await page.clock.runFor(100);
  }
  throw new Error('the gumdrops never stopped moving');
}

const board = (page) => page.evaluate(() => Gumdrop.formatBoard(game.state.board));
const score = (page) => page.evaluate(() => game.state.score);
const setBoard = (page, rows) => page.evaluate((r) => game.setBoard(r), rows);
const boardIsReady = (page) => page.evaluate(() =>
  Gumdrop.findRuns(game.state.board).length === 0 && Gumdrop.hasMoves(game.state.board));

test('the clock starts as soon as the page opens', async ({ page }) => {
  await open(page);
  await page.clock.runFor(5000);
  const seconds = Number(await page.locator('#time').textContent());
  expect(seconds).toBeGreaterThanOrEqual(54);
  expect(seconds).toBeLessThanOrEqual(55);
});

test.describe('a game', () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
    await page.evaluate(() => game.newGame(1)); // a known game, with the whole minute to go
  });

  test('shows the board, the clock, the score, and how to play', async ({ page }) => {
    await expect(page).toHaveTitle('Gumdrop Swap: Chain Reactions');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gumdrop Swap');
    await expect(page.locator('.subtitle')).toHaveText('Chain reaction edition');
    await expect(page.locator('#chain')).toHaveText('–');
    const box = await page.locator('#board').boundingBox();
    expect(box.height).toBeGreaterThan(400);
    expect(box.width).toBeCloseTo(box.height, 0);
    await expect(page.locator('#time')).toHaveText('60');
    await expect(page.locator('#score')).toHaveText('0');
    await expect(page.locator('#best')).toHaveText('0');
    await expect(page.locator('.help')).toContainText('Drag a gumdrop');
    await expect(page.locator('#overlay')).toBeHidden();
  });

  test('starts with no matches on the board and at least one move', async ({ page }) => {
    expect(await boardIsReady(page)).toBe(true);
  });

  test('dragging a gumdrop onto a neighbor swaps them and pops the match', async ({ page }) => {
    await setBoard(page, ONE_SWAP_AWAY);
    await drag(page, [6, 2], [7, 2]);
    expect(await page.evaluate(() => game.busy)).toBe(true);

    await page.clock.runFor(250); // the swap is done and the oranges are popping
    await expect(page.locator('.popup').first()).toHaveText('+30');
    await expect(page.locator('#score')).toHaveText(/^\d/);
    expect(await score(page)).toBeGreaterThanOrEqual(30);
  });

  test('a chain reaction scores more for each link, and says so', async ({ page }) => {
    await setBoard(page, ONE_SWAP_AWAY);
    await drag(page, [6, 2], [7, 2]);
    await page.clock.runFor(900); // into the second link: the purples that fell into line
    await expect(page.locator('.popup', { hasText: 'Chain ×2!' })).toBeVisible();
    await expect(page.locator('#chain')).toHaveText('×2');
    expect(await score(page)).toBeGreaterThanOrEqual(30 + 60);
    await expect(page.locator('#score')).toHaveText((await score(page)).toLocaleString('en-US'));
  });

  test('one swap sets off a chain reaction that lasts until time runs out', async ({ page }) => {
    await setBoard(page, ONE_SWAP_AWAY);
    await drag(page, [6, 2], [7, 2]);
    await page.clock.runFor(20_000);
    expect(await page.evaluate(() => game.busy)).toBe(true); // still going
    const chain = await page.evaluate(() => game.state.chain);
    expect(chain).toBeGreaterThanOrEqual(20);
    await expect(page.locator('#chain')).toHaveText(`×${chain}`);

    await page.clock.runFor(40_500);
    await expect(page.locator('#overlay')).toBeVisible();
    expect(await page.evaluate(() => game.busy)).toBe(false);
    expect(await page.evaluate(() => game.state.chain)).toBeGreaterThan(60);
  });

  test('works dragging up, down, left, or right', async ({ page }) => {
    const moves = [
      [ONE_SWAP_AWAY, [6, 2], [7, 2]], // down
      [ONE_SWAP_AWAY, [7, 2], [6, 2]], // up
      [SIDEWAYS_SWAP, [7, 2], [7, 3]], // right
      [SIDEWAYS_SWAP, [7, 3], [7, 2]], // left
    ];
    for (const [rows, from, to] of moves) {
      await page.evaluate(() => game.newGame(1));
      await setBoard(page, rows);
      await drag(page, from, to);
      await page.clock.runFor(300); // swapped, and the first match is popping
      expect(await score(page), `dragging from ${from} to ${to}`).toBeGreaterThan(0);
    }
  });

  test('a swap that makes no match slides back', async ({ page }) => {
    await setBoard(page, ONE_SWAP_AWAY);
    await drag(page, [0, 0], [0, 1]);
    await page.clock.runFor(100);
    expect(await page.evaluate(() => game.busy)).toBe(true); // sliding
    await waitForBoard(page);
    expect(await board(page)).toEqual(ONE_SWAP_AWAY);
    expect(await score(page)).toBe(0);
  });

  test('a small nudge, or a drag off the edge of the board, does nothing', async ({ page }) => {
    await setBoard(page, SIDEWAYS_SWAP);
    const middle = await page.evaluate(() => game.cellCenter(7, 2));
    await page.mouse.move(middle.x, middle.y);
    await page.mouse.down();
    await page.mouse.move(middle.x + 8, middle.y + 3);
    await page.mouse.up();
    await drag(page, [7, 2], [8, 2]); // off the bottom
    await drag(page, [0, 0], [0, -1]); // off the left side
    await page.clock.runFor(500);
    expect(await board(page)).toEqual(SIDEWAYS_SWAP);
    expect(await page.evaluate(() => game.busy)).toBe(false);
  });

  test('the player has to wait while gumdrops are moving', async ({ page }) => {
    await page.evaluate(() => {
      const swap = Gumdrop.swap;
      window.swaps = 0;
      Gumdrop.swap = (...args) => { window.swaps++; return swap(...args); };
    });
    await setBoard(page, ONE_SWAP_AWAY);
    await drag(page, [6, 2], [7, 2]);
    await page.clock.runFor(300);
    await drag(page, [3, 3], [3, 4]); // ignored: still busy with the first move
    await page.clock.runFor(2000);
    await drag(page, [4, 4], [4, 5]); // still busy: the chain reaction never stops
    await page.clock.runFor(2000);
    expect(await page.evaluate(() => window.swaps)).toBe(1);
  });

  test('with no moves left, the gumdrops are reshuffled', async ({ page }) => {
    await setBoard(page, NO_MOVES);
    const counts = (rows) => [...rows.join('')].sort().join('');
    await page.evaluate(() => { game.settle(); }); // start it, but don't wait: the clock is paused
    await page.clock.runFor(100);
    await expect(page.locator('.popup.message')).toContainText('No moves left');
    await waitForBoard(page);
    expect(await boardIsReady(page)).toBe(true);
    expect(counts(await board(page))).toBe(counts(NO_MOVES)); // the same gumdrops, rearranged
  });

  test('the clock counts down, and turns red for the last ten seconds', async ({ page }) => {
    // The display changes on the next animation frame, so allow a little extra time.
    await page.clock.runFor(10_100);
    await expect(page.locator('#time')).toHaveText('50');
    await expect(page.locator('#time-panel')).not.toHaveClass(/hurry/);

    await page.clock.fastForward(40_000);
    await page.clock.runFor(1000);
    await expect(page.locator('#time')).toHaveText('9');
    await expect(page.locator('#time-panel')).toHaveClass(/hurry/);
  });

  test('when time runs out, the game ends and offers to play again', async ({ page }) => {
    await setBoard(page, ONE_SWAP_AWAY);
    await drag(page, [6, 2], [7, 2]);
    await page.clock.runFor(2000);

    await page.clock.fastForward(60_000);
    await page.clock.runFor(100);
    const points = await score(page);
    await expect(page.locator('#overlay')).toBeVisible();
    await expect(page.locator('#overlay h2')).toHaveText("Time's up!");
    await expect(page.locator('#final-score')).toHaveText(`You scored ${points.toLocaleString('en-US')} points.`);
    await expect(page.getByRole('button', { name: 'Play again?' })).toBeVisible();
    await expect(page.locator('#time')).toHaveText('0');

    const before = await board(page);
    await drag(page, [3, 3], [3, 4]); // too late
    await page.clock.runFor(500);
    expect(await board(page)).toEqual(before);
    expect(await score(page)).toBe(points);
  });

  test('time can run out in the middle of a move', async ({ page }) => {
    await setBoard(page, ONE_SWAP_AWAY);
    await drag(page, [6, 2], [7, 2]);
    await page.clock.runFor(300);
    await page.clock.fastForward(60_000);
    await page.clock.runFor(100);
    await expect(page.locator('#overlay')).toBeVisible();
    expect(await page.evaluate(() => game.busy)).toBe(false);
  });

  test('Play again? starts a new game with a full minute', async ({ page }) => {
    await page.clock.fastForward(60_000);
    await page.clock.runFor(100);
    await page.getByRole('button', { name: 'Play again?' }).click();
    await expect(page.locator('#overlay')).toBeHidden();
    await expect(page.locator('#score')).toHaveText('0');
    await page.clock.runFor(100);
    await expect(page.locator('#time')).toHaveText('60');
    expect(await boardIsReady(page)).toBe(true);
  });

  test('keeps the high score, even after the page is closed', async ({ page }) => {
    await setBoard(page, ONE_SWAP_AWAY);
    await drag(page, [6, 2], [7, 2]);
    await page.clock.runFor(2000);
    // It goes up as soon as you pass it.
    await expect(page.locator('#best')).toHaveText((await score(page)).toLocaleString('en-US'));

    await page.clock.fastForward(60_000);
    await page.clock.runFor(100);
    await expect(page.locator('#new-best')).toBeVisible();
    const shown = (await score(page)).toLocaleString('en-US');
    await expect(page.locator('#best')).toHaveText(shown);

    // A second game that scores nothing is no new record.
    await page.getByRole('button', { name: 'Play again?' }).click();
    await page.clock.fastForward(60_000);
    await page.clock.runFor(100);
    await expect(page.locator('#overlay')).toBeVisible();
    await expect(page.locator('#new-best')).toBeHidden();
    await expect(page.locator('#best')).toHaveText(shown);

    await page.reload();
    await expect(page.locator('#best')).toHaveText(shown);
    await expect(page.locator('#score')).toHaveText('0');
  });
});
