// Builds the board and the tray, and lets the player drag tiles between them. The rules are in
// logic.js. (In the code, a tile is called a piece, like the jigsaw pieces it's modeled on.)
(function () {
  'use strict';

  // One color for each digit, from the resistor color code, and a text color that shows up on it.
  const DIGIT_COLORS = [
    { fill: '#2b2b2b', text: '#fff' }, // 0 black
    { fill: '#8b5a2b', text: '#fff' }, // 1 brown
    { fill: '#d93a3a', text: '#fff' }, // 2 red
    { fill: '#f28c28', text: '#1d1d1d' }, // 3 orange
    { fill: '#f5d547', text: '#1d1d1d' }, // 4 yellow
    { fill: '#3aa655', text: '#fff' }, // 5 green
    { fill: '#3b73d9', text: '#fff' }, // 6 blue
    { fill: '#8e5bd1', text: '#fff' }, // 7 violet
    { fill: '#9a9a9a', text: '#1d1d1d' }, // 8 gray
    { fill: '#f7f7f2', text: '#1d1d1d' }, // 9 white
  ];
  // Each side of a tile is a triangle reaching to the middle. These are its corners in a 100 × 100
  // box, and where its digit goes.
  const SIDES = [
    { side: 'top', points: '0,0 100,0 50,50', x: 50, y: 22 },
    { side: 'right', points: '100,0 100,100 50,50', x: 79, y: 50 },
    { side: 'bottom', points: '0,100 100,100 50,50', x: 50, y: 79 },
    { side: 'left', points: '0,0 0,100 50,50', x: 21, y: 50 },
  ];
  const GLIDE_MS = 160; // how long a dropped piece takes to settle into its square

  const boardGrid = document.getElementById('board');
  const trayGrid = document.getElementById('tray');
  const win = document.getElementById('win');
  const winText = document.getElementById('win-text');
  const nextButton = document.getElementById('next');

  // The squares of each area, as elements. A piece is in a square when it's that square's child.
  const squares = { board: [], tray: [] };
  for (const [area, grid] of [['board', boardGrid], ['tray', trayGrid]]) {
    for (let index = 0; index < Jigsaw.PIECES; index++) {
      const square = document.createElement('div');
      square.className = 'slot';
      square.dataset.area = area;
      square.dataset.index = index;
      grid.append(square);
      squares[area].push(square);
    }
  }

  let tiles; // tiles[n] is the { top, right, bottom, left } digits of tile n
  let puzzle;
  let pieces; // pieces[n] is the element for piece n
  let solved;
  let drag = null; // the piece being dragged: { piece, from, x, y, target }

  function startPuzzle() {
    tiles = Jigsaw.createTetravex(Math.random);
    pieces = tiles.map((_, n) => makePiece(n));
    puzzle = Jigsaw.createPuzzle(Math.random);
    solved = false;
    win.classList.add('hidden');
    document.body.classList.remove('solved');
    render();
  }

  // A tile shows its four digits, each in a triangle of that digit's color.
  function makePiece(n) {
    const piece = document.createElement('div');
    piece.className = 'piece';
    piece.dataset.piece = n;
    const sides = SIDES.map(({ side, points, x, y }) => {
      const digit = tiles[n][side];
      const { fill, text } = DIGIT_COLORS[digit];
      return `<polygon points="${points}" fill="${fill}" data-side="${side}"></polygon>` +
        `<text x="${x}" y="${y}" fill="${text}" data-side="${side}">${digit}</text>`;
    });
    piece.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true">${sides.join('')}</svg>`;
    return piece;
  }

  // Puts every piece element into the square the puzzle says it's in.
  function render() {
    for (const area of ['board', 'tray']) {
      puzzle[area].forEach((n, index) => {
        const square = squares[area][index];
        if (n === null) square.replaceChildren();
        else if (square.firstChild !== pieces[n]) square.replaceChildren(pieces[n]);
      });
    }
  }

  function finish() {
    solved = true;
    winText.textContent = 'Every edge matches!';
    win.classList.remove('hidden');
    document.body.classList.add('solved');
  }

  // ---- Dragging ----

  const whereIs = (square) => ({ area: square.dataset.area, index: Number(square.dataset.index) });

  function squareAt(x, y) {
    return document.elementsFromPoint(x, y).find((element) => element.classList.contains('slot')) ?? null;
  }

  // Lights up the square the dragged piece would land in.
  function setTarget(square) {
    if (square === drag.target) return;
    drag.target?.classList.remove('target');
    square?.classList.add('target');
    drag.target = square;
  }

  document.addEventListener('pointerdown', (event) => {
    const piece = event.target.closest('.piece');
    if (!piece || solved || drag) return;
    event.preventDefault();
    drag = { piece, from: whereIs(piece.parentElement), x: event.clientX, y: event.clientY, target: null };
    piece.setPointerCapture(event.pointerId);
    piece.classList.add('dragging');
    document.body.classList.add('grabbing');
  });

  document.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.piece.style.transform = `translate(${dx}px, ${dy}px) scale(1.06)`;
    setTarget(squareAt(event.clientX, event.clientY));
  });

  document.addEventListener('pointerup', (event) => {
    if (drag) drop(squareAt(event.clientX, event.clientY));
  });

  document.addEventListener('pointercancel', () => {
    if (drag) drop(null);
  });

  // Ends a drag. The piece snaps into the square it was dropped on, trading places with any piece
  // already there. Dropped anywhere else, it glides back to where it came from.
  function drop(square) {
    const { piece, from } = drag;
    setTarget(null);
    drag = null;
    document.body.classList.remove('grabbing');

    const droppedAt = piece.getBoundingClientRect();
    piece.classList.remove('dragging');
    piece.style.transform = '';
    const other = square?.querySelector('.piece');
    const otherWasAt = other?.getBoundingClientRect();

    if (square) puzzle = Jigsaw.movePiece(puzzle, from, whereIs(square));
    render();
    glide(piece, droppedAt);
    if (other && other !== piece) glide(other, otherWasAt);

    if (Jigsaw.isSolved(puzzle)) finish();
  }

  // Animates an element from where it was (`from`, a DOMRect) to where it is now. Board squares
  // are a little bigger than tray squares, so it grows or shrinks on the way, too.
  function glide(element, from) {
    const to = element.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    const scale = from.width / to.width;
    element.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, transformOrigin: 'top left' },
      { transform: 'none', transformOrigin: 'top left' },
    ], { duration: GLIDE_MS, easing: 'ease-out' });
  }

  nextButton.addEventListener('click', startPuzzle);

  // For the end-to-end tests: lets them look at the puzzle and find the squares on the page.
  window.game = {
    get puzzle() { return puzzle; },
    get solved() { return solved; },
    get tiles() { return tiles; },
    squareCenter(area, index) {
      const rect = squares[area][index].getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    },
  };

  startPuzzle();
})();
