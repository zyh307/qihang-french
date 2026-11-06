// Fit both sides independently without changing the card or its flip animation.
const states = new WeakMap();
function fit(el) {
  const face = el.parentElement;
  if (!face || !face.clientWidth) return;
  el.style.fontSize = '';
  const style = getComputedStyle(face);
  const width = face.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const siblings = [...face.children].filter(child => child !== el && getComputedStyle(child).position !== 'absolute');
  const height = face.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
    - siblings.reduce((sum, child) => sum + child.offsetHeight, 0)
    - siblings.length * (parseFloat(style.rowGap) || 0);
  const textStyle = getComputedStyle(el);
  let size = parseFloat(textStyle.fontSize);
  const context = document.createElement('canvas').getContext('2d');
  if (context) {
    context.font = `${textStyle.fontStyle} ${textStyle.fontWeight} ${size}px ${textStyle.fontFamily}`;
    const longest = Math.max(...el.textContent.split(/\s+/).map(token => context.measureText(token).width));
    if (longest > width) { size = Math.max(8, Math.floor(size * (width - 1) / longest * 2) / 2); el.style.fontSize = size + 'px'; }
  }
  // Half-pixel steps preserve the normal font size whenever the text already fits.
  while (size > 8 && (el.scrollWidth > width + 1 || el.scrollHeight > height + 1)) {
    size = Math.max(8, size - .5);
    el.style.fontSize = size + 'px';
  }
  // Reserve the meaning's natural height before fitting French. If even the
  // smallest French text cannot fit, grow this card rather than clip any row.
  if (el.scrollHeight > height + 1) {
    const card = face.closest('.recitation-card');
    if (card) card.style.minHeight = Math.ceil(face.offsetHeight + el.scrollHeight - height + 2) + 'px';
  }
}
export const vFitCardText = {
  mounted(el) {
    let frame;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { fit(el); const state = states.get(el); if (state) state.content = el.parentElement?.textContent; }); };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    observer?.observe(el.parentElement);
    window.addEventListener('resize', schedule);
    document.fonts?.ready.then(() => { if (states.has(el)) schedule(); });
    states.set(el, { schedule, dispose: () => { observer?.disconnect(); window.removeEventListener('resize', schedule); cancelAnimationFrame(frame); } });
    schedule();
  },
  updated(el, binding) { const state=states.get(el); if (binding.value !== binding.oldValue || el.parentElement?.textContent !== state?.content) state?.schedule(); },
  unmounted(el) { states.get(el)?.dispose(); states.delete(el); }
};
