package cn.qihang.oral;
/** Select before loading JNI inference code: unsupported instructions must never run. */
final class NativeLibraries {
 interface Loader {void load(String name);int features();}
 static String load(boolean android,Loader loader){
  if(android){
   int features=0;
   try{loader.load("qihang_cpu");features=loader.features();}catch(UnsatisfiedLinkError ignored){}
   if((features&3)==3){try{loader.load("qihang_speech_dotprod");return "arm64-fp16-dotprod";}catch(UnsatisfiedLinkError ignored){}}
   if((features&1)==1){try{loader.load("qihang_speech_fp16");return "arm64-fp16";}catch(UnsatisfiedLinkError ignored){}}
  }
  loader.load("qihang_speech");return "baseline";
 }
}
