// The pictures to make puzzles from, shown in a shuffled order. This is the only list of them: it
// runs both in the browser (where it defines window.PICTURES for ui.js) and in Node (where the
// tests require() it), so adding or removing a picture here is all it takes.
(function () {
  'use strict';

  // Each name finishes the sentence "That's ...!"
  // lookAlikes lists pieces that look exactly the same: in the logo, three are plain maroon.
  const PICTURES = [
    { file: 'images/cs193v.png', name: 'the CS193V logo', lookAlikes: [[2, 7, 14]] },
  ];

  if (typeof module === 'object' && module.exports) module.exports = PICTURES;
  else globalThis.PICTURES = PICTURES;
})();
