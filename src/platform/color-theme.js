import paletteCSS from '../color-themes.css?inline';
import textCSS from '../theme-text-colors.css?inline';
const themeCSS=paletteCSS+'\n'+textCSS;
export const COLOR_THEMES=Object.freeze([
 {id:'mist',zh:'雾蓝',fr:'Bleu brume',paper:'#f4f5fb',soft:'#e7eefb',accent:'#6474b1',ink:'#344766'},
 {id:'sage',zh:'鼠尾草绿',fr:'Vert sauge',paper:'#f2f6f3',soft:'#e5eee8',accent:'#5d7d6c',ink:'#354b40'},
 {id:'apricot',zh:'暖杏',fr:'Abricot doux',paper:'#faf5ef',soft:'#f2e6d9',accent:'#947056',ink:'#554438'},
 {id:'lilac',zh:'柔雾紫',fr:'Lilas doux',paper:'#f6f3f9',soft:'#eae3f2',accent:'#7f6b99',ink:'#49405a'},
 {id:'rose',zh:'玫瑰粉',fr:'Rose poudré',paper:'#fbf3f6',soft:'#f3e2e9',accent:'#9b5f79',ink:'#5b3e4c'}
]);
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
