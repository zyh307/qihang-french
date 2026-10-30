import {quotes} from '../domain/quotes.js';
import {themes,drawBackground} from './poster-backgrounds.js';
export {themes,themePreview} from './poster-backgrounds.js';
const WIDTH=1080,HEIGHT=1920,MARGIN=88,CONTENT=904;
export function wrapText(c,text,width){
  const tokens=text.match(/[\p{Script=Han}，。；！？、：]|[^\s\p{Script=Han}，。；！？、：]+\s*|\s+/gu)||[];
  const lines=[];let line='';
  for(const token of tokens){if(line&&c.measureText(line+token.trimEnd()).width>width){lines.push(line.trim());line='';}if(c.measureText(token.trim()).width>width){for(const char of token){if(line&&c.measureText(line+char).width>width){lines.push(line.trim());line='';}line+=char;}}else line+=token;}
  if(line.trim())lines.push(line.trim());return lines;
}
function textBlock(c,text,x,y,width,size,lineHeight,family='Arial',maxLines=Infinity){
  let lines;do{c.font=`${size}px ${family}`;lines=wrapText(c,text,width);if(lines.length<=maxLines||size<=15)break;size-=1;lineHeight-=1;}while(true);
  if(lines.length>maxLines){lines=lines.slice(0,maxLines);let last=lines.at(-1);while(c.measureText(last+'…').width>width)last=last.slice(0,-1);lines[lines.length-1]=last+'…';}
  for(const line of lines){c.fillText(line,x,y);y+=lineHeight;}return y;
}
export async function drawPoster({stats,theme='galaxy',message=0,custom,position=50,positionX=50,zoom=100,showWords=true,featuredWord=null,lessons=[]}){
  const canvas=document.createElement('canvas');canvas.width=WIDTH;canvas.height=HEIGHT;
  const c=canvas.getContext('2d'),palette=themes.find(t=>t.id===theme)||themes[0],quote=quotes[message]||quotes[0];
  drawBackground(c,palette);
  const dark=!!custom||palette.scene||palette.id==='ink',ink=dark?'#fff':palette.ink;
  if(custom){const img=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Photo indisponible'));image.src=custom;});const scale=Math.max(WIDTH/img.width,HEIGHT/img.height)*Math.max(1,zoom/100),w=img.width*scale,h=img.height*scale;c.drawImage(img,(WIDTH-w)*positionX/100,(HEIGHT-h)*position/100,w,h);}
  if(dark){const shade=c.createLinearGradient(0,0,0,HEIGHT);shade.addColorStop(0,'#050e2199');shade.addColorStop(.4,'#0c193b20');shade.addColorStop(.62,'#0c193b05');shade.addColorStop(1,'#091731d6');c.fillStyle=shade;c.fillRect(0,0,WIDTH,HEIGHT);}
  c.fillStyle=ink;c.textBaseline='alphabetic';
  if(showWords&&featuredWord){
    let y=textBlock(c,featuredWord.word,MARGIN,174,CONTENT,80,92,'Georgia',2);
    c.globalAlpha=.85;
    if(featuredWord.ipa)y=textBlock(c,featuredWord.ipa,MARGIN,y+6,CONTENT,26,37,'Arial',2);
    y=textBlock(c,`${featuredWord.pos}  ${featuredWord.meaning}`,MARGIN,y+8,CONTENT,29,42,'Arial',2);c.globalAlpha=1;
    y=textBlock(c,quote.fr,MARGIN,y+38,CONTENT,43,59,'Georgia',4);
    c.globalAlpha=.88;
    y=textBlock(c,quote.zh,MARGIN,y+15,CONTENT,29,43,'Arial',3);
    c.globalAlpha=.67;textBlock(c,`${quote.author} · ${quote.work}`,MARGIN,y+22,CONTENT,20,29,'Arial',2);c.globalAlpha=1;
  }else{
    let y=textBlock(c,quote.fr,MARGIN,174,CONTENT,53,73,'Georgia',5);
    c.globalAlpha=.88;y=textBlock(c,quote.zh,MARGIN,y+22,CONTENT,29,45,'Arial',3);
    c.globalAlpha=.67;textBlock(c,`${quote.author} · ${quote.work}`,MARGIN,y+18,CONTENT,20,29,'Arial',2);c.globalAlpha=1;
  }
  // Leave the central scenery free of text.
  c.font='24px Arial';c.fillText(stats.date.replaceAll('-','.'),MARGIN,1390);
  c.globalAlpha=.8;c.font='21px Arial';c.fillText('今日学习 · Mon apprentissage',MARGIN,1429);c.globalAlpha=1;
  const metrics=[[stats.today||0,'今日新词','Nouveaux mots'],[stats.reviews||0,'今日复习','Mots révisés'],[stats.days||0,'累计打卡','Jours d’étude']];
  for(let i=0;i<metrics.length;i++){const x=MARGIN+i*320,[value,zh,fr]=metrics[i];c.font='64px Arial';c.fillText(String(value),x,1542);c.font='25px Arial';c.fillText(zh,x,1590);c.globalAlpha=.7;c.font='19px Arial';c.fillText(fr,x,1623);c.globalAlpha=1;}
  let bottom=1655;
  if(lessons.length){c.globalAlpha=.8;bottom=textBlock(c,'今日完成 · Leçons du jour',MARGIN,bottom,CONTENT,19,28);c.globalAlpha=1;bottom=textBlock(c,lessons.join('  ·  '),MARGIN,bottom+4,CONTENT,23,32,'Arial',2)+8;}
  if(showWords&&stats.words?.length){c.globalAlpha=.8;textBlock(c,stats.words.slice(0,6).join('  ·  '),MARGIN,bottom,CONTENT,22,31,'Georgia',2);c.globalAlpha=1;}
  c.globalAlpha=.3;c.strokeStyle=ink;c.lineWidth=1;c.beginPath();c.moveTo(MARGIN,1810);c.lineTo(WIDTH-MARGIN,1810);c.stroke();c.globalAlpha=1;
  c.font='26px Arial';c.fillText('启航法语',MARGIN,1861);c.globalAlpha=.7;c.font='20px Georgia';c.textAlign='right';c.fillText('Cap sur le français',WIDTH-MARGIN,1861);
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('图片生成失败 / Création impossible.')),'image/png'));
}
