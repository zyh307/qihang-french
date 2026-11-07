package cn.qihang.oral;
import com.sun.net.httpserver.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.file.*;
import java.awt.*;
import java.lang.management.ManagementFactory;
import java.security.SecureRandom;
import java.util.*;
import java.util.concurrent.*;
public final class WindowsApp implements Host {
 private static final int PORT=Integer.getInteger("qihang.port",5188);
 private static final String VERSION="2.5.1";
 private final File home,web;private OralCore core;private HttpServer server;private ReviewReminders reminders;
 private volatile long seen=System.currentTimeMillis();
 private final String cookie;
 WindowsApp(File home)throws Exception{this.home=home.getCanonicalFile();web=new File(home,"网页").getCanonicalFile();byte[] token=new byte[32];new SecureRandom().nextBytes(token);cookie=J.hex(token);}
 public byte[] protect(byte[] b){return NativeSpeech.protect(b,false);}
 public byte[] unprotect(byte[] b){return NativeSpeech.protect(b,true);}
 public long availableMemory(){return ((com.sun.management.OperatingSystemMXBean)ManagementFactory.getOperatingSystemMXBean()).getFreeMemorySize();}
 public void importModel(ModelStore store){new Thread(()->{try{FileDialog dialog=new FileDialog((Frame)null,"导入法语识别模型 / Importer le modèle",FileDialog.LOAD);dialog.setFile("*.bin");dialog.setVisible(true);if(dialog.getFile()!=null){File chosen=new File(dialog.getDirectory(),dialog.getFile());if(chosen.length()!=store.status().optLong("total"))throw new IOException("请选择 ggml-model-q5_0.bin（约1.08GB）。个人版ctranslate2文件夹和3GB的model.bin不适用于此原生版本 / Choisissez le modèle Q5 de 1,08 Go.");store.importFrom(new FileInputStream(chosen));}dialog.dispose();}catch(Exception e){javax.swing.JOptionPane.showMessageDialog(null,J.safe(e));}},"qihang-model-picker").start();}
 private void start()throws Exception{
  try{server=HttpServer.create(new InetSocketAddress(InetAddress.getByName("127.0.0.1"),PORT),24);}catch(BindException e){try{HttpURLConnection c=(HttpURLConnection)new URL("http://127.0.0.1:"+PORT+"/__qihang_health").openConnection();c.setReadTimeout(1500);JSONObject h=new JSONObject(new String(J.read(c.getInputStream(),4096),java.nio.charset.StandardCharsets.UTF_8));if(h.optBoolean("bundledAudio")&&h.optBoolean("nativeOral")&&"stable".equals(h.optString("channel"))&&VERSION.equals(h.optString("version"))&&Examiner.PROTOCOL_REVISION.equals(h.optString("oralProtocol"))){Desktop.getDesktop().browse(new URI("http://127.0.0.1:"+PORT+"/"));return;}}catch(Exception ignored){}throw new IOException("旧版本仍在运行，请关闭旧页面，稍候再打开 / Fermez l’ancienne page, puis réessayez après un instant.");}
  File data=dataDirectory();
  reminders=new ReviewReminders(home,data);
  JSONObject manifest=J.json(new File(home,"口语运行/model-manifest.json"));
  core=new OralCore(data,manifest,J.json(new File(home,"口语运行/evaluation-schema.json")),this);
  server.createContext("/",this::request);server.setExecutor(Executors.newFixedThreadPool(8));server.start();if(!Boolean.getBoolean("qihang.headless"))Desktop.getDesktop().browse(new URI("http://127.0.0.1:"+PORT+"/"));
  ScheduledExecutorService life=Executors.newSingleThreadScheduledExecutor();life.scheduleAtFixedRate(()->{if(System.currentTimeMillis()-seen>180000){core.close();server.stop(0);System.exit(0);}},30,30,TimeUnit.SECONDS);
  if(!Boolean.getBoolean("qihang.isolatedCheck"))life.scheduleAtFixedRate(()->reminders.check(false),5,15,TimeUnit.SECONDS);
  Runtime.getRuntime().addShutdownHook(new Thread(()->{if(core!=null)core.close();if(server!=null)server.stop(0);}));
 }
 private File dataDirectory()throws Exception{
  String explicit=System.getProperty("qihang.data","");
  if(!explicit.isEmpty())return new File(explicit).getCanonicalFile();
  // Optional local-only location survives an in-place update. It is deliberately
  // outside the release packer's allowlist and never carries somebody else's data.
  File location=new File(home,".qihang-data.json");
  if(location.isFile()){
   String value=J.json(location).optString("directory");
   if(value.trim().isEmpty())throw new IOException("本机数据位置配置为空，原记录未删除 / Emplacement des données manquant.");
   File directory=new File(value);return (directory.isAbsolute()?directory:new File(home,value)).getCanonicalFile();
  }
  return new File(System.getenv("LOCALAPPDATA"),"QihangFrench").getCanonicalFile();
 }
 private void request(HttpExchange x)throws IOException{
  try{String authority=x.getRequestHeaders().getFirst("Host"),origin=x.getRequestHeaders().getFirst("Origin"),site=x.getRequestHeaders().getFirst("Sec-Fetch-Site");if(!("127.0.0.1:"+PORT).equals(authority)||origin!=null&&!origin.equals("http://127.0.0.1:"+PORT)||"cross-site".equals(site)){reply(x,403,"text/plain",new byte[0]);return;}
   String path=x.getRequestURI().getPath();if("/__qihang_health".equals(path)){reply(x,200,"application/json",J.bytes(J.o("version",VERSION,"channel","stable","nativeOral",true,"bundledAudio",true,"oralProtocol",Examiner.PROTOCOL_REVISION).toString()));return;}
   if("/review-reminders".equals(path)){String cookies=x.getRequestHeaders().getFirst("Cookie"),type=x.getRequestHeaders().getFirst("Content-Type");if(!"POST".equals(x.getRequestMethod())||cookies==null||!Arrays.asList(cookies.split(";\\s*")).contains("QihangSession="+cookie)||type==null||!type.startsWith("application/json")){reply(x,403,"application/json",J.bytes("{}"));return;}seen=System.currentTimeMillis();if(Boolean.getBoolean("qihang.isolatedCheck")){reply(x,200,"application/json",J.bytes(J.o("ok",true,"nativeReminders",false,"scheduled",false).toString()));return;}boolean scheduled=reminders.sync(new JSONObject(new String(J.read(x.getRequestBody(),4*1024*1024),java.nio.charset.StandardCharsets.UTF_8)));reply(x,200,"application/json",J.bytes(J.o("ok",true,"nativeReminders",SystemTray.isSupported()&&!GraphicsEnvironment.isHeadless(),"scheduled",scheduled&&SystemTray.isSupported()&&!GraphicsEnvironment.isHeadless()).toString()));return;}
   if("/oral-api".equals(path)){String cookies=x.getRequestHeaders().getFirst("Cookie"),type=x.getRequestHeaders().getFirst("Content-Type");if(!"POST".equals(x.getRequestMethod())||cookies==null||!Arrays.asList(cookies.split(";\\s*")).contains("QihangSession="+cookie)||type==null||!type.startsWith("application/json")){reply(x,403,"application/json",J.bytes(J.o("ok",false,"error","请重新打开应用 / Rouvrez l’application.").toString()));return;}seen=System.currentTimeMillis();String result=core.call(new String(J.read(x.getRequestBody(),8*1024*1024),java.nio.charset.StandardCharsets.UTF_8));reply(x,200,"application/json",J.bytes(result));return;}
   if(!"GET".equals(x.getRequestMethod())&&!"HEAD".equals(x.getRequestMethod())){reply(x,405,"text/plain",new byte[0]);return;}if(path.equals("/"))path="/index.html";File file=new File(web,path.substring(1)).getCanonicalFile();if(!file.toPath().startsWith(web.toPath())||!file.isFile()){reply(x,404,"text/plain",new byte[0]);return;}
   x.getResponseHeaders().add("Set-Cookie","QihangSession="+cookie+"; HttpOnly; SameSite=Strict; Path=/");String mime=path.endsWith(".js")?"application/javascript":path.endsWith(".css")?"text/css":path.endsWith(".html")?"text/html":path.endsWith(".json")?"application/json":path.endsWith(".svg")?"image/svg+xml":path.endsWith(".mp3")?"audio/mpeg":path.endsWith(".png")?"image/png":path.endsWith(".webp")?"image/webp":"application/octet-stream";reply(x,200,mime,Files.readAllBytes(file.toPath()));
  }catch(Exception e){reply(x,500,"application/json",J.bytes(J.o("ok",false,"error",J.safe(e)).toString()));}finally{x.close();}
 }
 private void reply(HttpExchange x,int status,String type,byte[] body)throws IOException{x.getResponseHeaders().set("Content-Type",type+(type.startsWith("text/")||type.contains("json")||type.contains("javascript")?"; charset=utf-8":""));x.getResponseHeaders().set("Cache-Control","no-store");x.getResponseHeaders().set("X-Content-Type-Options","nosniff");x.getResponseHeaders().set("X-Qihang-App","cap-sur-le-francais");if("HEAD".equals(x.getRequestMethod())){x.getResponseHeaders().set("Content-Length",String.valueOf(body.length));x.sendResponseHeaders(status,-1);}else{x.sendResponseHeaders(status,body.length);x.getResponseBody().write(body);}}
 public static void main(String[] args){try{File home=new File(args.length>0?args[0]:".");if(Boolean.getBoolean("qihang.reminderOnly")){new ReviewReminders(home,new WindowsApp(home).dataDirectory()).check(true);System.exit(0);return;}new WindowsApp(home).start();}catch(Throwable e){javax.swing.JOptionPane.showMessageDialog(null,J.safe(e),"启航法语",javax.swing.JOptionPane.INFORMATION_MESSAGE);System.exit(1);}}
}
