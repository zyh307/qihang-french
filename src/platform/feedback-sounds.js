let context,enabled=true;
export function setFeedbackSounds(value){enabled=value!==false;}
function audioContext(){
  if(!enabled)return null;
  try{context||=new (window.AudioContext||window.webkitAudioContext)();if(context.state==='suspended')context.resume().catch(()=>{});return context;}catch{return null;}
}
function tone(c,frequency,start,duration,volume){
  const oscillator=c.createOscillator(),gain=c.createGain();oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency,start);
  gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(volume,start+.006);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
  oscillator.connect(gain);gain.connect(c.destination);oscillator.start(start);oscillator.stop(start+duration+.01);
}
export function playTap(){const c=audioContext();if(c)tone(c,1150,c.currentTime,.035,.055);}
export function playCorrect(){const c=audioContext();if(!c)return;[659.25,830.61,987.77].forEach((note,i)=>tone(c,note,c.currentTime+i*.075,.16,.075));}
export function playKnown(){
  const c=audioContext();if(!c)return;const start=c.currentTime+.025;
  [[523.25,0,.18],[659.25,.09,.2],[783.99,.18,.23],[1046.5,.31,.3]].forEach(([note,offset,duration])=>tone(c,note,start+offset,duration,.06));
}
