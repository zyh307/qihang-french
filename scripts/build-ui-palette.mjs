import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parse as parseVue} from '@vue/compiler-sfc';
import postcss from 'postcss';
import valueParser from 'postcss-value-parser';

// Preserve the original blue declaration at every use site. Other palettes
// change hue while retaining saturation, contrast and the alpha hierarchy.
const catalog='src/theme/palette-source.json',output='src/ui-palette.css';
const colors=fs.existsSync(catalog)?JSON.parse(fs.readFileSync(catalog,'utf8')):{};
const unused=new Set(['color-themes.css','theme-text-colors.css','theme-ui-colors.css','theme-controls.css','theme-feedback.css','ui-palette.css']);
const palettes={mist:225,sage:145,apricot:29,lilac:273,rose:335};
function role(selector){
 if(/gender-emphasis|sentence-mark|diff-part.*(?:accent|ligature)|choice-dot.familiar/.test(selector))return 'attention';
 if(/incorrect|wrong|\.no\b|error|recording|choice-dot.unknown/.test(selector))return 'negative';
 if(/correct|success|\.ok\b|ready|\.complete\b|known|achievement|status-dot|feedback-symbol/.test(selector))return 'positive';
 return 'base';
}
function rgb(text){
 if(text.startsWith('#')){let hex=text.slice(1);if(hex.length<=4)hex=[...hex].map(x=>x+x).join('');return [parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16),hex.length===8?parseInt(hex.slice(6),16)/255:1];}
 const parts=text.match(/[\d.]+/g).map(Number);return [...parts.slice(0,3),parts[3]??1];
}
function hsl([r,g,b]){
 r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2;
 const s=d===0?0:d/(1-Math.abs(2*l-1));let h=0;
 if(d)h=max===r?((g-b)/d+6)%6:max===g?(b-r)/d+2:(r-g)/d+4;
 return [h*60,s,l];
}
function linearLuminance(channels){return channels.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);}
function hslRgb(h,s,l){
 const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs(h/60%2-1)),m=l-c/2;
 const values=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];return values.map(v=>(v+m)*255);
}
function mapped(value,palette,kind='base'){
 if(palette==='mist')return value;
 const rgba=rgb(value),[oldHue,s,l]=hsl(rgba);let hue=palettes[palette];
 if(kind==='attention')hue={sage:49,apricot:43,lilac:47,rose:44}[palette];
 if(kind==='negative')hue={sage:11,apricot:9,lilac:348,rose:5}[palette];
 // Keep whites, blacks and transparent paint neutral, as in the blue design.
 const saturation=s,target=linearLuminance(rgba);let low=0,high=1;
 for(let i=0;i<28;i++){const mid=(low+high)/2;if(linearLuminance(hslRgb(hue,saturation,mid))<target)low=mid;else high=mid;}
 const lightness=(low+high)/2;
 return `hsla(${hue},${(saturation*100).toFixed(3)}%,${(lightness*100).toFixed(3)}%,${rgba[3].toFixed(5)})`;
}
function token(original,kind){
 const id=createHash('sha1').update(kind+'|'+original.toLowerCase()).digest('hex').slice(0,12);
 colors[id]={value:original,role:kind};return `var(--ui-${id},${original})`;
}
let filesChanged=0,decls=0;
function convert(css,filename){
 const root=postcss.parse(css,{from:filename});let changed=false;
 root.walkDecls(decl=>{
  if(!/^(?:--|color$|background|border|box-shadow|text-shadow|outline|fill$|stroke$|caret-color|accent-color|-webkit-text-fill-color)/.test(decl.prop))return;
  const selector=decl.parent.selector||'';
  // Book cover artwork and user-chosen share backgrounds retain their colors.
  if(/book-cover|home-cover|cover-series|cover-number|cover-caption/.test(selector))return;
  const kind=role(selector),tree=valueParser(decl.value);let found=false;
  tree.walk(node=>{
   if(node.type==='function'&&['var','url'].includes(node.value.toLowerCase()))return false;
   if(node.type==='word'&&/^#[\da-f]{3,8}$/i.test(node.value)){
    node.value=token(node.value,kind);found=true;return;
   }
   if(node.type==='function'&&/^rgba?$/i.test(node.value)){
    const original=valueParser.stringify(node);
    if(/^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*[\d.]+)?\s*\)$/i.test(original)){
     node.type='word';node.value=token(original,kind);delete node.nodes;found=true;return false;
    }
   }
  });
  if(found){decl.value=tree.toString();decls++;changed=true;}
 });
 return changed?root.toString():css;
}
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()&&!['static','lexicon','theme'].includes(e.name)?walk(path.join(dir,e.name)):e.isFile()&&/\.(vue|css)$/.test(e.name)&&!unused.has(e.name)?[path.join(dir,e.name)]:[]);}
for(const file of [...walk('src'),'oral-assistant/web/style.css']){
 let text=fs.readFileSync(file,'utf8'),next;
 if(file.endsWith('.vue')){
  const {descriptor,errors}=parseVue(text,{filename:file});if(errors.length)throw errors[0];
  next=text;for(const style of [...descriptor.styles].reverse())next=next.slice(0,style.loc.start.offset)+convert(style.content,file)+next.slice(style.loc.end.offset);
 }else next=convert(text,file);
 if(next!==text){fs.writeFileSync(file,next);filesChanged++;}
}
const base={
 '--theme-paper':'#f4f5fb','--theme-soft':'#e7eefb','--theme-panel':'#f8faff','--theme-border':'#d6e0ef',
 '--theme-icon':'#7185ab','--theme-icon-soft':'#8798b4','--theme-field':'#fbfcff','--theme-tint':'#eef2fa','--theme-nav':'rgba(249,251,255,.94)',
 '--theme-wash':'#e0e7f7','--theme-wash-alt':'#e8eff0','--theme-button-light':'#8896c6','--theme-button-dark':'#6474b1','--theme-ring-track':'#e6ecf6'
};
token('#78683f','attention');token('#fff6da','attention');
let css='/* Generated by build-ui-palette.mjs. Blue values are the original UI colors. */\n';
for(const [palette,hue]of Object.entries(palettes)){
 css+=(palette==='mist'?':root,html[data-color-theme="mist"]':`html[data-color-theme="${palette}"]`)+'{\n';
 for(const [id,c]of Object.entries(colors).sort(([a],[b])=>a.localeCompare(b)))css+=` --ui-${id}:${mapped(c.value,palette,c.role)};\n`;
 for(const [name,value]of Object.entries(base))css+=` ${name}:${mapped(value,palette)};\n`;
 const rgbAccent=palette==='mist'?'100,116,177':palette==='sage'?'93,125,108':palette==='apricot'?'148,112,86':palette==='lilac'?'127,107,153':'155,95,121';
 css+=` --theme-rgb:${rgbAccent};\n}\n`;
}
fs.mkdirSync(path.dirname(catalog),{recursive:true});fs.writeFileSync(catalog,JSON.stringify(colors,null,2)+'\n');fs.writeFileSync(output,css);
// Keep the quiet gender highlight scoped to the spelling prompt.
css+='html[data-color-theme] .spelling-prompt .gender-emphasis{color:'+token('#78683f','attention')+';background:'+token('#fff6da','attention')+'}\n';
fs.writeFileSync(output,css);
const names={mist:['雾蓝','Bleu brume'],sage:['鼠尾草绿','Vert sauge'],apricot:['暖杏','Abricot doux'],lilac:['柔雾紫','Lilas doux'],rose:['玫瑰粉','Rose poudré']};
fs.writeFileSync('src/theme/presets.json',JSON.stringify(Object.keys(palettes).map(id=>({id,zh:names[id][0],fr:names[id][1],paper:mapped('#f4f5fb',id),soft:mapped('#e7eefb',id),accent:mapped('#6474b1',id),ink:mapped('#27354e',id)})),null,2)+'\n');
console.log(JSON.stringify({colors:Object.keys(colors).length,filesChanged,declarationsConverted:decls,blue:'original values',palettes:Object.keys(palettes)}));
