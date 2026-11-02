package cn.qihang.oral;
import org.json.*;
import java.nio.*;
import java.nio.file.*;
public final class AsrBench {
 public static void main(String[] args)throws Exception{
  JSONArray results=new JSONArray();int threads=Integer.parseInt(args[3]);
  for(int i=0;i<3;i++){
   String file=args[i==2?2:1];byte[] wav=Files.readAllBytes(Path.of(file));
   ByteBuffer pcm=ByteBuffer.wrap(wav,44,wav.length-44).order(ByteOrder.LITTLE_ENDIAN);
   float[] samples=new float[(wav.length-44)/2];for(int n=0;n<samples.length;n++)samples[n]=pcm.getShort()/32768f;
   NativeSpeech.prepare();long started=System.nanoTime();String text=NativeSpeech.transcribe(args[0],samples,threads);
   JSONObject row=J.o("round",i,"cold",i==0,"seconds",samples.length/16000.0,"threads",threads,"elapsedMs",(System.nanoTime()-started)/1000000,"text",text);
   try{row.put("timings",new JSONArray((long[])NativeSpeech.class.getMethod("timings").invoke(null)));}catch(ReflectiveOperationException ignored){}
   results.put(row);Files.writeString(Path.of(args[4]),results.toString(2));System.out.println(row.toString());
  }
  NativeSpeech.release();
 }
}
