#include <jni.h>
#include <whisper.h>
#include <ggml-backend.h>
#include <opus.h>
#include <atomic>
#include <mutex>
#include <string>
#include <vector>
#include <chrono>
#include <cstdlib>
#include "audio-window.h"
#ifdef _WIN32
#include <windows.h>
#include <wincrypt.h>
#endif
static std::mutex inference,decoderLock;
static std::atomic<bool> cancelled{false};
static std::atomic<int> recognitionStage{0},recognitionPercent{0};
static whisper_context* context=nullptr;
static std::string loaded;
static OpusDecoder* decoder=nullptr;
static int decoderRate=0;
static std::atomic<long long> loadMs{0},inferMs{0},encodeMs{0},decodeMs{0},inputSamples{0},usedThreads{0},usedGpu{0},audioContext{0};
using Clock=std::chrono::steady_clock;
static long long elapsed(Clock::time_point start){return std::chrono::duration_cast<std::chrono::milliseconds>(Clock::now()-start).count();}
static void fail(JNIEnv* env,const char* message){env->ThrowNew(env->FindClass("java/lang/IllegalStateException"),message);}
extern "C" JNIEXPORT void JNICALL Java_cn_qihang_oral_NativeSpeech_cancel(JNIEnv*,jclass){cancelled=true;}
extern "C" JNIEXPORT void JNICALL Java_cn_qihang_oral_NativeSpeech_prepare(JNIEnv*,jclass){cancelled=false;recognitionStage=1;recognitionPercent=0;}
extern "C" JNIEXPORT jintArray JNICALL Java_cn_qihang_oral_NativeSpeech_progress(JNIEnv* env,jclass){jint values[]={recognitionStage.load(),recognitionPercent.load()};auto result=env->NewIntArray(2);env->SetIntArrayRegion(result,0,2,values);return result;}
extern "C" JNIEXPORT jlongArray JNICALL Java_cn_qihang_oral_NativeSpeech_timings(JNIEnv* env,jclass){jlong values[]={loadMs.load(),inferMs.load(),encodeMs.load(),decodeMs.load(),inputSamples.load(),usedThreads.load(),usedGpu.load(),audioContext.load()};auto result=env->NewLongArray(8);env->SetLongArrayRegion(result,0,8,values);return result;}
extern "C" JNIEXPORT void JNICALL Java_cn_qihang_oral_NativeSpeech_release(JNIEnv*,jclass){cancelled=true;std::lock_guard<std::mutex> lock(inference);if(context)whisper_free(context);context=nullptr;loaded.clear();}
static bool ensureModel(JNIEnv* env,const std::string& model){
 loadMs=0;inferMs=0;encodeMs=0;decodeMs=0;
 if(!context||loaded!=model){recognitionStage=2;if(context)whisper_free(context);auto start=Clock::now();auto params=whisper_context_default_params();const char* gpu=std::getenv("QIHANG_ASR_GPU");params.use_gpu=!(gpu&&std::string(gpu)=="0");ggml_backend_load_all();usedGpu=params.use_gpu&&ggml_backend_dev_by_type(GGML_BACKEND_DEVICE_TYPE_GPU)!=nullptr;context=whisper_init_from_file_with_params(model.c_str(),params);if(!context&&params.use_gpu){params.use_gpu=false;usedGpu=0;context=whisper_init_from_file_with_params(model.c_str(),params);}loadMs=elapsed(start);loaded=model;if(!context){fail(env,"模型加载失败，请检查文件和可用内存 / Chargement du modèle impossible.");return false;}}
 return context!=nullptr;
}
extern "C" JNIEXPORT jboolean JNICALL Java_cn_qihang_oral_NativeSpeech_preload(JNIEnv* env,jclass,jstring path){
 std::lock_guard<std::mutex> lock(inference);recognitionStage=2;
 const char* raw=env->GetStringUTFChars(path,nullptr);std::string model(raw);env->ReleaseStringUTFChars(path,raw);
 bool ready=ensureModel(env,model);recognitionStage=0;
 if(cancelled&&!env->ExceptionCheck())fail(env,"语音准备已取消，请重试 / Préparation annulée, réessayez.");
 return ready&&usedGpu.load()?JNI_TRUE:JNI_FALSE;
}
static jstring transcribe(JNIEnv* env,jstring path,jfloatArray input,jint threads,bool shortAudio){
 std::lock_guard<std::mutex> lock(inference);struct ResetStage{~ResetStage(){recognitionStage=0;}} resetStage;
 if(cancelled){fail(env,"识别已取消 / Reconnaissance annulée.");return nullptr;}
 const char* raw=env->GetStringUTFChars(path,nullptr);std::string model(raw);env->ReleaseStringUTFChars(path,raw);
 if(!ensureModel(env,model))return nullptr;
 if(cancelled){fail(env,"识别已取消 / Reconnaissance annulée.");return nullptr;}recognitionStage=3;
 int count=env->GetArrayLength(input);if(count<1600||count>1920000){fail(env,"录音过短或过长 / Durée d’enregistrement invalide.");return nullptr;}std::vector<float> samples(count);env->GetFloatArrayRegion(input,0,count,samples.data());
 inputSamples=count;usedThreads=threads;whisper_reset_timings(context);auto inferenceStart=Clock::now();
 auto p=whisper_full_default_params(WHISPER_SAMPLING_GREEDY);p.n_threads=threads;p.language="fr";p.translate=false;p.no_context=true;p.print_progress=false;p.print_realtime=false;p.print_timestamps=false;p.print_special=false;p.suppress_blank=true;p.abort_callback=[](void*){return cancelled.load();};
 p.audio_ctx=shortAudio?qihang_short_audio_context(count,whisper_model_n_audio_ctx(context)):0;
 audioContext=p.audio_ctx?p.audio_ctx:whisper_model_n_audio_ctx(context);
 // One decoder avoids reserving five large KV caches on mobile. Timestamps are not used by this product.
 p.greedy.best_of=1;p.no_timestamps=true;p.progress_callback=[](whisper_context*,whisper_state*,int progress,void*){recognitionPercent=progress;};
 p.encoder_begin_callback=[](whisper_context*,whisper_state*,void*){return !cancelled.load();};
 if(whisper_full(context,p,samples.data(),count)!=0||cancelled){fail(env,"识别已取消或未完成 / Reconnaissance annulée ou incomplète.");return nullptr;}
 inferMs=elapsed(inferenceStart);const auto* timing=whisper_get_timings(context);if(timing){encodeMs=(long long)timing->encode_ms;decodeMs=(long long)(timing->decode_ms+timing->batchd_ms+timing->prompt_ms);}
 std::string text;for(int i=0;i<whisper_full_n_segments(context);i++)text+=whisper_full_get_segment_text(context,i);return env->NewStringUTF(text.c_str());
}
extern "C" JNIEXPORT jstring JNICALL Java_cn_qihang_oral_NativeSpeech_transcribe(JNIEnv* env,jclass,jstring path,jfloatArray input,jint threads){return transcribe(env,path,input,threads,false);}
extern "C" JNIEXPORT jstring JNICALL Java_cn_qihang_oral_NativeSpeech_transcribeShort(JNIEnv* env,jclass,jstring path,jfloatArray input,jint threads){return transcribe(env,path,input,threads,true);}
extern "C" JNIEXPORT jbyteArray JNICALL Java_cn_qihang_oral_NativeSpeech_decode(JNIEnv* env,jclass,jbyteArray bytes,jint rate,jboolean reset){std::lock_guard<std::mutex> lock(decoderLock);int error=0;if(reset||!decoder||decoderRate!=rate){if(decoder)opus_decoder_destroy(decoder);decoder=opus_decoder_create(rate,1,&error);decoderRate=rate;}if(!decoder||error){fail(env,"语音解码失败 / Décodage audio impossible.");return nullptr;}int size=env->GetArrayLength(bytes);if(size==0)return env->NewByteArray(0);if(size>65536){fail(env,"语音数据无效 / Audio invalide.");return nullptr;}std::vector<unsigned char> packet(size);env->GetByteArrayRegion(bytes,0,size,reinterpret_cast<jbyte*>(packet.data()));std::vector<opus_int16> pcm(rate*120/1000);int n=opus_decode(decoder,packet.data(),size,pcm.data(),(int)pcm.size(),0);if(n<0){fail(env,"语音解码失败 / Décodage audio impossible.");return nullptr;}auto out=env->NewByteArray(n*2);env->SetByteArrayRegion(out,0,n*2,reinterpret_cast<jbyte*>(pcm.data()));return out;}
extern "C" JNIEXPORT jbyteArray JNICALL Java_cn_qihang_oral_NativeSpeech_protect(JNIEnv* env,jclass,jbyteArray input,jboolean decrypt){
#ifdef _WIN32
 int n=env->GetArrayLength(input);std::vector<BYTE> data(n);env->GetByteArrayRegion(input,0,n,reinterpret_cast<jbyte*>(data.data()));DATA_BLOB in{(DWORD)n,data.data()},out{};BOOL ok=decrypt?CryptUnprotectData(&in,nullptr,nullptr,nullptr,nullptr,CRYPTPROTECT_UI_FORBIDDEN,&out):CryptProtectData(&in,L"Qihang French binding",nullptr,nullptr,nullptr,CRYPTPROTECT_UI_FORBIDDEN,&out);if(!ok){fail(env,"无法读取本机绑定凭证 / Informations de connexion indisponibles.");return nullptr;}auto result=env->NewByteArray(out.cbData);env->SetByteArrayRegion(result,0,out.cbData,reinterpret_cast<jbyte*>(out.pbData));SecureZeroMemory(out.pbData,out.cbData);LocalFree(out.pbData);return result;
#else
 fail(env,"请使用系统安全存储 / Stockage sécurisé requis.");return nullptr;
#endif
}
