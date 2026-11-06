package cn.qihang.oral;
/** Protocol tests only; no model or audio decoder is loaded. */
public final class NativeSpeech {
 public static final String CPU_LIBRARY="isolated-test";
 public static final boolean ANDROID=false;
 public static void release(){}
 public static void prepare(){}
 public static void cancel(){}
 public static boolean preload(String path){throw new AssertionError("No real model in protocol/storage tests");}
 public static String transcribe(String path,float[] samples,int threads){throw new AssertionError("No real ASR in protocol/storage tests");}
 public static String transcribeShort(String path,float[] samples,int threads){throw new AssertionError("No real ASR in protocol/storage tests");}
 public static long[] timings(){return new long[7];}
 public static int[] progress(){return new int[2];}
 public static byte[] decode(byte[] packet,int rate,boolean reset){return new byte[0];}
}
