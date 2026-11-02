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
 private static final String VERSION="2.1.1-beta.1";
 private final File home,web;private OralCore core;private HttpServer server;
 private volatile long seen=System.currentTimeMillis();
 private final String cookie;
 WindowsApp(File home)throws Exception{this.home=home.getCanonicalFile();web=new File(home,"网页").getCanonicalFile();byte[] token=new byte[32];new SecureRandom().nextBytes(token);cookie=J.hex(token);}
 public byte[] protect(byte[] b){return NativeSpeech.protect(b,false);}
 public byte[] unprotect(byte[] b){return NativeSpeech.protect(b,true);}
 public long availableMemory(){return ((com.sun.management.OperatingSystemMXBean)ManagementFactory.getOperatingSystemMXBean()).getFreeMemorySize();}
 public void importModel(ModelStore store){new Thread(()->{try{FileDialog dialog=new FileDialog((Frame)null,"导入法语识别模型 / Importer le modèle",FileDialog.LOAD);dialog.setFile("*.bin");dialog.setVisible(true);if(dialog.getFile()!=null)store.importFrom(new FileInputStream(new File(dialog.getDirectory(),dialog.getFile())));dialog.dispose();}catch(Exception e){javax.swing.JOptionPane.showMessageDialog(null,J.safe(e));}},"qihang-model-picker").start();}
 private void start()throws Exception{
  try{server=HttpServer.create(new InetSocketAddress(InetAddress.getByName("127.0.0.1"),PORT),24);}catch(BindException e){try{HttpURLConnection c=(HttpURLConnection)new URL("http://127.0.0.1:"+PORT+"/__qihang_health").openConnection();c.setReadTimeout(1500);JSONObject h=new JSONObject(new String(J.read(c.getInputStream(),4096),java.nio.charset.StandardCharsets.UTF_8));if(h.optBoolean("nativeOral")&&"stable".equals(h.optString("channel"))&&VERSION.equals(h.optString("version"))&&Examiner.PROTOCOL_REVISION.equals(h.optString("oralProtocol"))){Desktop.getDesktop().browse(new URI("http://127.0.0.1:"+PORT+"/"));return;}}catch(Exception ignored){}throw new IOException("请关闭旧版全部页面，等待后台退出（约3分钟）后重试 / Fermez les anciennes pages et attendez l’arrêt du service (environ 3 min).");}
  File data=new File(System.getProperty("qihang.data",new File(System.getenv("LOCALAPPDATA"),"QihangFrench").getPath()));
  core=new OralCore(data,J.json(new File(home,"口语运行/model-manifest.json")),J.json(new File(home,"口语运行/evaluation-schema.json")),this);
  server.createContext("/",this::request);server.setExecutor(Executors.newFixedThreadPool(8));server.start();if(!Boolean.getBoolean("qihang.headless"))Desktop.getDesktop().browse(new URI("http://127.0.0.1:"+PORT+"/"));
  ScheduledExecutorService life=Executors.newSingleThreadScheduledExecutor();life.scheduleAtFixedRate(()->{if(System.currentTimeMillis()-seen>180000){core.close();server.stop(0);System.exit(0);}},30,30,TimeUnit.SECONDS);
  Runtime.getRuntime().addShutdownHook(new Thread(()->{if(core!=null)core.close();if(server!=null)server.stop(0);}));
 }
 private void request(HttpExchange x)throws IOException{
  try{String authority=x.getRequestHeaders().getFirst("Host"),origin=x.getRequestHeaders().getFirst("Origin"),site=x.getRequestHeaders().getFirst("Sec-Fetch-Site");if(!("127.0.0.1:"+PORT).equals(authority)||origin!=null&&!origin.equals("http://127.0.0.1:"+PORT)||"cross-site".equals(site)){reply(x,403,"text/plain",new byte[0]);return;}
   String path=x.getRequestURI().getPath();if("/__qihang_health".equals(path)){reply(x,200,"application/json",J.bytes(J.o("version",VERSION,"channel","stable","nativeOral",true,"oralProtocol",Examiner.PROTOCOL_REVISION).toString()));return;}
   if("/oral-api".equals(path)){String cookies=x.getRequestHeaders().getFirst("Cookie"),type=x.getRequestHeaders().getFirst("Content-Type");if(!"POST".equals(x.getRequestMethod())||cookies==null||!Arrays.asList(cookies.split(";\\s*")).contains("QihangSession="+cookie)||type==null||!type.startsWith("application/json")){reply(x,403,"application/json",J.bytes(J.o("ok",false,"error","请重新打开应用 / Rouvrez l’application.").toString()));return;}seen=System.currentTimeMillis();String result=core.call(new String(J.read(x.getRequestBody(),8*1024*1024),java.nio.charset.StandardCharsets.UTF_8));reply(x,200,"application/json",J.bytes(result));return;}
   if(!"GET".equals(x.getRequestMethod())&&!"HEAD".equals(x.getRequestMethod())){reply(x,405,"text/plain",new byte[0]);return;}if(path.equals("/"))path="/index.html";File file=new File(web,path.substring(1)).getCanonicalFile();if(!file.toPath().startsWith(web.toPath())||!file.isFile()){reply(x,404,"text/plain",new byte[0]);return;}
   x.getResponseHeaders().add("Set-Cookie","QihangSession="+cookie+"; HttpOnly; SameSite=Strict; Path=/");String mime=path.endsWith(".js")?"application/javascript":path.endsWith(".css")?"text/css":path.endsWith(".html")?"text/html":path.endsWith(".json")?"application/json":path.endsWith(".svg")?"image/svg+xml":path.endsWith(".mp3")?"audio/mpeg":path.endsWith(".png")?"image/png":path.endsWith(".webp")?"image/webp":"application/octet-stream";reply(x,200,mime,Files.readAllBytes(file.toPath()));
  }catch(Exception e){reply(x,500,"application/json",J.bytes(J.o("ok",false,"error",J.safe(e)).toString()));}finally{x.close();}
 }
 private void reply(HttpExchange x,int status,String type,byte[] body)throws IOException{x.getResponseHeaders().set("Content-Type",type+(type.startsWith("text/")||type.contains("json")||type.contains("javascript")?"; charset=utf-8":""));x.getResponseHeaders().set("Cache-Control","no-store");x.getResponseHeaders().set("X-Content-Type-Options","nosniff");x.getResponseHeaders().set("X-Qihang-App","cap-sur-le-francais");if("HEAD".equals(x.getRequestMethod())){x.getResponseHeaders().set("Content-Length",String.valueOf(body.length));x.sendResponseHeaders(status,-1);}else{x.sendResponseHeaders(status,body.length);x.getResponseBody().write(body);}}
 public static void main(String[] args){try{new WindowsApp(new File(args.length>0?args[0]:".")).start();}catch(Throwable e){javax.swing.JOptionPane.showMessageDialog(null,J.safe(e),"启航法语",javax.swing.JOptionPane.INFORMATION_MESSAGE);System.exit(1);}}
}
