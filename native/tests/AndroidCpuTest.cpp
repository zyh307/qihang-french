#include "../cpp/android-cpu-features.h"
#include <cassert>
#include <iostream>
int main(){
 assert(qihang_android_features(0)==0);
 assert(qihang_android_features(1UL<<9)==0);
 assert(qihang_android_features(1UL<<10)==0);
 assert(qihang_android_features((1UL<<9)|(1UL<<10))==1);
 assert(qihang_android_features(1UL<<20)==2);
 assert(qihang_android_features((1UL<<9)|(1UL<<10)|(1UL<<20))==3);
 std::cout<<"Android capability probe: 6 isolated cases passed.\n";
}
