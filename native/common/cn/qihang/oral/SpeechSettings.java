package cn.qihang.oral;
/** Desktop CPUs can use more workers; retain the mobile memory/thermal budget. */
final class SpeechSettings {
 static int threads(int processors,boolean desktop){return Math.max(1,Math.min(desktop?16:4,processors-1));}
}
