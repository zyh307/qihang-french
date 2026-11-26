const previousBounds=new WeakMap();

export function rememberFadeBounds(panel){
  if(panel&&!panel.inert&&!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
    previousBounds.set(panel,panel.getBoundingClientRect());
  }
}

export function retireFadePane(panel){
  const stage=panel.parentElement;
  if(!stage?.classList.contains('fade-stage'))return;
  panel.inert=true;
  panel.setAttribute('aria-hidden','true');
  const previous=previousBounds.get(panel);
  previousBounds.delete(panel);
  if(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;

  // Let the new pane take its place while the old one fades at its original size.
  const stageBox=previous&&stage.getBoundingClientRect();
  const top=previous?previous.top-stageBox.top+stage.scrollTop-stage.clientTop:panel.offsetTop;
  const left=previous?previous.left-stageBox.left+stage.scrollLeft-stage.clientLeft:panel.offsetLeft;
  Object.assign(panel.style,{
    position:'absolute',
    top:top+'px',
    left:left+'px',
    width:(previous?.width??panel.offsetWidth)+'px',
    height:(previous?.height??panel.offsetHeight)+'px',
    maxWidth:'none',
    maxHeight:'none',
    margin:'0',
    boxSizing:'border-box'
  });
}
