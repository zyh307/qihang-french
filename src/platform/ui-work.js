// Let a tap/page transition paint before doing CPU or persistence work.
export function yieldToUI(){
 return new Promise(resolve=>{
  if(typeof document==='undefined'||document.hidden||typeof requestAnimationFrame!=='function'){setTimeout(resolve,0);return;}
  let frame,timer,done=false;
  const finish=()=>{if(done)return;done=true;clearTimeout(timer);cancelAnimationFrame(frame);resolve();};
  timer=setTimeout(finish,80);
  frame=requestAnimationFrame(()=>{clearTimeout(timer);timer=setTimeout(finish,0);});
 });
}

// A generator keeps its local indexes private until all chunks are ready.
export async function runCooperatively(steps,{current=()=>true,paintFirst=true}={}){
 if(paintFirst)await yieldToUI();
 let start=performance.now();
 for(;;){
  if(!current()){steps.return?.();return;}
  const next=steps.next();
  if(next.done)return next.value;
  if(performance.now()-start>=6){await yieldToUI();start=performance.now();}
 }
}
