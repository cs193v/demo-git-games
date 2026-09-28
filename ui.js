// Draws the game and handles the keyboard. The rules themselves are in logic.js.
(function () {
  'use strict';

  const CELL = 30; // pixels per board square
  const PREVIEW_CELL = 24; // pixels per square in the "Next" box
  const CLEAR_NAMES = ['', 'Single', 'Double', 'Triple', 'Tetris!', 'Pentris!'];

  // The row-clearing animation: full rows brighten to white, the white fades away, then the rows
  // above slide down into the gap. The game waits while it plays.
  const FLASH_MS = 200;
  const FADE_MS = 180;
  const SLIDE_MS = 160;
  const CLEAR_MS = FLASH_MS + FADE_MS + SLIDE_MS;

  const ACTIONS = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'rotate', KeyW: 'rotate',
    ArrowDown: 'down', KeyS: 'down',
    KeyP: 'pause',
    Enter: 'start', NumpadEnter: 'start',
  };

  const boardCanvas = document.getElementById('board');
  const boardCtx = boardCanvas.getContext('2d');
  const nextCanvas = document.getElementById('next');
  const nextCtx = nextCanvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayText = document.getElementById('overlay-text');
  const overlayButton = document.getElementById('overlay-button');
  const toast = document.getElementById('toast');
  const scoreText = document.getElementById('score');
  const linesText = document.getElementById('lines');
  const levelText = document.getElementById('level');

  boardCanvas.width = Tetris.BOARD_WIDTH * CELL;
  boardCanvas.height = Tetris.BOARD_HEIGHT * CELL;
  const previewCells = Math.max(...Tetris.PIECES.map((piece) => piece.shape.length)) + 1;
  nextCanvas.width = nextCanvas.height = previewCells * PREVIEW_CELL;

  let state = Tetris.createGame();
  let started = false;
  let sinceGravity = 0; // milliseconds since the piece last fell a row
  let lastFrameTime = null;
  let shownClear = null;
  let clearing = null; // the row-clear animation in progress: { rows, before, start, elapsed }
  let overlayAction = null;

  function newGame(seed) {
    state = Tetris.createGame(seed);
    started = true;
    sinceGravity = 0;
    shownClear = null;
    clearing = null;
    hideOverlay();
    update();
  }

  function togglePause() {
    Tetris.togglePause(state);
    if (state.paused) showOverlay('Paused', 'Press P to keep playing.', 'Resume', togglePause);
    else hideOverlay();
    update();
  }

  function showOverlay(title, text, buttonLabel, action) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    overlayButton.textContent = buttonLabel;
    overlayAction = action;
    overlay.classList.remove('hidden');
  }

  function hideOverlay() {
    overlay.classList.add('hidden');
    overlayAction = null;
  }

  function showToast(text) {
    toast.textContent = text;
    toast.classList.remove('show');
    void toast.offsetWidth; // restarts the CSS animation
    toast.classList.add('show');
  }

  // Brings the screen up to date after anything changes.
  function update() {
    scoreText.textContent = state.score.toLocaleString();
    linesText.textContent = state.lines;
    levelText.textContent = state.level;

    if (state.lastClear && state.lastClear !== shownClear) {
      shownClear = state.lastClear;
      clearing = { rows: shownClear.rows, before: shownClear.before, start: null, elapsed: 0 };
      const name = CLEAR_NAMES[Math.min(shownClear.lines, CLEAR_NAMES.length - 1)];
      showToast(`${name}\n+${shownClear.points.toLocaleString()}`);
    }

    if (started && state.over && overlayAction === null) {
      showOverlay('Game over', `You scored ${state.score.toLocaleString()} points.`,
                  'Play again', () => newGame());
    }
    draw();
  }

  // A square with a light top-left edge and a dark bottom-right edge, optionally washed with white.
  function drawBlock(ctx, px, py, size, color, whiteness = 0) {
    const edge = Math.max(2, Math.round(size / 8));
    ctx.fillStyle = color;
    ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(px + 1, py + 1, size - 2, edge);
    ctx.fillRect(px + 1, py + 1, edge, size - 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(px + 1, py + size - 1 - edge, size - 2, edge);
    ctx.fillRect(px + size - 1 - edge, py + 1, edge, size - 2);
    if (whiteness > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${whiteness})`;
      ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
    }
  }

  // Draws one row of the board. `y` can be fractional while rows are sliding down.
  function drawRow(row, y, whiteness = 0) {
    row.forEach((color, x) => {
      if (color) drawBlock(boardCtx, x * CELL, y * CELL, CELL, color, whiteness);
    });
  }

  function drawBackground() {
    const { width, height } = boardCanvas;
    boardCtx.fillStyle = '#10121b';
    boardCtx.fillRect(0, 0, width, height);

    boardCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    boardCtx.lineWidth = 1;
    boardCtx.beginPath();
    for (let x = 1; x < Tetris.BOARD_WIDTH; x++) {
      boardCtx.moveTo(x * CELL + 0.5, 0);
      boardCtx.lineTo(x * CELL + 0.5, height);
    }
    for (let y = 1; y < Tetris.BOARD_HEIGHT; y++) {
      boardCtx.moveTo(0, y * CELL + 0.5);
      boardCtx.lineTo(width, y * CELL + 0.5);
    }
    boardCtx.stroke();
  }

  // One frame of the row-clear animation, drawn from the board as it was before the rows cleared.
  function drawClearing({ rows, before, elapsed }) {
    if (elapsed < FLASH_MS) {
      const whiteness = elapsed / FLASH_MS;
      before.forEach((row, y) => drawRow(row, y, rows.includes(y) ? whiteness : 0));
    } else if (elapsed < FLASH_MS + FADE_MS) {
      // Each full row is now a white bar that fades out as it shrinks toward its middle.
      const left = 1 - (elapsed - FLASH_MS) / FADE_MS;
      before.forEach((row, y) => {
        if (!rows.includes(y)) {
          drawRow(row, y);
          return;
        }
        const height = CELL * left;
        boardCtx.fillStyle = `rgba(255, 255, 255, ${left})`;
        boardCtx.fillRect(0, y * CELL + (CELL - height) / 2, boardCanvas.width, height);
      });
    } else {
      // Each remaining row slides down by the number of cleared rows beneath it.
      const t = Math.min(1, (elapsed - FLASH_MS - FADE_MS) / SLIDE_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      before.forEach((row, y) => {
        if (rows.includes(y)) return;
        const gap = rows.filter((cleared) => cleared > y).length;
        drawRow(row, y + gap * eased);
      });
    }
  }

  function draw() {
    drawBackground();
    if (clearing) {
      drawClearing(clearing);
    } else {
      state.board.forEach((row, y) => drawRow(row, y));
      if (started) {
        const piece = state.current;
        const color = Tetris.PIECES[piece.type].color;
        for (const [x, y] of Tetris.cellsOf(piece.shape, piece.x, piece.y)) {
          if (y >= 0) drawBlock(boardCtx, x * CELL, y * CELL, CELL, color);
        }
      }
    }
    drawNext();
  }

  // Draws the upcoming piece centered in the "Next" box.
  function drawNext() {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    const piece = Tetris.PIECES[state.nextType];
    const cells = Tetris.cellsOf(Tetris.parseShape(piece.shape), 0, 0);
    const xs = cells.map(([x]) => x);
    const ys = cells.map(([, y]) => y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const across = Math.max(...xs) - minX + 1;
    const down = Math.max(...ys) - minY + 1;
    const left = (nextCanvas.width - across * PREVIEW_CELL) / 2;
    const top = (nextCanvas.height - down * PREVIEW_CELL) / 2;
    for (const [x, y] of cells) {
      drawBlock(nextCtx, left + (x - minX) * PREVIEW_CELL, top + (y - minY) * PREVIEW_CELL,
                PREVIEW_CELL, piece.color);
    }
  }

  // Runs every animation frame: plays the row-clear animation, or applies gravity when it's time.
  function frame(time) {
    if (clearing) {
      if (clearing.start === null) clearing.start = time;
      clearing.elapsed = time - clearing.start;
      if (clearing.elapsed >= CLEAR_MS) {
        clearing = null;
        sinceGravity = 0; // the next piece gets a full step before it starts to fall
      }
      draw();
    } else if (lastFrameTime !== null && started && !state.over && !state.paused) {
      sinceGravity += Math.min(time - lastFrameTime, 250);
      let fell = false;
      while (!state.over && sinceGravity >= Tetris.gravityInterval(state.level)) {
        sinceGravity -= Tetris.gravityInterval(state.level);
        Tetris.tick(state);
        fell = true;
        if (state.lastClear !== shownClear) break; // rows cleared: animate before going on
      }
      if (fell) update();
    }
    lastFrameTime = time;
    requestAnimationFrame(frame);
  }

  document.addEventListener('keydown', (event) => {
    const action = ACTIONS[event.code];
    if (!action || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault(); // keeps the arrow keys from scrolling the page

    if (!started || state.over) {
      if (action === 'start') newGame();
      return;
    }
    if (clearing) return; // wait for the row-clear animation to finish

    // Holding left, right or down keeps the piece moving; holding the other keys does nothing
    // extra. Holding down also won't lock a piece that has landed; that takes a fresh press.
    if (event.repeat && !['left', 'right', 'down'].includes(action)) return;
    if (event.repeat && action === 'down' && Tetris.dropDistance(state) === 0) return;

    if (action === 'pause' || (action === 'start' && state.paused)) {
      togglePause();
      return;
    }
    if (state.paused) return;

    if (action === 'left') Tetris.move(state, -1);
    else if (action === 'right') Tetris.move(state, 1);
    else if (action === 'rotate') Tetris.rotate(state);
    else if (action === 'down') Tetris.softDrop(state);
    update();
  });

  overlayButton.addEventListener('click', () => {
    overlayButton.blur(); // otherwise Enter or Space would "click" it again during play
    if (overlayAction) overlayAction();
  });

  // For the end-to-end tests: lets them look at the game and set up exact situations.
  window.game = {
    get state() { return state; },
    get started() { return started; },
    get clearing() { return clearing !== null; },
    newGame,
    setBoard(rows) {
      Tetris.setBoard(state, rows);
      update();
    },
    setPiece(name) {
      Tetris.spawn(state, Tetris.PIECES.findIndex((piece) => piece.name === name));
      update();
    },
  };

  showOverlay('Ready?', 'Press Enter to start.', 'Start', () => newGame());
  update();
  requestAnimationFrame(frame);
})();
