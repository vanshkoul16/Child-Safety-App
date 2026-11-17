/* =========================================================
   SafeHaven - motion helpers
   Entrance animations are switched on for a moment and then
   off again, so the frequent live re-renders (every few
   seconds) never replay them. CSS: .is-entering in app.css.
   ========================================================= */

export const prefersReducedMotion = () =>
  Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/* Cascades the element's children in once (see the .is-entering rules in app.css) */
export function playEnter(el, ms = 1000) {
  if (!el || prefersReducedMotion()) return;
  el.classList.remove('is-entering');
  void el.offsetWidth; // restart the animation if it is already running
  el.classList.add('is-entering');
  clearTimeout(el._enterTimer);
  el._enterTimer = setTimeout(() => el.classList.remove('is-entering'), ms);
}
