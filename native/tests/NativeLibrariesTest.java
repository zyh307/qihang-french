package cn.qihang.oral;
import java.util.*;
public final class NativeLibrariesTest {
 static final class Fake implements NativeLibraries.Loader {
  final int capabilities;final Set<String> missing;final List<String> loaded=new ArrayList<>();
  Fake(int caps,String... missing){capabilities=caps;this.missing=new HashSet<>(Arrays.asList(missing));}
  public void load(String name){loaded.add(name);if(missing.contains(name))throw new UnsatisfiedLinkError("isolated missing library");}
  public int features(){return capabilities;}
 }
 static void check(boolean android,int caps,String expected,String... missing){
  Fake loader=new Fake(caps,missing);String result=NativeLibraries.load(android,loader);
  if(!result.equals(expected))throw new AssertionError(result);
  if(!android&&!loader.loaded.equals(Arrays.asList("qihang_speech")))throw new AssertionError("Desktop probed Android");
  if((caps&1)==0&&(loader.loaded.contains("qihang_speech_fp16")||loader.loaded.contains("qihang_speech_dotprod")))throw new AssertionError("Unsupported FP16 loaded");
  if((caps&2)==0&&loader.loaded.contains("qihang_speech_dotprod"))throw new AssertionError("Unsupported dotprod loaded");
 }
 public static void main(String[] args){
  check(false,3,"baseline");check(true,0,"baseline");check(true,2,"baseline");
  check(true,1,"arm64-fp16");check(true,3,"arm64-fp16-dotprod");
  check(true,3,"arm64-fp16","qihang_speech_dotprod");
  check(true,3,"baseline","qihang_speech_dotprod","qihang_speech_fp16");
  check(true,3,"baseline","qihang_cpu");
  System.out.println("Android library selection: 8 isolated cases passed.");
 }
}
