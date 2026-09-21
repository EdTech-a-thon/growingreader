/**
 * Holds the page still behind a dialog. Counted, because dialogs stack — the conversion
 * instructions open over the import list — and the page must stay held until the last
 * one closes.
 */
let open = 0;

export function lockScroll(): () => void {
  if (open++ === 0) document.body.classList.add('modal-open');
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--open === 0) document.body.classList.remove('modal-open');
  };
}

/** Test seam: jsdom keeps one body across renders in a file. */
export function resetScrollLockForTest() {
  open = 0;
  document.body.classList.remove('modal-open');
}
