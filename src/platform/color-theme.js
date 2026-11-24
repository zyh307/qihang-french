import themeCSS from '../ui-palette.css?inline';
import themePresets from '../theme/presets.json';
export const COLOR_THEMES=Object.freeze(themePresets);
const storageKey='qihang-color-theme';
export const colorThemeId=value=>COLOR_THEMES.some(theme=>theme.id===value)?value:'mist';
function themeFrame(frame,id){
 try{
  if(frame.contentWindow?.location.origin!==location.origin)return;
  const doc=frame.contentDocument;if(!doc?.head)return;
  doc.documentElement.dataset.colorTheme=id;
  let style=doc.getElementById('qihang-color-theme');
  if(!style){style=doc.createElement('style');style.id='qihang-color-theme';style.textContent=themeCSS;doc.head.appendChild(style);}
 }catch{/* Embedded external pages keep their own appearance. */}
}
export function applyColorTheme(value){
 const id=colorThemeId(value);document.documentElement.dataset.colorTheme=id;
 try{localStorage.setItem(storageKey,id);}catch{/* IndexedDB remains the authoritative preference. */}
 document.querySelectorAll('iframe.oral-local-frame').forEach(frame=>themeFrame(frame,id));
 return id;
}
export function installColorTheme(){
 let saved='mist';try{saved=localStorage.getItem(storageKey);}catch{}
 applyColorTheme(saved);
 const load=event=>{if(event.target?.matches?.('iframe.oral-local-frame'))themeFrame(event.target,colorThemeId(document.documentElement.dataset.colorTheme));};
 document.addEventListener('load',load,true);
 return()=>document.removeEventListener('load',load,true);
}
