package cn.qihang.oral;
import org.json.*;
import java.io.*;
import java.lang.reflect.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;

public final class ExaminerProtocolTest implements AutoCloseable {
 private final List<JSONObject> events=new ArrayList<>();
 private final Examiner examiner;
 private final SecureSocket socket=new SecureSocket("",Map.of(),null);
 private final Path temp;
 ExaminerProtocolTest()throws Exception{
  temp=Files.createTempDirectory("qihang-examiner-test-");
  Host host=new Host(){public byte[] protect(byte[] data){return data;}public byte[] unprotect(byte[] data){return data;}public void importModel(ModelStore m){}public long availableMemory(){return Long.MAX_VALUE;}};
  examiner=new Examiner(temp.toFile(),host,J.o(),(type,value)->events.add(J.o("type",type,"value",value)));
  set("state",J.o("status","connected"));set("socket",socket);
 }
 private void set(String field,Object value)throws Exception{Field f=Examiner.class.getDeclaredField(field);f.setAccessible(true);f.set(examiner,value);}
 private Object get(String field)throws Exception{Field f=Examiner.class.getDeclaredField(field);f.setAccessible(true);return f.get(examiner);}
 private void incoming(JSONObject value)throws Exception{invoke("incoming",JSONObject.class,value);}
 private void invoke(String method,Class<?> type,Object arg)throws Exception{Method m=Examiner.class.getDeclaredMethod(method,type);m.setAccessible(true);m.invoke(examiner,arg);}
 private JSONObject task(String mode){return J.o("turn_id","isolated-turn","mode",mode,"stage","intro","recent_dialogue",new JSONArray().put(J.o("role","user","text","J’étudie à l’université.")));}
 private void readTask()throws Exception{incoming(J.o("type","mcp","payload",J.o("jsonrpc","2.0","id",1,"method","tools/call","params",J.o("name","self.french_exam.get_current_task","arguments",J.o()))));}
 private boolean saw(String type){return events.stream().anyMatch(e->e.optString("type").equals(type));}
 private static void check(boolean condition,String message){if(!condition)throw new AssertionError(message);}
 public void close()throws Exception{examiner.close();Files.deleteIfExists(temp);}

 public static void main(String[] args)throws Exception{
  int passed=0;
  for(String mode:new String[]{"practice","simulation","evaluation"}){
   try(ExaminerProtocolTest t=new ExaminerProtocolTest()){
    t.examiner.submit(t.task(mode),"继续引导问答");
    JSONObject request=t.socket.sent.get(0);
    check(request.getString("text").equals("读取当前任务"),"Detect must explicitly request current-task tool");
    check(J.bytes(request.getString("text")).length<=24,"Detect must remain a short wake/control phrase");
    check(!request.toString().contains("université"),"Learner transcript must be transferred through MCP only");
    check(((ScheduledFuture<?>)t.get("deadline")).getDelay(TimeUnit.SECONDS)<=18,"Missing task must not wait 90 seconds");
    t.incoming(J.o("type","tts","state","sentence_start","text","WRONG OPENING"));check(!t.saw("sentence"),"Unscoped reply must remain blocked");
    t.readTask();check(t.saw("task_read"),"Current task must be observed");
    JSONObject response=t.socket.sent.get(1).getJSONObject("payload").getJSONObject("result");
    check(response.getJSONArray("content").getJSONObject(0).getString("text").contains("université"),"MCP must contain actual learner evidence");
    long remaining=((ScheduledFuture<?>)t.get("deadline")).getDelay(TimeUnit.SECONDS);check(remaining>=88&&remaining<=90,"Read task must switch to reply deadline");
    Object replyDeadline=t.get("deadline");t.readTask();check(t.get("deadline")==replyDeadline,"Repeated task reads must not extend reply timeout indefinitely");
    t.incoming(J.o("type","tts","state","start"));t.incoming(J.o("type","tts","state","sentence_start","text","Bonjour !"));t.incoming(J.o("type","tts","state","stop"));
    check(t.saw("sentence")&&t.saw("turn_end")&&!t.examiner.state().optBoolean("busy"),"Valid task-scoped reply must complete");passed++;
   }
  }
  try(ExaminerProtocolTest t=new ExaminerProtocolTest()){
   t.examiner.submit(t.task("practice"),"陪练引导问答");t.incoming(J.o("type","tts","state","stop"));
   check(t.saw("error")&&!t.examiner.state().optBoolean("busy"),"Empty stop without start must report error immediately");passed++;
  }
  try(ExaminerProtocolTest t=new ExaminerProtocolTest()){
   t.examiner.submit(t.task("practice"),"继续引导问答");t.readTask();t.incoming(J.o("type","tts","state","stop"));
   check(t.saw("error")&&!t.saw("turn_end"),"Empty task-scoped reply is not a completed turn");passed++;
  }
  try(ExaminerProtocolTest t=new ExaminerProtocolTest()){
   t.examiner.submit(t.task("practice"),"继续引导问答");t.invoke("expireTurn",String.class,"isolated-turn");
   check(t.saw("error")&&!t.examiner.state().optBoolean("busy"),"Task deadline must release waiting state");passed++;
  }
  try(ExaminerProtocolTest t=new ExaminerProtocolTest()){
   t.examiner.submit(t.task("practice"),"继续引导问答");
   t.incoming(J.o("type","alert","status","Error","message","api_key=sk-isolated-fake-secret12345 quota exceeded"));
   check(t.saw("error")&&!t.events.toString().contains("sk-isolated"),"Platform failure must be surfaced with credentials redacted");passed++;
  }
  System.out.println("Examiner protocol: "+passed+" groups passed; no network, model or personal data used.");
 }
}
