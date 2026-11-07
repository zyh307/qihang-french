package cn.qihang.oral;
import org.json.*;
import java.io.*;
import java.nio.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
public final class OralCore {
 private final File root;private final Host host;public final ModelStore model;public final Examiner examiner;
 private final Map<String,JSONObject> browserSessions=new LinkedHashMap<String,JSONObject>(){protected boolean removeEldestEntry(Map.Entry<String,JSONObject> entry){return size()>4;}};
 private boolean browserRecording,browserReply;private String replySession="",replyStage="";private boolean replyEvaluation;
 private volatile String recognizingAudio="";
 private final ExecutorService speech=Executors.newSingleThreadExecutor();private final Map<String,JSONObject> jobs=new ConcurrentHashMap<>();
 private final ScheduledExecutorService recognitionClock=Executors.newSingleThreadScheduledExecutor();
 private volatile String activeRecognition="";private volatile long recognitionStarted;
 private volatile boolean preparingSpeech;private volatile String preparedModel="",preparationError="";private volatile long preparationStarted,preparationElapsedMs;private volatile long[] preparedTimings;
 private final ArrayDeque<JSONObject> events=new ArrayDeque<>();private long sequence;
 private static final int SAMPLE_RATE=16000, SHORT_SECONDS=120, MAX_SECONDS=420;
 private int recordingLimit=SHORT_SECONDS;
 private String recordingId="",recordingSession="",recordingStage="",recordingRow="";private volatile String recordingState="idle";private FileOutputStream capture;private long recordingBytes;private volatile long recognitionGeneration;
 private final Object turnLock=new Object();
 private ByteArrayOutputStream reply=new ByteArrayOutputStream();private String replyTurn="";private int replyRate=24000;
 public OralCore(File root,JSONObject manifest,JSONObject schema,Host host)throws Exception{this.root=root;this.host=host;root.mkdirs();new File(root,"recordings").mkdirs();new File(root,"sessions").mkdirs();model=new ModelStore(root,manifest,true,manifest.optString("bundledModelPath").isEmpty()?null:new File(manifest.getString("bundledModelPath")));examiner=new Examiner(root,host,schema,this::providerEvent);recoverRecording();recoverBrowserRecording();examiner.resume();}
 private synchronized void event(String type,JSONObject value){try{value.put("type",type);value.put("seq",++sequence);events.add(value);while(events.size()>6000)events.remove();}catch(Exception ignored){}}
 private synchronized void providerEvent(String type,JSONObject value){try{if("audio".equals(type)||"sentence".equals(type)||"speaking".equals(type)||"turn_end".equals(type))value.put("turn",replyTurn);if("audio".equals(type)){byte[] b=Base64.getDecoder().decode(value.optString("pcm"));if(reply.size()+b.length<32*1024*1024)reply.write(b);replyRate=value.optInt("rate",24000);}if("turn_end".equals(type)&&!value.optBoolean("cancelled")&&reply.size()>0&&!replyTurn.isEmpty()){String id=UUID.randomUUID().toString();J.atomic(browserReply?browserAudio(id):audio(id),wav(reply.toByteArray(),replyRate));if(browserReply)cacheDescriptor(J.o("audio",id,"session",replySession,"turn",replyTurn,"stage",replyStage,"kind",replyEvaluation?"evaluation":"assistant","at",System.currentTimeMillis()/1000.0));event("reply_recording",J.o("audio",id,"turn",replyTurn));reply.reset();}event(type,value);}catch(Exception e){event("error",J.o("message","回复录音保存失败 / Enregistrement de la réponse impossible."));}}
 private static final class SessionStorageException extends IOException{
  SessionStorageException(IOException cause){super("练习记录无法保存，请检查数据目录的写入权限和磁盘空间；已有记录未删除 / Impossible d’enregistrer la séance, vérifiez le dossier et l’espace disque.",cause);}
 }
 public String call(String payload){try{JSONObject request=new JSONObject(payload),args=request.optJSONObject("args");if(args==null)args=J.o();String method=request.getString("method");JSONObject result=dispatch(method,args);return J.o("ok",true,"value",result).toString();}catch(Throwable e){if(e instanceof SessionStorageException)System.err.println("[qihang] session.save failed: "+e.getCause().getClass().getSimpleName());return J.o("ok",false,"error",J.safe(e),"code",e instanceof SessionStorageException?"session_save_failed":"operation_failed").toString();}}
 private JSONObject dispatch(String method,JSONObject a)throws Exception{
  switch(method){
   case "heartbeat":return J.o();
   case "records.capabilities":return J.o("browserStorage",1);
   case "session.cache":{JSONObject s=a.getJSONObject("session");String id=safeId(s.getString("id"));if(s.toString().length()>4*1024*1024)throw new IOException();synchronized(this){browserSessions.put(id,new JSONObject(s.toString()));}return J.o("saved",true);}
   case "record.cache.list":return cachedRecordings();
   case "audio.info":{File f=browserAudio(safeId(a.getString("id")));return J.o("size",f.isFile()?f.length():0);}
   case "audio.chunk":{File f=browserAudio(safeId(a.getString("id")));long offset=a.getLong("offset");int size=a.getInt("size");if(offset<0||size<1||size>512*1024||f.length()>40*1024*1024||offset+size>f.length())throw new IOException();byte[] bytes=new byte[size];try(RandomAccessFile in=new RandomAccessFile(f,"r")){in.seek(offset);in.readFully(bytes);}return J.o("data",Base64.getEncoder().encodeToString(bytes));}
   case "audio.stage.begin":{String id=safeId(a.getString("id"));long size=a.getLong("size");if(size<44||size>40*1024*1024||id.equals(recognizingAudio))throw new IOException();File f=new File(browserWork(),id+".import.part");try(FileOutputStream out=new FileOutputStream(f)){out.getFD().sync();}return J.o();}
   case "audio.stage.chunk":{String id=safeId(a.getString("id")),encoded=a.getString("data");File f=new File(browserWork(),id+".import.part");if(!f.isFile()||f.length()!=a.getLong("offset")||encoded.length()>768*1024)throw new IOException();byte[] bytes=Base64.getDecoder().decode(encoded);if(f.length()+bytes.length>40*1024*1024)throw new IOException();try(FileOutputStream out=new FileOutputStream(f,true)){out.write(bytes);}return J.o();}
   case "audio.stage.finish":{String id=safeId(a.getString("id"));File f=new File(browserWork(),id+".import.part");if(f.length()!=a.getLong("size"))throw new IOException();Files.move(f.toPath(),browserAudio(id).toPath(),StandardCopyOption.REPLACE_EXISTING);return J.o();}
   case "audio.release":{String id=safeId(a.getString("id"));if(id.equals(recognizingAudio)||capture!=null&&id.equals(recordingId))return J.o("released",false);Files.deleteIfExists(browserAudio(id).toPath());Files.deleteIfExists(new File(browserWork(),id+".capture.json").toPath());return J.o("released",true);}
   case "status":ensureSpeechPrepared();return J.o("model",modelStatus(),"recognizer",speechStatus(),"provider",examiner.state(),"recording",recordingState,"availableMemory",host.availableMemory(),"native",true);
   case "recognizer.prepare":preparationError="";ensureSpeechPrepared();return speechStatus();
   case "events":{JSONArray batch=new JSONArray();synchronized(this){long since=a.optLong("after");for(JSONObject e:events)if(e.optLong("seq")>since)batch.put(e);return J.o("events",batch,"cursor",sequence);}}
   case "model.start":model.start();return model.status();
   case "model.pause":model.pause();return model.status();
   case "model.import":host.importModel(model);return J.o("opened",true);
   case "model.delete":if(!a.optBoolean("confirmed"))throw new IOException("请先确认删除 / Confirmez la suppression.");model.delete();return model.status();
   case "binding.begin":examiner.begin();return examiner.state();
   case "binding.reconnect":examiner.reconnect();return examiner.state();
   case "binding.refresh":examiner.refresh();return examiner.state();
   case "binding.clear":if(!a.optBoolean("confirmed"))throw new IOException("请先确认清除 / Confirmez l’effacement.");examiner.clear();return examiner.state();
   case "resume":examiner.resume();return J.o();
   case "background":background();return J.o();
   case "record.begin":return beginRecord(safeId(a.getString("session")),a.optString("stage"));
   case "record.chunk":return chunk(a.getString("pcm"));
   case "record.end":return endRecord();
   case "recognize":return recognize(a.getString("audio"),a.optBoolean("shortAudio",false));
   case "recognize.cancel":cancelRecognition("识别已取消，原录音已保留 / Reconnaissance annulée, audio conservé.");return J.o();
   case "job":return recognitionJob(a.optString("id"));
   case "send":return sendTurn(a);
   case "cancel":examiner.cancel();return J.o();
   case "session.save":return saveSession(a.getJSONObject("session"));
   case "session.list":{JSONArray all=new JSONArray();File[] files=new File(root,"sessions").listFiles((d,n)->n.endsWith(".json"));if(files!=null){Arrays.sort(files,(l,r)->Long.compare(r.lastModified(),l.lastModified()));for(File f:files){JSONObject s=J.json(f);all.put(J.o("id",s.optString("id"),"created",s.optLong("created"),"part",s.optString("part"),"level",s.optString("level","A1"),"ended",s.opt("ended"),"phase",s.optString("phase"),"mode",s.optString("mode"),"messages",s.optJSONArray("messages")==null?0:s.getJSONArray("messages").length()));}}return J.o("sessions",all);}
   case "session.get":return J.json(new File(root,"sessions/"+safeId(a.getString("id"))+".json"));
   case "audio.read":{File f=audio(safeId(a.getString("id")));if(f.length()>40*1024*1024)throw new IOException();return J.o("data",Base64.getEncoder().encodeToString(Files.readAllBytes(f.toPath())));}
   case "session.export":return archive(safeId(a.getString("id")));
   default:throw new IOException("操作不受支持 / Action non prise en charge.");
  }
 }
 private synchronized JSONObject saveSession(JSONObject session)throws Exception{String id=safeId(session.getString("id"));if(session.toString().length()>4*1024*1024)throw new IOException();File originalFile=new File(root,"sessions/"+id+".json");JSONObject original=J.json(originalFile);JSONArray oldRows=original.optJSONArray("messages"),rows=session.optJSONArray("messages");if(oldRows!=null&&rows!=null){for(int i=0;i<oldRows.length();i++){JSONObject r=oldRows.optJSONObject(i);if(r==null||!r.optBoolean("native_recording"))continue;boolean found=false;for(int n=0;n<rows.length();n++)if(rows.getJSONObject(n).optString("audio").equals(r.optString("audio"))){found=true;rows.getJSONObject(n).put("native_recording",true);}if(!found)rows.put(r);}}try{J.atomic(originalFile,J.bytes(session.toString()));}catch(IOException e){throw new SessionStorageException(e);}return J.o("saved",true);}
 private JSONObject sendTurn(JSONObject a)throws Exception{synchronized(turnLock){if(examiner.state().optBoolean("busy"))throw new IOException("请等待考官回复 / Attendez la réponse.");String turn=a.getJSONObject("task").optString("turn_id");synchronized(this){replyTurn=turn;browserReply=a.optBoolean("browserStorage");replySession=browserReply?safeId(a.getString("browserSession")):"";replyStage=a.getJSONObject("task").optString("stage");replyEvaluation="evaluation".equals(a.getJSONObject("task").optString("mode"));reply.reset();}examiner.submit(a.getJSONObject("task"),a.getString("text"));return J.o("submitted",true,"turn",turn);}}
 private String safeId(String id)throws IOException{if(!id.matches("[a-zA-Z0-9-]{8,80}"))throw new IOException();return id;}
 private JSONObject modelStatus()throws Exception{JSONObject value=model.status();value.put("label",model.description().optString("label"));return value;}
 static int recognitionThreads(int processors,boolean desktop){return SpeechSettings.threads(processors,desktop);}
 private int recognitionThreads(){return recognitionThreads(Runtime.getRuntime().availableProcessors(),System.getProperty("os.name","").startsWith("Windows"));}
 private String modelStamp(){return model.model.length()+":"+model.model.lastModified();}
 private JSONObject speechStatus(){boolean ready=!preparingSpeech&&preparationError.isEmpty()&&preparedModel.equals(modelStamp())&&model.status().optBoolean("ready");return J.o("ready",ready,"state",preparingSpeech?"preparing":!preparationError.isEmpty()?"failed":ready?"ready":"waiting","elapsedMs",preparingSpeech?(System.nanoTime()-preparationStarted)/1000000:0,"preparationMs",preparationElapsedMs,"cpuLibrary",NativeSpeech.CPU_LIBRARY,"message",preparationError,"backend",preparedTimings!=null&&preparedTimings.length>6&&preparedTimings[6]==1?"gpu":"cpu");}
 private synchronized void ensureSpeechPrepared(){
  if(preparingSpeech||!preparationError.isEmpty()||!model.status().optBoolean("ready")||preparedModel.equals(modelStamp())||!activeRecognition.isEmpty())return;
  if(host.availableMemory()<model.minimumMemory()){preparationError="可用内存不足，请关闭其他应用后重试 / Mémoire insuffisante.";return;}
  if(!model.acquire())return;
  final String stamp=modelStamp();preparingSpeech=true;preparationStarted=System.nanoTime();
  speech.submit(()->{try{NativeSpeech.prepare();if(NativeSpeech.preload(model.model.getAbsolutePath()))NativeSpeech.transcribe(model.model.getAbsolutePath(),new float[16000],recognitionThreads());preparedTimings=NativeSpeech.timings();preparedModel=stamp;}catch(LinkageError e){preparationError="语音组件不完整或版本不匹配，请完整解压新版 / Composants vocaux incomplets, réinstallez le paquet complet.";}catch(Throwable e){preparationError=J.safe(e);}finally{preparationElapsedMs=(System.nanoTime()-preparationStarted)/1000000;model.done();preparingSpeech=false;}});
 }
 private File audio(String id){File cached=browserAudio(id);return cached.isFile()||browserRecording&&id.equals(recordingId)?cached:new File(root,"recordings/"+id+".wav");}
 private synchronized JSONObject beginRecord(String sessionId,String stage)throws Exception{if(!speechStatus().optBoolean("ready"))throw new IOException("语音模型尚在准备，请完成准备后开始 / Attendez la préparation du modèle.");if(capture!=null||!activeRecognition.isEmpty())throw new IOException("请等待上一段录音处理结束 / Attendez la fin du traitement précédent.");recordingSession=sessionId;
  recordingStage=stage;
  browserRecording=browserSessions.containsKey(sessionId);JSONObject session=browserRecording?browserSessions.get(sessionId):J.json(new File(root,"sessions/"+sessionId+".json"));
  String level=session.optString("level","A1");
  recordingLimit="B2".equals(level)&&"presentation".equals(stage)?MAX_SECONDS:
      "B1".equals(level)&&"opinion".equals(stage)?180:SHORT_SECONDS;
  recordingId=UUID.randomUUID().toString();capture=new FileOutputStream(new File(browserRecording?browserWork():new File(root,"recordings"),recordingId+".pcm.part"));recordingBytes=0;recordingRow=UUID.randomUUID().toString();J.atomic(recordingJournal(),J.bytes(J.o("audio",recordingId,"row",recordingRow,"session",recordingSession,"stage",recordingStage).toString()));recordingState="recording";return J.o("audio",recordingId,"row",recordingRow);}
 private synchronized JSONObject chunk(String encoded)throws Exception{if(capture==null)throw new IOException("录音已停止 / Enregistrement arrêté.");if(encoded.length()>512*1024)throw new IOException();byte[] pcm=Base64.getDecoder().decode(encoded);if((pcm.length&1)!=0)throw new IOException("录音数据无效 / Audio invalide.");
  int room=(int)(recordingLimit*SAMPLE_RATE*2L-recordingBytes);
  int count=Math.min(room,pcm.length);
  capture.write(pcm,0,count);
  recordingBytes+=count;return J.o();}
 private synchronized JSONObject endRecord()throws Exception{if(capture==null)throw new IOException("录音已停止 / Enregistrement arrêté.");capture.getFD().sync();capture.close();capture=null;File partial=new File(browserRecording?browserWork():new File(root,"recordings"),recordingId+".pcm.part");byte[] pcm=Files.readAllBytes(partial.toPath());J.atomic(audio(recordingId),wav(pcm,16000));Files.deleteIfExists(partial.toPath());recordingState="idle";JSONObject result=J.o("audio",recordingId,"row",recordingRow,"duration",pcm.length/32000.0);saveCaptured(result,false);Files.deleteIfExists(recordingJournal().toPath());return result;}
 private synchronized void cancelRecognition(String message){
  recognitionGeneration++;
  if(!activeRecognition.isEmpty()){
   jobs.computeIfPresent(activeRecognition,(key,value)->"running".equals(value.optString("state"))?J.o("state","cancelled","error",message):value);
   recordingState="cancelling";
  }
  NativeSpeech.cancel();
 }
 private JSONObject recognitionJob(String id)throws Exception{
  JSONObject value=jobs.getOrDefault(id,J.o("state","missing"));
  if(!"running".equals(value.optString("state"))||!id.equals(activeRecognition))return value;
  int[] progress=NativeSpeech.progress();int phase=progress.length>0?progress[0]:0;
  return J.o("state","running","phase",phase==2?"loading":phase==3?"transcribing":phase==1?"queued":"finishing","percent",progress.length>1?Math.max(0,Math.min(100,progress[1])):0,"elapsedMs",(System.nanoTime()-recognitionStarted)/1000000,"timeoutMs",value.optLong("timeoutMs"));
 }
 private synchronized JSONObject recognize(String id,boolean shortAudio)throws Exception{
  final boolean adaptive=shortAudio&&NativeSpeech.ANDROID;
  if(!speechStatus().optBoolean("ready"))throw new IOException("语音模型尚在准备，请完成准备后开始 / Attendez la préparation du modèle.");
  safeId(id);long size=audio(id).length();if(size<3244||size>MAX_SECONDS*SAMPLE_RATE*2L+44)throw new IOException("录音过短或无效，请重新录音 / Réenregistrez une réponse plus longue.");
  if(!model.acquire())throw new IOException("模型尚未就绪或正在识别 / Modèle indisponible ou occupé.");
  if(host.availableMemory()<Math.min(model.minimumMemory(),512L*1024*1024)){model.done();throw new IOException("可用内存不足，请关闭其他应用后重试 / Mémoire disponible insuffisante.");}
  final ModelStore selectedModel=model;
  try{NativeSpeech.prepare();}catch(Throwable e){model.done();throw e;}
  String job=UUID.randomUUID().toString();long generation=++recognitionGeneration;
  long timeout=Math.min(1200000,Math.max(180000,90000+(size-44)/32*5));
  final JSONObject running=J.o("state","running","timeoutMs",timeout);
  activeRecognition=job;recognizingAudio=id;recognitionStarted=System.nanoTime();recordingState="recognizing";jobs.put(job,running);
  ScheduledFuture<?> deadline=recognitionClock.schedule(()->{synchronized(this){if(job.equals(activeRecognition)&&jobs.replace(job,running,J.o("state","failed","error","识别用时过长，已停止，原录音保留 / Reconnaissance trop longue, audio conservé."))){recognitionGeneration++;recordingState="cancelling";NativeSpeech.cancel();}}},timeout,TimeUnit.MILLISECONDS);
  speech.submit(()->{
   try{
    if(generation!=recognitionGeneration)return;
    byte[] wav=Files.readAllBytes(audio(id).toPath());float[] samples=new float[(wav.length-44)/2];ByteBuffer b=ByteBuffer.wrap(wav,44,wav.length-44).order(ByteOrder.LITTLE_ENDIAN);
    for(int i=0;i<samples.length;i++)samples[i]=b.getShort()/32768f;
    StringBuilder transcript=new StringBuilder();
    long[] timing=new long[8];
    int segments=0;
    int threads=recognitionThreads();
    for(int start=0;start<samples.length;){
     if(generation!=recognitionGeneration)return;
     int end=segmentEnd(samples,start);
     float[] clip=end==samples.length&&start==0?samples:Arrays.copyOfRange(samples,start,end);
     String path=selectedModel.model.getAbsolutePath();
     String text=adaptive?NativeSpeech.transcribeShort(path,clip,threads):NativeSpeech.transcribe(path,clip,threads);
     if(generation!=recognitionGeneration)return;
     if(!text.trim().isEmpty()){
      if(transcript.length()>0)transcript.append(' ');
      transcript.append(text.trim());
     }
     long[] segmentTiming=NativeSpeech.timings();
     for(int i=0;i<Math.min(4,segmentTiming.length);i++)timing[i]+=segmentTiming[i];
     if(segmentTiming.length>6)timing[6]=segmentTiming[6];
     if(segmentTiming.length>7)timing[7]=Math.max(timing[7],segmentTiming[7]);
     segments++;
     start=end;
    }
    if(transcript.length()==0)throw new IOException("未识别出文字，请回听或重新录音 / Aucun texte reconnu.");
    jobs.replace(job,running,J.o("state","done","text",transcript.toString(),"segments",segments,"model",selectedModel.modelId(),"elapsedMs",(System.nanoTime()-recognitionStarted)/1000000,"nativeLibrary",NativeSpeech.CPU_LIBRARY,"shortAudioRequested",adaptive,"audioContext",timing.length>7?timing[7]:1500,"modelLoadMs",timing[0],"inferenceMs",timing[1],"encoderMs",timing[2],"decoderMs",timing[3],"threads",threads,"backend",timing[6]==1?"gpu":"cpu"));
   }catch(Throwable e){jobs.replace(job,running,J.o("state",generation!=recognitionGeneration?"cancelled":"failed","error",e instanceof OutOfMemoryError?"识别内存不足，请关闭其他应用后重试 / Mémoire insuffisante.":J.safe(e)));}
   finally{deadline.cancel(false);synchronized(this){selectedModel.done();if(job.equals(activeRecognition)){activeRecognition="";recognizingAudio="";recordingState="idle";}}}
  });
  return J.o("job",job,"timeoutMs",timeout);
 }
 // Keep the original WAV intact. For JNI's two-minute limit, prefer a quiet
 // boundary near the end of the window and preserve every input sample.
 static int segmentEnd(float[] samples,int start){
  int hardEnd=Math.min(samples.length,start+SHORT_SECONDS*SAMPLE_RATE);
  if(hardEnd==samples.length)return hardEnd;
  int width=SAMPLE_RATE/5, best=hardEnd-width/2;
  double least=Double.POSITIVE_INFINITY;
  for(int end=hardEnd;end>hardEnd-5*SAMPLE_RATE;end-=width){
   double energy=0;
   for(int i=end-width;i<end;i++)energy+=samples[i]*samples[i];
   if(energy<least){least=energy;best=end-width/2;}
  }
  return best;
 }
 private JSONObject archive(String id)throws Exception{JSONObject s=J.json(new File(root,"sessions/"+id+".json"));ByteArrayOutputStream out=new ByteArrayOutputStream();try(java.util.zip.ZipOutputStream zip=new java.util.zip.ZipOutputStream(out)){zip.putNextEntry(new java.util.zip.ZipEntry("practice.json"));zip.write(J.bytes(s.toString(2)));zip.closeEntry();JSONArray messages=s.optJSONArray("messages");Set<String> included=new HashSet<>();String level=s.optString("level","A1");if(!level.matches("[AB][12]"))level="A1";StringBuilder text=new StringBuilder("启航法语 · DELF "+level+"\n\n");if(messages!=null)for(int i=0;i<messages.length();i++){JSONObject m=messages.getJSONObject(i);text.append(m.optString("role")).append(": ").append(m.optString("confirmed_text",m.optString("text"))).append("\n");String audio=m.optString("audio");if(audio.matches("[a-zA-Z0-9-]{8,80}")&&included.add(audio)&&audio(audio).isFile()){zip.putNextEntry(new java.util.zip.ZipEntry("audio/"+audio+".wav"));Files.copy(audio(audio).toPath(),zip);zip.closeEntry();}}if(s.has("evaluation")){
 String voice=s.getJSONObject("evaluation").optString("audio");
 if(voice.matches("[a-zA-Z0-9-]{8,80}")&&included.add(voice)&&audio(voice).isFile()){
 zip.putNextEntry(new java.util.zip.ZipEntry("audio/"+voice+".wav"));Files.copy(audio(voice).toPath(),zip);zip.closeEntry();
 }
 }if(s.has("evaluation"))text.append("\n").append(s.get("evaluation").toString());zip.putNextEntry(new java.util.zip.ZipEntry("练习记录.txt"));zip.write(J.bytes(text.toString()));zip.closeEntry();}return J.o("name",s.optString("level","A1").matches("[AB][12]")?s.optString("level","A1")+"-"+id+".zip":"A1-"+id+".zip","data",Base64.getEncoder().encodeToString(out.toByteArray()));}
 public static byte[] wav(byte[] pcm,int rate){ByteBuffer b=ByteBuffer.allocate(pcm.length+44).order(ByteOrder.LITTLE_ENDIAN);b.put(J.bytes("RIFF")).putInt(pcm.length+36).put(J.bytes("WAVEfmt ")).putInt(16).putShort((short)1).putShort((short)1).putInt(rate).putInt(rate*2).putShort((short)2).putShort((short)16).put(J.bytes("data")).putInt(pcm.length).put(pcm);return b.array();}
 public void background(){cancelRecognition("识别已暂停，原录音已保留 / Reconnaissance suspendue, audio conservé.");try{if(capture!=null){JSONObject r=endRecord();saveInterrupted(r);}}catch(Exception ignored){}examiner.cancel();}
 private synchronized void saveInterrupted(JSONObject r)throws Exception{saveCaptured(r,true);}
 private synchronized void saveCaptured(JSONObject r,boolean interrupted)throws Exception{if(recordingSession.isEmpty())return;if(browserRecording){cacheDescriptor(J.o("audio",r.getString("audio"),"session",recordingSession,"row",r.optString("row"),"stage",recordingStage,"kind","user","seconds",r.optDouble("duration"),"at",System.currentTimeMillis()/1000.0,"interrupted",interrupted));return;}File f=new File(root,"sessions/"+safeId(recordingSession)+".json");JSONObject session=J.json(f);JSONArray rows=session.optJSONArray("messages");if(rows==null)return;for(int i=0;i<rows.length();i++)if(rows.getJSONObject(i).optString("audio").equals(r.optString("audio"))){if(interrupted){rows.getJSONObject(i).put("interrupted",true).put("confirmation_status","cancelled").put("recognition_status","cancelled");J.atomic(f,J.bytes(session.toString()));}return;}rows.put(J.o("id",r.optString("row",UUID.randomUUID().toString()),"role","user","stage",recordingStage,"at",System.currentTimeMillis()/1000.0,"audio",r.optString("audio"),"seconds",r.optDouble("duration"),"text","","confirmation_status",interrupted?"cancelled":"pending","recognition_status",interrupted?"cancelled":"pending","interrupted",interrupted,"native_recording",true));J.atomic(f,J.bytes(session.toString()));}
 private void recoverRecording(){try{File journal=new File(root,"recording-active.json");if(!journal.isFile())return;JSONObject r=J.json(journal);recordingId=safeId(r.getString("audio"));recordingRow=safeId(r.getString("row"));recordingSession=safeId(r.getString("session"));recordingStage=r.optString("stage");File raw=new File(root,"recordings/"+recordingId+".pcm.part");if(raw.isFile()&&raw.length()<=MAX_SECONDS*SAMPLE_RATE*2L){byte[] pcm=Files.readAllBytes(raw.toPath());J.atomic(audio(recordingId),wav(pcm,16000));saveCaptured(J.o("audio",recordingId,"row",recordingRow,"duration",pcm.length/32000.0),true);Files.delete(raw.toPath());}Files.deleteIfExists(journal.toPath());}catch(Exception ignored){}}
 private File browserWork(){File f=new File(root,"browser-work");f.mkdirs();return f;}
 private File browserAudio(String id){return new File(browserWork(),id+".wav");}
 private File recordingJournal(){return new File(browserRecording?browserWork():root,"recording-active.json");}
 private void cacheDescriptor(JSONObject value)throws Exception{String id=safeId(value.getString("audio"));J.atomic(new File(browserWork(),id+".capture.json"),J.bytes(value.toString()));}
 private synchronized JSONObject cachedRecordings()throws Exception{recoverBrowserRecording();JSONArray rows=new JSONArray();File[] files=browserWork().listFiles((d,n)->n.endsWith(".capture.json"));if(files!=null)for(File f:files){JSONObject r=J.json(f);String id=safeId(r.getString("audio"));if(browserAudio(id).isFile())rows.put(r);}return J.o("recordings",rows);}
 private synchronized void recoverBrowserRecording(){if(capture!=null)return;try{File journal=new File(browserWork(),"recording-active.json");if(!journal.isFile())return;JSONObject r=J.json(journal);String id=safeId(r.getString("audio"));File raw=new File(browserWork(),id+".pcm.part");if(raw.isFile()&&raw.length()<=MAX_SECONDS*SAMPLE_RATE*2L){byte[] bytes=Files.readAllBytes(raw.toPath());J.atomic(browserAudio(id),wav(bytes,16000));cacheDescriptor(J.o("audio",id,"session",safeId(r.getString("session")),"row",r.optString("row"),"stage",r.optString("stage"),"kind","user","seconds",bytes.length/32000.0,"at",System.currentTimeMillis()/1000.0,"interrupted",true));Files.delete(raw.toPath());}Files.deleteIfExists(journal.toPath());}catch(Exception e){event("error",J.o("message","上次录音尚未恢复，请重试 / Réessayez la récupération de l’enregistrement."));}}
 public void close(){background();examiner.close();model.close();speech.shutdownNow();recognitionClock.shutdownNow();}
}
