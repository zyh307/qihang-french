const selector='uni-button,button,[role="button"]';
const pendingFavorites=new Map();
const reduced=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const disabled=el=>!el||el.getAttribute('aria-disabled')==='true'||(el.hasAttribute('disabled')&&el.getAttribute('disabled')!=='false');
const activeEffects=new Set();
function animate(el,frames,options){
 if(!el?.animate||reduced())return null;
 const effect=el.animate(frames,options);activeEffects.add(effect);
 const done=()=>activeEffects.delete(effect);effect.onfinish=done;effect.oncancel=done;return effect;
}
export function knownRipple(x,y,button){
 if(reduced()||!button)return;const rect=button.getBoundingClientRect(),size=Math.hypot(rect.width,rect.height)*2;
 const clip=document.createElement('span');clip.className='known-button-wave';clip.setAttribute('aria-hidden','true');const ripple=document.createElement('span');ripple.className='known-touch-ripple';ripple.style.cssText='left:'+(x-rect.left)+'px;top:'+(y-rect.top)+'px;width:'+size+'px;height:'+size+'px;margin:'+(-size/2)+'px';clip.appendChild(ripple);button.appendChild(clip);setTimeout(()=>clip.remove(),650);
}
export function celebrateFavorite(el,key){
 const pending=pendingFavorites.get(key);
 if(!pending)return;
 pendingFavorites.delete(key);
 if(Date.now()-pending.at>10000||reduced())return;
 const target=pending.icon?.isConnected?pending.icon:el;
 animate(target,[{transform:'scale(1)'},{transform:'scale(1.3)',offset:.35},{transform:'scale(.93)',offset:.66},{transform:'scale(1.05)',offset:.84},{transform:'scale(1)'}],{duration:460,easing:'cubic-bezier(.22,.7,.3,1)'});
 const burst=document.createElement('span');burst.className='favorite-particles';burst.setAttribute('aria-hidden','true');
 burst.style.left=pending.x+'px';burst.style.top=pending.y+'px';
 for(let i=0;i<10;i++){
  const dot=document.createElement('i'),angle=i*Math.PI/5;
  dot.style.setProperty('--dx',Math.cos(angle)*(i%2?30:24)+'px');dot.style.setProperty('--dy',Math.sin(angle)*(i%2?30:24)+'px');
  const colors=document.documentElement.dataset.colorTheme&&document.documentElement.dataset.colorTheme!=='mist'?['var(--accent)','rgba(var(--theme-rgb),.55)','var(--theme-border)']:['#92a8d5','#e4b7c6','#c4b1dc'];dot.style.setProperty('--particle-color',colors[i%3]);burst.appendChild(dot);
 }
 document.body.appendChild(burst);setTimeout(()=>burst.remove(),600);
}
export function installInteractionMotion(){
 const button=target=>target?.closest?.(selector);
 const down=e=>{if(e.button!==0)return;const el=button(e.target);if(disabled(el))return;if(el.matches('.known-action,[data-known-action]'))knownRipple(e.clientX,e.clientY,el);};
 const click=e=>{
  const el=button(e.target);if(disabled(el))return;
  const icon=el.querySelector('[data-success-key]');
  if(icon&&icon.getAttribute('data-success-active')==='false'){
   const rect=icon.getBoundingClientRect();pendingFavorites.set(icon.getAttribute('data-success-key'),{at:Date.now(),icon,x:rect.left+rect.width/2,y:rect.top+rect.height/2});
   for(const [key,value]of pendingFavorites)if(Date.now()-value.at>10000)pendingFavorites.delete(key);
  }
 };
 document.addEventListener('pointerdown',down,{capture:true,passive:true});document.addEventListener('click',click,true);
 return()=>{document.removeEventListener('pointerdown',down,true);document.removeEventListener('click',click,true);for(const effect of activeEffects)effect.cancel();activeEffects.clear();pendingFavorites.clear();document.querySelectorAll('.favorite-particles,.known-button-wave').forEach(el=>el.remove());};
}
