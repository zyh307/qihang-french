#include "../cpp/audio-window.h"
#include <cassert>
#include <iostream>
int main(){
 assert(qihang_short_audio_context(3*16000,1500)==512);
 assert(qihang_short_audio_context(10*16000,1500)==640);
 assert(qihang_short_audio_context(28*16000,1500)==0);
 assert(qihang_short_audio_context(120*16000,1500)==0);
 assert(qihang_short_audio_context(0,1500)==0);
 assert(qihang_short_audio_context(16000,128)==0);
 for(int samples=1600;samples<=1920000;samples+=319){
  const int n=qihang_short_audio_context(samples,1500);
  if(n){assert(n>=512&&n<1500&&n%128==0);assert(n*320>=samples+2*16000);}
  if(samples>=28*16000)assert(n==0);
 }
 std::cout<<"Short audio window: 6 boundaries and full supported input range passed.\n";
}
