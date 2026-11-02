package cn.qihang.oral;
public final class SpeechSettingsTest {
 public static void main(String[] args){
  if(SpeechSettings.threads(1,true)!=1||SpeechSettings.threads(2,true)!=1)throw new AssertionError("Low-core machines must retain a valid worker budget");
  if(SpeechSettings.threads(32,true)<=4||SpeechSettings.threads(32,true)>16)throw new AssertionError("Desktop must not retain the old four-thread ceiling or oversubscribe all cores");
  if(SpeechSettings.threads(32,false)!=4)throw new AssertionError("Mobile worker budget must remain unchanged");
  for(int n=1;n<=128;n++)if(SpeechSettings.threads(n,true)<1||SpeechSettings.threads(n,true)>n)throw new AssertionError("Worker count exceeds available CPUs");
  System.out.println("Speech settings: 4 groups passed.");
 }
}
