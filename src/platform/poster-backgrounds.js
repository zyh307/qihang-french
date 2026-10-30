// Original canvas scenery; available offline without remote assets.
export const themes = [
  {id:'galaxy',zh:'星河',fr:'Étoiles',colors:['#071329','#62558e'],ink:'#fff',scene:true},
  {id:'alpine',zh:'雪山',fr:'Sommets',colors:['#5d778b','#1c364c'],ink:'#fff',scene:true},
  {id:'lake',zh:'静湖',fr:'Lac',colors:['#779caa','#294a61'],ink:'#fff',scene:true},
  {id:'forest',zh:'森林',fr:'Forêt',colors:['#537c6f','#173e38'],ink:'#fff',scene:true},
  {id:'coast',zh:'海岸',fr:'Rivage',colors:['#c49b95','#385e77'],ink:'#fff',scene:true},
  {id:'mist',zh:'山雾',fr:'Brume',colors:['#91a4ad','#49687c'],ink:'#fff',scene:true},
  {id:'iris',zh:'鸢尾',fr:'Iris',colors:['#e5e3fa','#c9d9ef'],ink:'#344164'},
  {id:'sage',zh:'鼠尾草',fr:'Sauge',colors:['#e8eedf','#d3e2dd'],ink:'#38534d'},
  {id:'rose',zh:'晨间玫瑰',fr:'Rose',colors:['#f7e5e2','#e7d9eb'],ink:'#674656'},
  {id:'ink',zh:'深海蓝',fr:'Bleu',colors:['#253a5d','#596a8d'],ink:'#f5f6ff'},
];
function random(seed=73){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function glow(c,x,y,r,color){const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);}
function ridge(c,points,color){c.fillStyle=color;c.beginPath();c.moveTo(0,1920);for(const [x,y]of points)c.lineTo(x,y);c.lineTo(1080,1920);c.closePath();c.fill();}
export function drawBackground(c,palette){
  const rand=random(),g=c.createLinearGradient(0,0,0,1920);
  palette.colors.forEach((v,i)=>g.addColorStop(i,v));c.fillStyle=g;c.fillRect(0,0,1080,1920);
  if(!palette.scene){glow(c,850,800,700,'#ffffff40');return;}
  switch(palette.id){
    case 'galaxy': {
      for(let i=0;i<95;i++){const y=rand()*1500,x=800-y*.32+(rand()-.5)*210;glow(c,x,y,70+rand()*170,`rgba(${150+Math.floor(rand()*70)},140,230,0.035)`);}
      for(let i=0;i<1900;i++){const x=rand()*1080,y=rand()*1380,r=.3+rand()*1.4;c.fillStyle=`rgba(232,236,255,${.15+rand()*.65})`;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();}
      ridge(c,[[0,1280],[150,1250],[330,1275],[440,1240],[660,1280],[800,1260],[1080,1290]],'#15213d');
      const lake=c.createLinearGradient(0,1290,0,1920);lake.addColorStop(0,'#8d91bd');lake.addColorStop(1,'#3a466c');c.fillStyle=lake;c.fillRect(0,1290,1080,630);glow(c,480,1510,420,'#c2b6ed60');
      for(let i=0;i<160;i++){c.fillStyle='#b9c3df20';c.fillRect(rand()*1080,1300+rand()*620,10+rand()*110,1);}
      ridge(c,[[0,1700],[90,1630],[195,1650],[290,1790],[490,1920],[1080,1920]],'#253754');break;
    }
    case 'alpine':
      glow(c,790,800,520,'#f5dcc56b');ridge(c,[[0,1370],[200,1160],[395,1210],[655,820],[920,1180],[1080,1030]],'#668198');
      ridge(c,[[470,1120],[655,820],[850,1085],[710,1020],[660,1060],[598,978]],'#dce5e7');
      ridge(c,[[0,1500],[290,1160],[490,1500],[780,1320],[1080,1510]],'#334d65');ridge(c,[[0,1630],[320,1550],[600,1640],[910,1490],[1080,1570]],'#223e53');break;
    case 'lake':
      glow(c,550,1000,600,'#e3d5b880');ridge(c,[[0,1270],[150,1130],[280,1230],[490,1000],[700,1190],[930,1080],[1080,1280]],'#526f7c');
      c.fillStyle='#6c919c';c.fillRect(0,1280,1080,640);glow(c,560,1320,440,'#c7d4c860');
      for(let i=0;i<240;i++){c.fillStyle='#c7d8d32a';c.fillRect(rand()*1080,1280+rand()*640,rand()*130,1.2);}
      ridge(c,[[0,1720],[120,1650],[240,1710],[350,1830],[1080,1920]],'#294d59');break;
    case 'forest':
      glow(c,770,830,630,'#dae8c876');
      for(let layer=0;layer<4;layer++)for(let i=0;i<15;i++){const x=i*85+rand()*60,h=250+rand()*600,y=1300+layer*140;c.fillStyle=['#66887a','#486e61','#2c534b','#163d36'][layer];c.fillRect(x-4,y-h,8,h);c.beginPath();c.moveTo(x,y-h-90);c.lineTo(x-65,y-80);c.lineTo(x+65,y-80);c.closePath();c.fill();}break;
    case 'coast':
      glow(c,760,1040,600,'#f7ccb770');c.fillStyle='#65889b';c.fillRect(0,1210,1080,710);
      for(let i=0;i<45;i++){const y=1240+i*15;c.strokeStyle=`rgba(226,231,223,${.1+rand()*.18})`;c.lineWidth=2+rand()*3;c.beginPath();c.moveTo(0,y);c.bezierCurveTo(300,y-15,600,y+30,1080,y-10);c.stroke();}
      ridge(c,[[0,1560],[160,1545],[330,1630],[420,1720],[600,1820],[1080,1900]],'#a39d91');break;
    case 'mist':
      glow(c,680,900,700,'#e3e1d66b');for(let i=0;i<5;i++){const y=1000+i*140;ridge(c,[[0,y+100],[150,y-60],[350,y+40],[560,y-130],[800,y+50],[1080,y-70]],['#839ca5','#6f8c98','#5f7c8c','#456779','#304f65'][i]);glow(c,500,y+130,530,'#c5d6d338');}break;
  }
}
const previews=new Map();
export function themePreview(palette){
  if(!previews.has(palette.id)){const canvas=document.createElement('canvas');canvas.width=180;canvas.height=150;const c=canvas.getContext('2d');c.scale(180/1080,150/1920);drawBackground(c,palette);previews.set(palette.id,canvas.toDataURL('image/png'));}
  return previews.get(palette.id);
}
