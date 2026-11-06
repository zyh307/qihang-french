#pragma once
// Linux arm64 HWCAP bits from asm/hwcap.h. Both scalar and vector half precision
// must be present: the compiler may use either with -march=armv8-a+fp16.
inline int qihang_android_features(unsigned long caps) {
 constexpr unsigned long fp16=(1UL<<9)|(1UL<<10),dotprod=1UL<<20;
 return ((caps&fp16)==fp16?1:0)|((caps&dotprod)?2:0);
}
