// Draws and animates the board, handles dragging, and runs the clock. The rules are in logic.js.
(function () {
  'use strict';

  const { SIZE } = Gumdrop;
  const CELL = 72; // canvas pixels per square
  const GAME_MS = 60 * 1000;
  const HURRY_MS = 10 * 1000; // the clock turns red for the last 10 seconds
  const BEST_KEY = 'gumdropSwap.highScore';

  // How long each animation takes, in milliseconds.
  const SWAP_MS = 160;
  const POP_MS = 260;
  const FALL_MS = 320;
  const SHUFFLE_MS = 700;
  const POPUP_MS = 1000;

  // Each color's main shade, plus lighter and darker ones for its shine and shadow.
  const GUMDROPS = [
    { base: '#e8384f', light: '#ff8fa0', dark: '#a3162b' }, // cherry
    { base: '#fb8c1e', light: '#ffc37d', dark: '#b85a00' }, // orange
    { base: '#f5cf1f', light: '#fff196', dark: '#b08c00' }, // lemon
    { base: '#43c25d', light: '#a1efae', dark: '#1d7d33' }, // lime
    { base: '#3b82f6', light: '#a0c6ff', dark: '#1a4db3' }, // blueberry
    { base: '#9b59d0', light: '#d4abf5', dark: '#5f2c8c' }, // grape
  ];
  // Where the sugar sparkles sit on a gumdrop, which is drawn in a box from -1 to 1.
  const SUGAR = [
    [-0.45, 0.1], [0.1, -0.55], [0.45, 0.05], [-0.1, 0.42], [0.32, 0.5], [-0.55, 0.52],
    [0.58, -0.22], [0.02, 0.05], [-0.25, -0.2],
  ];

  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const popups = document.getElementById('popups');
  const overlay = document.getElementById('overlay');
  const finalScore = document.getElementById('final-score');
  const newBest = document.getElementById('new-best');
  const playAgain = document.getElementById('play-again');
  const timePanel = document.getElementById('time-panel');
  const timeText = document.getElementById('time');
  const timeBar = document.getElementById('time-bar');
  const scoreText = document.getElementById('score');
  const bestText = document.getElementById('best');
  const chainText = document.getElementById('chain');

  canvas.width = canvas.height = SIZE * CELL;

  // Thrown into a running animation to stop it when time runs out.
  const CANCELLED = Symbol('cancelled');

  let state;
  let over; // time's up
  let busy; // an animation is playing, so the player has to wait
  let timerStart; // when this game's clock started (all times come from performance.now())
  let timeLeft;
  let best = loadBest();
  let bestAtStart; // the high score before this game, to tell whether this one beat it
  let phase = null; // the animation playing: { duration, sprites, start, resolve, reject }
  let drag = null; // the gumdrop being dragged: { cell, x, y }

  // ---- High score ----
  // Some browsers don't allow saving from a page opened as a file. Then the high score just lasts
  // until the page is closed.

  function loadBest() {
    try {
      return Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {
      return 0;
    }
  }

  function saveBest(score) {
    try {
      localStorage.setItem(BEST_KEY, String(score));
    } catch {
      // Nowhere to save it; keep it for this visit only.
    }
  }

  // ---- Game flow ----

  function newGame(seed) {
    cancelAnimation();
    state = Gumdrop.createGame(seed);
    over = false;
    busy = false;
    drag = null;
    timerStart = performance.now();
    timeLeft = GAME_MS;
    bestAtStart = best;
    popups.replaceChildren();
    overlay.classList.add('hidden');
    updateStats();
  }

  function endGame() {
    over = true;
    drag = null;
    cancelAnimation();
    updateStats();
    finalScore.textContent = `You scored ${state.score.toLocaleString()} points.`;
    newBest.classList.toggle('hidden', !(state.score > bestAtStart));
    overlay.classList.remove('hidden');
  }

  function updateStats() {
    if (state.score > best) {
      best = state.score;
      saveBest(best);
    }
    scoreText.textContent = state.score.toLocaleString();
    bestText.textContent = best.toLocaleString();
    chainText.textContent = state.chain > 0 ? `×${state.chain}` : '–';
    timeText.textContent = Math.ceil(timeLeft / 1000);
    timeBar.style.width = `${(100 * timeLeft) / GAME_MS}%`;
    timePanel.classList.toggle('hurry', !over && timeLeft <= HURRY_MS);
  }

  // Runs an animated sequence. The player's input is ignored until it finishes.
  async function run(task) {
    busy = true;
    try {
      await task();
    } catch (error) {
      if (error !== CANCELLED) throw error;
    } finally {
      busy = false;
    }
  }

  function playMove(a, b) {
    return run(async () => {
      const board = state.board;
      await animate(SWAP_MS, (t) => swapSprites(board, a, b, easeInOut(t)));
      if (!Gumdrop.swap(state, a, b)) {
        await animate(SWAP_MS, (t) => swapSprites(board, a, b, easeInOut(1 - t))); // swap back
        return;
      }
      await settle();
    });
  }

  // Plays out a chain reaction one link at a time, then reshuffles if there are no moves left.
  async function settle() {
    for (let step; (step = Gumdrop.cascadeStep(state));) {
      showPoints(step);
      await animate(POP_MS, (t) => popSprites(step, t));
      await animate(FALL_MS, (t) => fallSprites(step, t));
    }
    if (!Gumdrop.hasMoves(state.board)) {
      const before = state.board;
      Gumdrop.reshuffle(state);
      showPopup('No moves left!\nShuffling…', 3.5, 3.5, 'message');
      await animate(SHUFFLE_MS, (t) => shuffleSprites(before, state.board, t));
    }
  }

  // ---- Animation ----
  // animate() plays one phase of an animation: sprites(t) says what to draw as t goes from 0 to 1.

  function animate(duration, sprites) {
    if (over) return Promise.reject(CANCELLED);
    return new Promise((resolve, reject) => {
      phase = { duration, sprites, start: null, resolve, reject };
    });
  }

  function cancelAnimation() {
    if (!phase) return;
    const cancelled = phase;
    phase = null;
    cancelled.reject(CANCELLED);
  }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
  }

  // Speeds up as it falls, then a little bounce at the bottom.
  function fallEase(t) {
    return t < 0.8 ? (t / 0.8) ** 2 : 1 - 0.08 * Math.sin(((t - 0.8) / 0.2) * Math.PI);
  }

  function frame() {
    const now = performance.now();
    if (!over) {
      timeLeft = Math.max(0, GAME_MS - (now - timerStart));
      if (timeLeft === 0) endGame();
    }

    if (phase) {
      if (phase.start === null) phase.start = now;
      const t = Math.min(1, (now - phase.start) / phase.duration);
      draw(phase.sprites(t));
      if (t === 1) {
        const finished = phase;
        phase = null;
        finished.resolve();
      }
    } else {
      draw(restingSprites());
    }

    updateStats();
    requestAnimationFrame(frame);
  }

  // A sprite is one gumdrop to draw: { row, col, color }, where row and col can be fractional
  // while it moves, plus optional scale, alpha, selected, and burst (how far a pop has gone).
  function spritesFor(board, skip = () => false) {
    const sprites = [];
    board.forEach((row, r) => row.forEach((color, c) => {
      if (color !== null && !skip(r, c)) sprites.push({ row: r, col: c, color });
    }));
    return sprites;
  }

  const sameCell = (a, b) => a[0] === b[0] && a[1] === b[1];
  const cellIn = (cells, row, col) => cells.some((cell) => sameCell(cell, [row, col]));

  function restingSprites() {
    const sprites = spritesFor(state.board);
    const held = drag && sprites.find((sprite) => sameCell([sprite.row, sprite.col], drag.cell));
    if (held) {
      held.selected = true;
      sprites.push(sprites.splice(sprites.indexOf(held), 1)[0]); // draw it on top
    }
    return sprites;
  }

  // Two gumdrops trading places; at t = 1 each is where the other started.
  function swapSprites(board, a, b, t) {
    const sprites = spritesFor(board, (r, c) => sameCell([r, c], a) || sameCell([r, c], b));
    sprites.push({ row: a[0] + (b[0] - a[0]) * t, col: a[1] + (b[1] - a[1]) * t, color: board[a[0]][a[1]] });
    sprites.push({ row: b[0] + (a[0] - b[0]) * t, col: b[1] + (a[1] - b[1]) * t, color: board[b[0]][b[1]] });
    return sprites;
  }

  // The matched gumdrops swell a little, then shrink away inside a spreading ring.
  function popSprites(step, t) {
    const sprites = spritesFor(step.before, (r, c) => cellIn(step.matched, r, c));
    const swelling = t < 0.3;
    const shrink = (t - 0.3) / 0.7;
    for (const [row, col] of step.matched) {
      sprites.push({
        row, col, color: step.before[row][col], burst: t,
        scale: swelling ? 1 + 0.25 * (t / 0.3) : 1.25 * (1 - shrink),
        alpha: swelling ? 1 : 1 - shrink,
      });
    }
    return sprites;
  }

  // The gumdrops above the gaps fall into place, and new ones drop in from above the board.
  function fallSprites(step, t) {
    const e = fallEase(t);
    const landing = step.falls.map(({ to }) => to);
    const arriving = step.added.map(({ cell }) => cell);
    const sprites = spritesFor(step.after, (r, c) => cellIn(landing, r, c) || cellIn(arriving, r, c));
    for (const { from, to } of step.falls) {
      sprites.push({ row: from[0] + (to[0] - from[0]) * e, col: to[1], color: step.after[to[0]][to[1]] });
    }
    const newInColumn = Array(SIZE).fill(0);
    for (const { cell } of step.added) newInColumn[cell[1]]++;
    for (const { cell: [row, col], color } of step.added) {
      const drop = newInColumn[col]; // they start just above the board, stacked in order
      sprites.push({ row: row - drop + drop * e, col, color });
    }
    return sprites;
  }

  // The old board shrinks away, then the rearranged one grows in.
  function shuffleSprites(before, after, t) {
    const growing = t >= 0.5;
    const scale = growing ? (t - 0.5) * 2 : 1 - t * 2;
    return spritesFor(growing ? after : before).map((sprite) => ({ ...sprite, scale, alpha: scale }));
  }

  // ---- Drawing ----

  function draw(sprites) {
    ctx.fillStyle = '#fff5fa';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffe4f0';
    for (let row = 0; row < SIZE; row++) {
      for (let col = (row % 2); col < SIZE; col += 2) ctx.fillRect(col * CELL, row * CELL, CELL, CELL);
    }
    for (const sprite of sprites) drawGumdrop(sprite);
  }

  // The outline of a gumdrop: a dome with a flat bottom, in a box from -1 to 1.
  function domePath() {
    ctx.beginPath();
    ctx.moveTo(-0.85, 0.55);
    ctx.bezierCurveTo(-0.9, -0.35, -0.5, -0.9, 0, -0.9);
    ctx.bezierCurveTo(0.5, -0.9, 0.9, -0.35, 0.85, 0.55);
    ctx.quadraticCurveTo(0.85, 0.82, 0.55, 0.82);
    ctx.lineTo(-0.55, 0.82);
    ctx.quadraticCurveTo(-0.85, 0.82, -0.85, 0.55);
    ctx.closePath();
  }

  function drawGumdrop({ row, col, color, scale = 1, alpha = 1, selected = false, burst = null }) {
    const shades = GUMDROPS[color];
    const x = (col + 0.5) * CELL;
    const y = (row + 0.5) * CELL;

    if (burst !== null) {
      ctx.save();
      ctx.globalAlpha = (1 - burst) * 0.8;
      ctx.strokeStyle = shades.light;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, CELL * (0.3 + 0.35 * burst), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (scale <= 0 || alpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    const size = CELL * 0.42 * scale * (selected ? 1.12 : 1);
    ctx.scale(size, size);

    if (selected) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.beginPath();
      ctx.arc(0, 0.02, 1.12, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(120, 30, 70, 0.18)'; // shadow
    ctx.beginPath();
    ctx.ellipse(0, 0.86, 0.8, 0.16, 0, 0, Math.PI * 2);
    ctx.fill();

    domePath();
    const body = ctx.createLinearGradient(0, -0.9, 0, 0.85);
    body.addColorStop(0, shades.light);
    body.addColorStop(0.5, shades.base);
    body.addColorStop(1, shades.dark);
    ctx.fillStyle = body;
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'; // shine
    ctx.beginPath();
    ctx.ellipse(-0.32, -0.42, 0.24, 0.13, -0.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)'; // sugar
    for (const [sx, sy] of SUGAR) {
      ctx.beginPath();
      ctx.arc(sx, sy, 0.04, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Floating text over the board at (row, col), which can be fractional. It's kept far enough from
  // the edges to fit, and any older popups still fading out are dimmed so the new one stands out.
  function showPopup(text, row, col, kind = '') {
    const clamp = (percent, margin) => Math.min(100 - margin, Math.max(margin, percent));
    for (const older of popups.children) older.classList.add('older');
    const popup = document.createElement('div');
    popup.className = `popup ${kind}`;
    popup.textContent = text;
    popup.style.left = `${clamp(((col + 0.5) / SIZE) * 100, 16)}%`;
    popup.style.top = `${clamp(((row + 0.5) / SIZE) * 100, 10)}%`;
    popups.append(popup);
    setTimeout(() => popup.remove(), POPUP_MS);
  }

  function showPoints(step) {
    const middle = (i) => step.matched.reduce((sum, cell) => sum + cell[i], 0) / step.matched.length;
    const chain = step.chain > 1 ? `\nChain ×${step.chain}!` : '';
    showPopup(`+${step.points.toLocaleString()}${chain}`, middle(0), middle(1));
  }

  // ---- Dragging ----

  function cellAt(event) {
    const rect = canvas.getBoundingClientRect();
    const cell = [
      Math.floor(((event.clientY - rect.top) / rect.height) * SIZE),
      Math.floor(((event.clientX - rect.left) / rect.width) * SIZE),
    ];
    return Gumdrop.inBounds(cell) ? cell : null;
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (busy || over) return;
    const cell = cellAt(event);
    if (!cell) return;
    event.preventDefault();
    drag = { cell, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });

  // Once the pointer has moved a third of a square, the direction it went picks the neighbor.
  canvas.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const square = canvas.getBoundingClientRect().width / SIZE;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < square / 3) return;

    const [row, col] = drag.cell;
    const target = Math.abs(dx) > Math.abs(dy) ? [row, col + Math.sign(dx)] : [row + Math.sign(dy), col];
    drag = null;
    if (Gumdrop.inBounds(target)) playMove([row, col], target);
  });

  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('pointercancel', () => { drag = null; });

  playAgain.addEventListener('click', () => newGame());

  // For the end-to-end tests: lets them look at the game and set up exact situations.
  window.game = {
    get state() { return state; },
    get busy() { return busy; },
    get over() { return over; },
    newGame,
    setBoard(rows) {
      state.board = Gumdrop.parseBoard(rows);
    },
    // Plays out any matches on the board and reshuffles if there are no moves, as after a swap.
    settle: () => run(settle),
    // Where the middle of a square is on the page.
    cellCenter(row, col) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: rect.left + ((col + 0.5) * rect.width) / SIZE,
        y: rect.top + ((row + 0.5) * rect.height) / SIZE,
      };
    },
  };

  newGame();
  requestAnimationFrame(frame);
})();
