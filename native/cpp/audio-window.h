#pragma once
// Encoder positions represent 320 input samples (20ms at 16kHz). Cover every
// original sample plus two seconds of padding. Long clips retain normal chunking.
inline int qihang_short_audio_context(int samples,int model_context) {
 if(samples<=0||samples>=28*16000||model_context<512)return 0;
 const int required=(samples+2*16000+319)/320;
 const int rounded=((required+127)/128)*128;
 const int context=rounded<512?512:rounded;
 return context<model_context?context:0;
}
