// The pictures to make puzzles from, shown in a shuffled order. This is the only list of them: it
// runs both in the browser (where it defines window.PICTURES for ui.js) and in Node (where the
// tests require() it), so adding or removing a picture here is all it takes.
(function () {
  'use strict';

  // Each name finishes the sentence "That's ...!"
  const PICTURES = [
    { file: 'images/kitten.jpg', name: 'a kitten' },
    { file: 'images/sea-otter.jpg', name: 'a sea otter' },
    { file: 'images/red-panda.jpg', name: 'a red panda' },
    { file: 'images/ducklings.jpg', name: 'some ducklings' },
    { file: 'images/hedgehog.jpg', name: 'a hedgehog' },
    { file: 'images/kirks-dikdik.jpg', name: "a Kirk's dik-dik" },
  ];

  if (typeof module === 'object' && module.exports) module.exports = PICTURES;
  else globalThis.PICTURES = PICTURES;
})();
