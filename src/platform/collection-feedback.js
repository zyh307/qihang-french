// The collection effect must outlive the definition card that triggered it.
export function finishCollection(element) {
  if (!element?.cloneNode || !document.body) return;
  const layer = document.createElement('div'), target = element.cloneNode(true);
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, {position:'fixed',inset:'0',zIndex:'270',pointerEvents:'none'});
  target.classList.remove('accepted');
  target.classList.add('ready');
  target.style.setProperty('--near', '1');
  layer.appendChild(target);
  document.body.appendChild(layer);
  let timer, frame;
  const remove = () => { clearTimeout(timer); cancelAnimationFrame(frame); layer.remove(); };
  target.querySelector('.drop-core')?.addEventListener('animationend', remove, {once:true});
  frame = requestAnimationFrame(() => target.classList.add('accepted'));
  timer = setTimeout(remove, 650);
}
