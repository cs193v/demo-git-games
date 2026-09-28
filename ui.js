// Builds the board and the tray, and lets the player drag pieces between them. The rules are in
// logic.js, and the pictures are listed in pictures.js.
(function () {
  'use strict';

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

  nextButton.textContent = PICTURES.length > 1 ? 'Next puzzle' : 'Play again';

  // Load every picture now, so each new puzzle appears at once.
  for (const picture of PICTURES) new Image().src = picture.file;

  let playlist = Jigsaw.createPlaylist(PICTURES.length, Math.random);
  let puzzle;
  let pieces; // pieces[n] is the element for piece n
  let solved;
  let drag = null; // the piece being dragged: { piece, from, x, y, target }

  const currentPicture = () => PICTURES[Jigsaw.currentPicture(playlist)];

  function startPuzzle() {
    pieces = Array.from({ length: Jigsaw.PIECES }, (_, n) => makePiece(n, currentPicture()));
    puzzle = Jigsaw.createPuzzle(Math.random);
    solved = false;
    win.classList.add('hidden');
    document.body.classList.remove('solved');
    render();
  }

  // A piece shows its own square of the picture. The picture is drawn at 4 times the piece's
  // size and shifted so the right part shows through.
  function makePiece(n, picture) {
    const piece = document.createElement('div');
    piece.className = 'piece';
    piece.dataset.piece = n;
    piece.style.backgroundImage = `url("${picture.file}")`;
    const x = (Jigsaw.pieceCol(n) * 100) / (Jigsaw.COLS - 1);
    const y = (Jigsaw.pieceRow(n) * 100) / (Jigsaw.ROWS - 1);
    piece.style.backgroundPosition = `${x}% ${y}%`;
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
    winText.textContent = `That's ${currentPicture().name}!`;
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

    if (Jigsaw.isSolved(puzzle, currentPicture().lookAlikes)) finish();
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

  nextButton.addEventListener('click', () => {
    playlist = Jigsaw.nextPicture(playlist, Math.random);
    startPuzzle();
  });

  // For the end-to-end tests: lets them look at the puzzle and find the squares on the page.
  window.game = {
    get puzzle() { return puzzle; },
    get solved() { return solved; },
    get picture() { return currentPicture().file; },
    squareCenter(area, index) {
      const rect = squares[area][index].getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    },
  };

  startPuzzle();
})();
