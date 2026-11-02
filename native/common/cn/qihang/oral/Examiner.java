package cn.qihang.oral;
import org.json.*;
import java.io.*;
import java.net.*;
import java.util.*;
import java.security.SecureRandom;
import java.util.concurrent.*;
public final class Examiner {
 public static final String PROTOCOL_REVISION="20261102-asr-performance";
 // The platform accepts only short detect/wake phrases. Actual speech and exam
 // instructions are transferred exclusively through the current-task MCP tool.
 static final String TASK_TRIGGER="读取当前任务";
 static final int TASK_READ_TIMEOUT_SECONDS=18,REPLY_TIMEOUT_SECONDS=90;
 public interface Events{void event(String type,JSONObject value);}
 private final Host host;private final File secrets;private final Events events;private final JSONObject evaluationSchema;
 private final ScheduledExecutorService worker=Executors.newSingleThreadScheduledExecutor();
 private JSONObject identity,config,context=J.o("status","no_active_session");
 private volatile JSONObject state=J.o("status","unbound","message","绑定你的法语考官 / Liez votre examinateur.");
 private volatile SecureSocket socket;private volatile boolean initialized,listed,hello,turnContext,replyStarted;private boolean unreadable;private volatile boolean busy;
 private volatile boolean bound;
 private volatile boolean replyObserved,audioObserved,internalSentence;
 private volatile String lastServiceMessage="";
 private long expires,epoch=0;private int rate=24000;private String sessionId="";private boolean active=true;
 private ScheduledFuture<?> poll,deadline;
 public Examiner(File root,Host host,JSONObject schema,Events events)throws Exception{this.host=host;this.events=events;this.evaluationSchema=schema;secrets=new File(root,"binding/identity.sealed");if(secrets.isFile()){try{identity=new JSONObject(new String(host.unprotect(java.nio.file.Files.readAllBytes(secrets.toPath())),java.nio.charset.StandardCharsets.UTF_8));}catch(Exception error){unreadable=true;state=J.o("status","failed","message","请清除本机连接信息后重新绑定 / Effacez la connexion locale puis associez cet appareil.");}}worker.scheduleAtFixedRate(()->{SecureSocket s=socket;if(s!=null)s.ping();},20,20,TimeUnit.SECONDS);}
 public JSONObject state(){JSONObject s=J.o("protocolRevision",PROTOCOL_REVISION,"status",state.optString("status"),"message",state.optString("message"),"code",state.optString("code"),"expires",expires,"busy",busy,"bound",bound,"serviceMessage",lastServiceMessage,"taskRead",turnContext,"replyStarted",replyStarted,"hasTask",context.has("turn_id"));return s;}
 private void state(String status,String message){state=J.o("status",status,"message",message);events.event("provider",state());}
 private synchronized void identity()throws Exception{if(unreadable)throw new IOException("请清除本机连接信息后重新绑定 / Effacez la connexion locale.");if(identity!=null)return;byte[] b=new byte[6];new SecureRandom().nextBytes(b);b[0]=(byte)((b[0]|2)&254);String mac=J.hex(b).replaceAll("(..)(?!$)","$1:");identity=J.o("device_id",mac,"client_id",UUID.randomUUID().toString());J.atomic(secrets,host.protect(J.bytes(identity.toString())));}
 private Map<String,String> headers(){Map<String,String> h=new HashMap<>();h.put("Device-Id",identity.optString("device_id"));h.put("Client-Id",identity.optString("client_id"));h.put("Activation-Version","1");h.put("User-Agent","qihang-french/2.1.0 software-client");h.put("Accept-Language","fr-FR");return h;}
 private JSONObject request(String suffix,JSONObject data)throws Exception{HttpURLConnection c=(HttpURLConnection)new URL("https://api.tenclass.net/xiaozhi/ota/"+suffix).openConnection();try{c.setConnectTimeout(12000);c.setReadTimeout(15000);c.setInstanceFollowRedirects(false);for(Map.Entry<String,String> h:headers().entrySet())c.setRequestProperty(h.getKey(),h.getValue());c.setRequestMethod("POST");c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");try(OutputStream out=c.getOutputStream()){out.write(J.bytes(data.toString()));}int status=c.getResponseCode();if("activate".equals(suffix)){if(status==200||status==202)return J.o("status",status);throw new IOException("绑定未完成，请重新获取绑定码 / Réessayez l’activation.");}if(status!=200)throw new IOException("无法获取绑定信息 / Activation indisponible.");try(InputStream in=c.getInputStream()){return new JSONObject(new String(J.read(in,256*1024),java.nio.charset.StandardCharsets.UTF_8));}}finally{c.disconnect();}}
 public synchronized void begin(){String current=state.optString("status");if("fetching".equals(current)||"connecting".equals(current))return;if("waiting".equals(current)&&System.currentTimeMillis()<expires){refresh();return;}state("fetching","正在获取绑定信息 / Activation…");worker.submit(()->{try{identity();fetch();}catch(Exception e){state("failed",J.safe(e));}});}
 private void fetch()throws Exception{config=request("",J.o("version",2,"language","fr-FR","application",J.o("name","qihang-french","version","2.1.0"),"board",J.o("type","qihang-french-software","name","qihang-french","mac",identity.optString("device_id"))));JSONObject activation=config.optJSONObject("activation");if(activation!=null&&!activation.optString("code").isEmpty()){bound=false;long timeout=activation.optLong("timeout_ms",300000);expires=System.currentTimeMillis()+Math.min(600000,Math.max(15000,timeout));state=J.o("status","waiting","message","在小智控制台添加设备 / Ajoutez cet appareil dans la console.","code",activation.optString("code"));events.event("provider",state());if(poll!=null)poll.cancel(false);poll=worker.schedule(this::poll,3,TimeUnit.SECONDS);return;}bound=true;JSONObject ws=config.optJSONObject("websocket");if(ws==null||ws.optString("url").isEmpty())throw new IOException("平台未提供此客户端可用的语音通道 / Canal vocal indisponible pour ce client.");connect(ws);}
 private void poll(){if(!active||!"waiting".equals(state.optString("status")))return;if(System.currentTimeMillis()>=expires){state("expired","绑定码已过期 / Code expiré.");return;}try{JSONObject result=request("activate",J.o());if(result.optInt("status")==200){fetch();return;}poll=worker.schedule(this::poll,3,TimeUnit.SECONDS);}catch(Exception e){state("failed",J.safe(e));}}
 public void refresh(){if("waiting".equals(state.optString("status"))){if(poll!=null)poll.cancel(false);worker.submit(this::poll);}else if(identity!=null&&!"connected".equals(state.optString("status")))begin();}
 public void resume(){if(identity!=null)refresh();}
 public synchronized void reconnect()throws Exception{
  if(busy)throw new IOException("请等待当前回复结束 / Attendez la réponse.");
  if("fetching".equals(state.optString("status"))||"connecting".equals(state.optString("status")))return;
  if(poll!=null)poll.cancel(false);if(deadline!=null)deadline.cancel(false);disconnect();context=J.o("status","no_active_session");turnContext=false;replyStarted=false;
  state("fetching","正在建立口语会话 / Ouverture de la séance…");
  worker.submit(()->{try{identity();fetch();}catch(Exception e){state("failed",J.safe(e));}});
 }
 private synchronized void connect(JSONObject ws)throws Exception{disconnect();URI uri=new URI(ws.getString("url"));String name=uri.getHost();if(!"wss".equals(uri.getScheme())||!Arrays.asList("api.tenclass.net","api.xiaozhi.me").contains(name)||uri.getPort()!=-1&&uri.getPort()!=443)throw new IOException("平台连接地址不受支持 / Adresse du service non prise en charge.");int version=ws.optInt("version",1);if(version!=1)throw new IOException("平台语音协议暂不兼容 / Protocole vocal incompatible.");state("connecting","正在连接考官 / Connexion…");initialized=listed=hello=false;Map<String,String> h=headers();h.put("Protocol-Version","1");String token=ws.optString("token");if(!token.isEmpty())h.put("Authorization",token.contains(" ")?token:"Bearer "+token);final long connectionEpoch=++epoch;
  socket=new SecureSocket(ws.getString("url"),h,new SecureSocket.Listener(){public void text(String text)throws Exception{if(connectionEpoch==epoch)incoming(new JSONObject(text));}public void binary(byte[] packet)throws Exception{if(connectionEpoch==epoch&&turnContext&&busy&&hello&&!internalSentence){byte[] pcm=NativeSpeech.decode(packet,rate,false);if(pcm.length>0){if(!audioObserved)events.event("speaking",J.o());replyObserved=audioObserved=true;events.event("audio",J.o("pcm",Base64.getEncoder().encodeToString(pcm),"rate",rate));}}}public void closed(){if(connectionEpoch==epoch){busy=false;state("failed","连接已断开，记录已保留 / Déconnecté, séance conservée.");}}});socket.start();send(J.o("type","hello","version",1,"transport","websocket","features",J.o("mcp",true),"audio_params",J.o("format","opus","sample_rate",16000,"channels",1,"frame_duration",60)));deadline=worker.schedule(()->{if(!"connected".equals(state.optString("status"))){disconnect();state("failed","考官工具初始化未完成 / Initialisation des outils incomplète.");}},18,TimeUnit.SECONDS);
 }
 private void send(JSONObject message)throws Exception{if(!sessionId.isEmpty())message.put("session_id",sessionId);SecureSocket s=socket;if(s==null)throw new IOException("请重新连接考官 / Reconnectez l’examinateur.");s.send(message.toString());}
 private void ready(){if(hello&&initialized&&listed&&"connecting".equals(state.optString("status"))){if(deadline!=null)deadline.cancel(false);state("connected","考官已连接 / Examinateur connecté.");}}
 private synchronized void incoming(JSONObject msg)throws Exception{
  String type=msg.optString("type");
  if("hello".equals(type)){
   JSONObject a=msg.optJSONObject("audio_params");
   if(!"websocket".equals(msg.optString("transport","websocket"))||a==null||!"opus".equals(a.optString("format","opus"))||a.optInt("channels",1)!=1)throw new IOException();
   rate=a.optInt("sample_rate",24000);if(!Arrays.asList(8000,12000,16000,24000,48000).contains(rate))throw new IOException();
   sessionId=msg.optString("session_id");NativeSpeech.decode(new byte[0],rate,true);hello=true;ready();
  }else if("mcp".equals(type))tool(msg.getJSONObject("payload"));
  else if("alert".equals(type))providerAlert(msg);
  else if("error".equals(type)){msg.put("status","Error");providerAlert(msg);}
  else if("tts".equals(type)){
   String phase=msg.optString("state");
   if("sentence_start".equals(phase)&&turnContext&&busy){String text=msg.optString("text");internalSentence=text.trim().matches("^%\\s*self\\..*");if(!text.trim().isEmpty()&&!internalSentence){replyObserved=true;events.event("sentence",J.o("text",text));}}
   if("start".equals(phase)&&busy){replyStarted=true;if(turnContext)events.event("speaking",J.o());}
   if("stop".equals(phase)){
    if(!busy)return;replyStarted=false;if(deadline!=null)deadline.cancel(false);
    if(busy&&!turnContext){busy=false;String message="考官未读取当前题卡，请核对考官配置 / L’examinateur n’a pas lu la tâche.";state("failed",message);events.event("error",J.o("message",message));return;}
    busy=false;lastServiceMessage="";
    if(!replyObserved){events.event("error",J.o("message","考官未返回回答，文字已保留，可重连后继续 / Aucune réponse reçue, texte conservé."));return;}
    events.event("turn_end",J.o("hasAudio",audioObserved));
    if(!audioObserved&&!"evaluation".equals(context.optString("mode")))events.event("notice",J.o("message","考官仅返回文字，请检查小智的法语音色设置 / Réponse écrite seulement : vérifiez la voix française."));
   }
  }
 }
 private void providerAlert(JSONObject msg){
  Object raw=msg.opt("message");String message=raw instanceof JSONObject?((JSONObject)raw).optString("message",((JSONObject)raw).optString("detail")):raw instanceof String?(String)raw:msg.optString("detail");
  String title=safeServiceText(msg.optString("status")),detail=safeServiceText(message);
  if(detail.isEmpty())detail=title.isEmpty()?"平台未提供具体说明":title;
  String shown="小智提示："+detail;
  lastServiceMessage=shown;
  String level=title.toLowerCase(java.util.Locale.ROOT);
  boolean failure=msg.optInt("code",0)>=400||level.matches(".*(error|failed|failure|错误|失败|拒绝|异常).*")||detail.toLowerCase(java.util.Locale.ROOT).matches(".*(quota|limit exceeded|rate.limit|insufficient|unauthori[sz]ed|forbidden|access denied|invalid|余额不足|额度不足|额度用尽|欠费|接口错误|接口返回错误|调用失败|服务不可用|未激活|未绑定|未配置|不支持工具|无可用模型).*");
  if(failure){busy=false;turnContext=false;replyStarted=false;if(deadline!=null)deadline.cancel(false);state("failed",shown);events.event("error",J.o("message",shown,"source","xiaozhi"));}
  else events.event("notice",J.o("message",shown,"source","xiaozhi"));
 }
 private String safeServiceText(String text){
  if(text==null)return "";String value=text.replaceAll("[\\p{Cntrl}&&[^\\n\\t]]","").trim();
  if(identity!=null)for(String key:new String[]{"device_id","client_id"}){String secret=identity.optString(key);if(!secret.isEmpty())value=value.replaceAll("(?i)"+java.util.regex.Pattern.quote(secret),"[已隐藏]");}
  JSONObject ws=config==null?null:config.optJSONObject("websocket");String token=ws==null?"":ws.optString("token");if(!token.isEmpty())value=value.replace(token,"[已隐藏]");
  value=value.replaceAll("(?i)Bearer\\s+[^\\s,;\"']+","Bearer [已隐藏]").replaceAll("(?i)\\b(sk-|hf_)[A-Za-z0-9_-]{8,}","[已隐藏]");
  value=value.replaceAll("(?i)(api[_ -]?key(?:\\s+provided)?|access[_ -]?token|authorization|password|secret)(\\s*[:=]\\s*)[\"']?[^\\s,;\"']+","$1$2[已隐藏]");
  value=value.replaceAll("\\b[A-Za-z0-9_+/=-]{24,}\\b","[已隐藏]");
  value=value.replaceAll("https?://\\S+","[服务地址]").replaceAll("\\s+"," ");
  return value.length()>360?value.substring(0,360)+"…":value;
 }
 private void tool(JSONObject call)throws Exception{if(!call.has("id"))return;String method=call.optString("method");JSONObject result;boolean error=false;if("initialize".equals(method)){initialized=true;result=J.o("protocolVersion","2024-11-05","capabilities",J.o("tools",J.o()),"serverInfo",J.o("name","qihang-french","version","2.1.0"));}else if("tools/list".equals(method)){listed=true;result=J.o("tools",new JSONArray().put(J.o("name","self.french_exam.get_current_task","description","收到读取当前任务时，先调用本工具；每次开始、继续、切换环节或评价都读取最新的真实任务、角色、题卡及考生对话，再回复。不得朗读内部指令。","inputSchema",J.o("type","object","properties",J.o()))).put(J.o("name","self.french_exam.submit_evaluation","description","提交依据实际原句的中文点评、表达改写和练习建议。","inputSchema",evaluationSchema)));}else if("tools/call".equals(method)){JSONObject params=call.optJSONObject("params");String name=params==null?"":params.optString("name");if("self.french_exam.get_current_task".equals(name)){boolean firstRead=!turnContext;turnContext=true;if(busy&&firstRead)scheduleTurnTimeout(REPLY_TIMEOUT_SECONDS);events.event("task_read",J.o("turn",context.optString("turn_id")));result=J.o("content",new JSONArray().put(J.o("type","text","text",context.toString())),"isError",false);}else if("self.french_exam.submit_evaluation".equals(name)&&"evaluation".equals(context.optString("mode"))&&turnContext){JSONObject evaluation=params.optJSONObject("arguments");String issue=validateEvaluation(evaluation);error=!issue.isEmpty();if(!error)events.event("evaluation",J.o("result",evaluation,"request_id",context.optString("turn_id")));result=J.o("content",new JSONArray().put(J.o("type","text","text",error?issue:"评价已保存")),"isError",error);}else{result=J.o("content",new JSONArray().put(J.o("type","text","text","未知工具或当前不在评价环节")),"isError",true);}}else{send(J.o("type","mcp","payload",J.o("jsonrpc","2.0","id",call.get("id"),"error",J.o("code",-32601,"message","Method not found"))));return;}send(J.o("type","mcp","payload",J.o("jsonrpc","2.0","id",call.get("id"),"result",result)));ready();}
 private String validateEvaluation(JSONObject result){if(result==null||result.optString("summary").trim().isEmpty())return "缺少中文总结";JSONArray stages=result.optJSONArray("stages"),rows=context.optJSONArray("learner_rows");if(stages==null||rows==null||stages.length()==0)return "缺少分环节评价或考生证据";Set<String> expected=new HashSet<>(),actual=new HashSet<>();Map<String,JSONObject> evidence=new HashMap<>();for(int i=0;i<rows.length();i++){JSONObject r=rows.optJSONObject(i);if(r!=null){expected.add(r.optString("stage"));evidence.put(r.optString("id"),r);}}for(int i=0;i<stages.length();i++){JSONObject s=stages.optJSONObject(i);if(s==null||!actual.add(s.optString("stage")))return "环节重复或格式无效";for(String key:new String[]{"task","interaction","vocabulary","grammar"})if(s.optString(key).trim().isEmpty())return "缺少评价维度";JSONArray practice=s.optJSONArray("practice");if(practice==null||practice.length()<1)return "缺少练习建议";for(String key:new String[]{"strengths","improvements"}){JSONArray items=s.optJSONArray(key);if(items==null)return "缺少原句依据";for(int n=0;n<items.length();n++){JSONObject item=items.optJSONObject(n);JSONObject row=item==null?null:evidence.get(item.optString("row"));if(row==null||!row.optString("stage").equals(s.optString("stage"))||item.optString("quote").trim().isEmpty()||!row.optString("text").contains(item.optString("quote")))return "只允许引用考生在对应环节实际说过的原句";}}}return actual.equals(expected)?"":"评价环节与实际发言不一致";}
 public synchronized void submit(JSONObject task,String text)throws Exception{if(!"connected".equals(state.optString("status")))throw new IOException("请先连接考官 / Connectez l’examinateur.");if(busy)throw new IOException("请等待考官回复 / Attendez la réponse.");if(text.trim().isEmpty()||text.length()>12000)throw new IOException("发言内容无效 / Message invalide.");context=new JSONObject(task.toString());turnContext=false;replyStarted=false;replyObserved=audioObserved=internalSentence=false;busy=true;try{send(J.o("type","listen","state","detect","text",TASK_TRIGGER));scheduleTurnTimeout(TASK_READ_TIMEOUT_SECONDS);}catch(Exception e){busy=false;throw e;}}
 private void scheduleTurnTimeout(int seconds){if(deadline!=null)deadline.cancel(false);final String turn=context.optString("turn_id");deadline=worker.schedule(()->expireTurn(turn),seconds,TimeUnit.SECONDS);}
 private synchronized void expireTurn(String turn){if(!busy||!turn.equals(context.optString("turn_id")))return;String message=!turnContext?"考官未读取题卡，请复制考官配置到小智后重新连接 / Vérifiez le rôle de l’examinateur.":"考官回复超时，文字已保留，可重新连接后继续 / Réponse expirée, texte conservé.";busy=false;turnContext=false;replyStarted=false;try{send(J.o("type","abort"));}catch(Exception ignored){}events.event("error",J.o("message",message));}
 public synchronized void cancel(){try{if(socket!=null&&busy)send(J.o("type","abort"));}catch(Exception ignored){}busy=false;turnContext=false;replyStarted=false;replyObserved=false;if(deadline!=null)deadline.cancel(false);events.event("turn_end",J.o("cancelled",true));}
 public synchronized void clear()throws Exception{cancel();disconnect();if(poll!=null)poll.cancel(false);java.nio.file.Files.deleteIfExists(secrets.toPath());identity=null;unreadable=false;bound=false;lastServiceMessage="";config=null;expires=0;state("unbound","本机连接信息已清除 / Connexion locale effacée.");}
 private synchronized void disconnect(){epoch++;SecureSocket s=socket;socket=null;if(s!=null)s.close();sessionId="";busy=false;replyObserved=false;turnContext=false;replyStarted=false;}
 public void close(){active=false;disconnect();worker.shutdownNow();}
}
