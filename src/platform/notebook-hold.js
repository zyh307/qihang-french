export function installNotebookHold(notify){
 let held,blocked,until=0;
 const target=e=>{const row=e.target?.closest?.('[data-notebook-key]'),control=e.target?.closest?.('uni-button,button');return row&&(!control||control===row)?row:null;};
 const clear=()=>{const old=held;held=null;document.removeEventListener('touchmove',touchmove,true);clearTimeout(old?.timer);if(old){try{old.row.releasePointerCapture?.(old.id);}catch{}setTimeout(()=>old.row.classList.remove('notebook-drag-source'),260);}};
 const down=e=>{if(e.button!==0||e.isPrimary===false)return;if(held?.opened)notify({phase:'cancel'});clear();const row=target(e);if(!row)return;const current=held={row,id:e.pointerId,x:e.clientX,y:e.clientY};current.timer=setTimeout(()=>{if(held!==current)return;const r=row.getBoundingClientRect();if(notify({phase:'start',key:row.dataset.notebookKey,x:current.x,y:current.y,rect:{left:r.left,top:r.top,width:r.width,height:r.height}})===false){clear();return;}current.opened=true;document.addEventListener('touchmove',touchmove,{capture:true,passive:false});row.classList.add('notebook-drag-source');try{row.setPointerCapture?.(current.id);}catch{}},480);};
 const move=e=>{if(!held||held.id!==e.pointerId)return;if(!held.opened){if(Math.hypot(e.clientX-held.x,e.clientY-held.y)>9)clear();}else notify({phase:'move',x:e.clientX,y:e.clientY});};
 const up=e=>{if(held?.id!==e.pointerId)return;if(held.opened){blocked=held.row;until=performance.now()+800;notify({phase:e.type==='pointercancel'?'cancel':'end',x:e.clientX,y:e.clientY});}clear();};
 const click=e=>{if(blocked&&performance.now()<until&&blocked.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();blocked=null;}};
 const context=e=>{if(target(e))e.preventDefault();};
 const cancel=()=>{if(held?.opened)notify({phase:'cancel'});clear();};
 const key=e=>{if(e.key==='Escape')cancel();};
 const hide=()=>{if(document.hidden)cancel();};
 const touchmove=e=>{if(held?.opened&&e.cancelable)e.preventDefault();};
 document.addEventListener('pointerdown',down,{capture:true,passive:true});document.addEventListener('pointermove',move,{capture:true,passive:true});document.addEventListener('pointerup',up,true);document.addEventListener('pointercancel',up,true);document.addEventListener('click',click,true);document.addEventListener('contextmenu',context,true);document.addEventListener('keydown',key,true);document.addEventListener('visibilitychange',hide);window.addEventListener('blur',cancel);
 return()=>{cancel();document.removeEventListener('pointerdown',down,true);document.removeEventListener('pointermove',move,true);document.removeEventListener('pointerup',up,true);document.removeEventListener('pointercancel',up,true);document.removeEventListener('touchmove',touchmove,true);document.removeEventListener('click',click,true);document.removeEventListener('contextmenu',context,true);document.removeEventListener('keydown',key,true);document.removeEventListener('visibilitychange',hide);window.removeEventListener('blur',cancel);};
}
