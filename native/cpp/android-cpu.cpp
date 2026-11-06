#include <jni.h>
#include <sys/auxv.h>
#include "android-cpu-features.h"
// This probe is always compiled for baseline armv8-a, never for the fast variant.
extern "C" JNIEXPORT jint JNICALL Java_cn_qihang_oral_NativeSpeech_cpuFeatures(JNIEnv*,jclass){
 return qihang_android_features(getauxval(AT_HWCAP));
}
