package cn.qihang.oral;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import org.json.*;
public final class SessionStorageTest {
 static void require(boolean value,String text){if(!value)throw new AssertionError(text);}
 public static void main(String[] args)throws Exception{
  File root=Files.createTempDirectory("qihang_session_storage_").toFile();
  Host host=new Host(){public byte[] protect(byte[] b){return b;}public byte[] unprotect(byte[] b){return b;}public long availableMemory(){return Long.MAX_VALUE;}public void importModel(ModelStore store){}};
  JSONObject manifest=J.o("id","fixture","filename","absent.bin","size",8,"sha256","fixture","sources",new JSONArray().put(J.o("id","origin","url","https://example.invalid/model")));
  OralCore core=new OralCore(root,manifest,J.o(),host);
  try{
   String id=UUID.randomUUID().toString();JSONObject original=J.o("id",id,"phase","active","messages",new JSONArray(),"original_score",7);
   JSONObject result=new JSONObject(core.call(J.o("method","session.save","args",J.o("session",original)).toString()));require(result.getBoolean("ok"),"First save failed");
   JSONObject loaded=new JSONObject(core.call(J.o("method","session.get","args",J.o("id",id)).toString())).getJSONObject("value");require(loaded.getInt("original_score")==7,"Stored fields changed");
   File file=new File(root,"sessions/"+id+".json");byte[] before=Files.readAllBytes(file.toPath());Files.createDirectory(new File(file.getPath()+".tmp").toPath());
   result=new JSONObject(core.call(J.o("method","session.save","args",J.o("session",J.o("id",id,"phase","ended","messages",new JSONArray()))).toString()));
   require(!result.getBoolean("ok")&&result.getString("code").equals("session_save_failed"),"Write failure was not identified");
   require(result.getString("error").contains("已有记录未删除")&&!result.getString("error").contains(root.getPath()),"Unsafe or vague failure message");
   require(Arrays.equals(before,Files.readAllBytes(file.toPath())),"Failed save damaged original session");
   require(new File(root,"sessions").listFiles((d,n)->n.endsWith(".json")).length==1,"Records were added or lost on failure");
   float[] longAudio=new float[420*16000];
   Arrays.fill(longAudio,1);
   Arrays.fill(longAudio,117*16000,117*16000+3200,0);
   require(OralCore.segmentEnd(longAudio,0)==117*16000+1600,"Long recording should split at a quiet point");
   int position=0,segments=0;
   while(position<longAudio.length){
    int end=OralCore.segmentEnd(longAudio,position);
    require(end>position&&end-position<=120*16000,"JNI segment out of bounds");
    position=end;segments++;
   }
   require(segments==4&&position==longAudio.length,"Seven-minute audio was truncated");
   System.out.println("Session storage and long recording: 4 groups passed; temporary directory, no formal data or network.");
  }finally{core.close();}
 }
}
