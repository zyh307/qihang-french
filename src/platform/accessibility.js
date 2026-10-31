import {playTap} from './feedback-sounds.js';
export function accessibleButtons() {
  // uni-app injects its component defaults after App.vue's CSS. Reset only the
  // low-specificity button defaults after mount; authored class styles still win.
  const style = document.createElement('style');
  style.textContent = 'uni-button{margin:0;padding:0;border:0;border-radius:0;background:none;color:inherit;line-height:1.4;font:inherit;text-align:left;letter-spacing:normal}uni-button::after{border:0}';
  document.head.appendChild(style);
  let layoutHeight=window.innerHeight,layoutWidth=window.innerWidth,keyboardOpen=false,focusTimer,anchorX=window.scrollX,anchorY=window.scrollY;
  const editing=()=>document.activeElement?.matches?.('input,textarea,[contenteditable=true]');
  const keepPosition=()=>{if(keyboardOpen&&(window.scrollX!==anchorX||window.scrollY!==anchorY))window.scrollTo(anchorX,anchorY);};
  const viewport=()=>{
    const width=window.innerWidth,height=window.innerHeight,visible=window.visualViewport?.height||height;
    const compact=Math.min(height,visible)<layoutHeight-80,focused=editing();
    if(Math.abs(width-layoutWidth)>80){layoutWidth=width;layoutHeight=height;}
    else if(!focused&&!compact)layoutHeight=height;
    keyboardOpen=!!focused||compact;
    document.documentElement.style.setProperty('--app-height',`${layoutHeight}px`);
    document.documentElement.classList.toggle('keyboard-stable',keyboardOpen);
    keepPosition();
  };
  const focusIn=event=>{if(!event.target?.matches?.('input,textarea,[contenteditable=true]'))return;clearTimeout(focusTimer);anchorX=window.scrollX;anchorY=window.scrollY;viewport();};
  const focusOut=()=>{clearTimeout(focusTimer);focusTimer=setTimeout(viewport,250);};
  viewport();window.addEventListener('resize',viewport);window.addEventListener('scroll',keepPosition,{passive:true});window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',keepPosition);document.addEventListener('focusin',focusIn);document.addEventListener('focusout',focusOut);
  const resumeFrame=()=>{
    if(document.visibilityState==='hidden')return;
    requestAnimationFrame(()=>{
      viewport();
      // Complete only interrupted page transitions; keep the current page,
      // card state, text cursor and ongoing input intact.
      for(const animation of document.getAnimations?.()||[]){
        const target=animation.effect?.target,timing=animation.effect?.getTiming();
        if(timing?.iterations!==Infinity&&/(?:page-fade|panel-switch|lesson-entrance|recognition-sheet|definition-sheet|word-switch)-.*active/.test(target?.className||''))try{animation.finish();}catch{}
      }
      requestAnimationFrame(viewport);
    });
  };
  document.addEventListener('visibilitychange',resumeFrame);window.addEventListener('pageshow',resumeFrame);window.addEventListener('qihang-resume',resumeFrame);
  const pulses=new Set();
  const pulse=event=>{
    const button=event.target.closest?.('uni-button,[role="button"]');if(!button||button.getAttribute('disabled')==='true'||button.getAttribute('aria-disabled')==='true')return;
    if(button.closest?.('[data-manual-tap]'))return;
    playTap();
    button.classList.remove('tap-feedback');void button.offsetWidth;button.classList.add('tap-feedback');
    const timer=setTimeout(()=>{button.classList.remove('tap-feedback');pulses.delete(timer);},350);pulses.add(timer);
  };
  document.addEventListener('click',pulse,true);
  const inputSound=event=>{if(event.target?.matches?.('input,textarea'))playTap();};
  const enterSound=event=>{if(event.key==='Enter'&&event.target?.matches?.('input,textarea'))playTap();};
  document.addEventListener('input',inputSound,true);document.addEventListener('keydown',enterSound,true);
  const bound = new WeakSet();
  const update = (root=document) => (root.matches?.('uni-button')?[root]:root.querySelectorAll?.('uni-button')||[]).forEach(el => {
    const disabled = el.getAttribute('disabled') === 'true';
    el.setAttribute('role', 'button'); el.setAttribute('aria-disabled', String(disabled)); el.tabIndex = disabled ? -1 : 0;
    if (!bound.has(el)) { bound.add(el); el.addEventListener('keydown', e => { if (e.target === el && ['Enter',' '].includes(e.key)) { e.preventDefault(); if (el.getAttribute('disabled') !== 'true') el.click(); } }); }
  });
  update(); const observer = new MutationObserver(records=>{for(const record of records){if(record.type==='attributes')update(record.target);else for(const node of record.addedNodes)if(node.nodeType===1)update(node);}}); observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
  return () => { document.removeEventListener('visibilitychange',resumeFrame);window.removeEventListener('pageshow',resumeFrame);window.removeEventListener('qihang-resume',resumeFrame);clearTimeout(focusTimer);document.documentElement.classList.remove('keyboard-stable');window.removeEventListener('scroll',keepPosition);window.visualViewport?.removeEventListener('scroll',keepPosition);document.removeEventListener('focusin',focusIn);document.removeEventListener('focusout',focusOut);observer.disconnect(); style.remove();window.removeEventListener('resize',viewport);window.visualViewport?.removeEventListener('resize',viewport);document.removeEventListener('click',pulse,true);document.removeEventListener('input',inputSound,true);document.removeEventListener('keydown',enterSound,true);for(const timer of pulses)clearTimeout(timer); };
}
