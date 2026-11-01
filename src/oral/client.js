// Credentials arrive from the containing app, never in a URL or a learning backup.
(()=>{
  let endpoint='',accessCode='',configured=false,resolveReady;
  const ready=new Promise(resolve=>resolveReady=resolve),nativeFetch=window.fetch.bind(window),media=new Map();
  const report=(type,values={})=>parent.postMessage({type,...values},location.origin);
  window.addEventListener('message',event=>{
    if(event.source!==parent||event.origin!==location.origin||event.data?.type!=='qihang-oral-config')return;
    if(configured)return;
    endpoint=event.data.endpoint||'';accessCode=event.data.accessCode||'';configured=true;resolveReady();
  });
  const url=path=>endpoint.replace(/\/$/,'')+path;
  async function request(path,options={}){
    await ready;if(!endpoint)throw Error('请先连接口语服务 / Connectez le service oral.');
    if(!/^\/(api\/|examples\/)/.test(path))throw Error('无效的服务路径');
    const headers=new Headers(options.headers||{});headers.set('Authorization','Bearer '+accessCode);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);let response;
    try{response=await nativeFetch(url(path),{...options,headers,credentials:'omit',signal:options.signal||controller.signal});}finally{clearTimeout(timer);}
    if(path==='/api/bootstrap')report('qihang-oral-status',{connected:response.ok});
    return response;
  }
  async function mediaURL(path){
    if(!media.has(path))media.set(path,request(path).then(async response=>{if(!response.ok)throw Error('录音暂不可用');return URL.createObjectURL(await response.blob());}).catch(error=>{media.delete(path);throw error;}));
    return media.get(path);
  }
  window.QihangOralClient={ready,fetch:request,
    socketURL:()=>url('/ws').replace(/^http/,'ws'),socketProtocols:()=>['qihang-oral-v1','token.'+accessCode],
    workletURL:new URL('capture.js',location.href).href,mediaURL,
    setAudio:async(player,path)=>{player.dataset.recordingSource=path;const value=await mediaURL(path);if(player.dataset.recordingSource===path)player.src=value;},
    offlineBootstrap:()=>nativeFetch(new URL('bank.json',location.href)).then(response=>response.json()),
    exportText:(name,text)=>{report('qihang-oral-export',{name,text});},
    connectionFailed:message=>report('qihang-oral-status',{connected:false,message})};
  window.addEventListener('pagehide',()=>{for(const item of media.values())item.then(value=>URL.revokeObjectURL(value)).catch(()=>{});});
  document.addEventListener('click',event=>{const link=event.target.closest?.('a[target="_blank"]');if(link?.href?.startsWith('https://')){event.preventDefault();report('qihang-oral-link',{url:link.href});}});
  report('qihang-oral-ready');
})();
