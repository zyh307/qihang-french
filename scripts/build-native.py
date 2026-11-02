"""Pinned, explicit native build. Build tools stay local; no Python is shipped to users."""
import concurrent.futures, hashlib, json, os, pathlib, re, shutil, subprocess, sys
root=pathlib.Path(__file__).resolve().parent.parent
base=pathlib.Path('Q:/') if pathlib.Path('Q:/native/cpp/speech.cpp').is_file() else root
tools=pathlib.Path(os.environ.get('QIHANG_NATIVE_TOOLS',str(base/'.native-tools'))); target=sys.argv[1] if len(sys.argv)>1 else 'android'
whisper=tools/'whisper.cpp-1.8.3'; opus=tools/'opus-1.5.2'; out=tools/('manual-'+target);out.mkdir(exist_ok=True)
def groups(file,names):
    text=(opus/file).read_text(); result=[]
    for name in names:
        m=re.search(r'^'+name+r'\s*=\s*(.*?)(?=\n\s*\n|\Z)',text,re.M|re.S)
        if not m:raise RuntimeError('Missing source list '+name)
        result.extend(opus/p for p in m.group(1).replace('\\\n',' ').split() if p.endswith('.c'))
    return result
sources=groups('opus_sources.mk',['OPUS_SOURCES','OPUS_SOURCES_FLOAT'])+groups('celt_sources.mk',['CELT_SOURCES'])+groups('silk_sources.mk',['SILK_SOURCES','SILK_SOURCES_FLOAT'])
config='''#define OPUS_BUILD 1
#define USE_ALLOCA 1
#define HAVE_ALLOCA_H 1
#define HAVE_LRINT 1
#define HAVE_LRINTF 1
#define PACKAGE_VERSION "1.5.2"
#define OPUS_VERSION "1.5.2"
#define restrict __restrict
'''
(out/'config.h').write_text(config)
flags=['-O3','-fPIC','-DHAVE_CONFIG_H','-DOPUS_BUILD','-I'+str(out),'-I'+str(opus),'-I'+str(opus/'include'),'-I'+str(opus/'celt'),'-I'+str(opus/'silk'),'-I'+str(opus/'silk/float')]
if target=='android':
    llvm=tools/'android-ndk-r27d/toolchains/llvm/prebuilt/windows-x86_64'
    cc=llvm/'bin/clang.exe';cxx=llvm/'bin/clang++.exe';flags+=['--target=aarch64-none-linux-android26','--sysroot='+str(llvm/'sysroot'),'-march=armv8-a','-D_GNU_SOURCE']
    g=whisper/'ggml/src'; common=['ggml.c','ggml.cpp','ggml-alloc.c','ggml-backend.cpp','ggml-opt.cpp','ggml-threading.cpp','ggml-quants.c','gguf.cpp','ggml-backend-reg.cpp','ggml-cpu/ggml-cpu.c','ggml-cpu/ggml-cpu.cpp','ggml-cpu/repack.cpp','ggml-cpu/hbm.cpp','ggml-cpu/quants.c','ggml-cpu/traits.cpp','ggml-cpu/amx/amx.cpp','ggml-cpu/amx/mmq.cpp','ggml-cpu/binary-ops.cpp','ggml-cpu/unary-ops.cpp','ggml-cpu/vec.cpp','ggml-cpu/ops.cpp','ggml-cpu/arch/arm/quants.c','ggml-cpu/arch/arm/repack.cpp']
    sources += [g/n for n in common]+[whisper/'src/whisper.cpp']
    flags+=['-DGGML_USE_CPU','-DGGML_VERSION="0.9.5"','-DGGML_COMMIT="whisper-v1.8.3"','-DWHISPER_VERSION="1.8.3"','-I'+str(whisper/'ggml/include'),'-I'+str(g),'-I'+str(g/'ggml-cpu')]
    library=root/'android/jniLibs/arm64-v8a/libqihang_speech.so'
else:
    mingw=pathlib.Path(os.environ.get('QIHANG_MINGW_BIN','D:/mingw64/bin'))
    jdk=pathlib.Path(os.environ.get('QIHANG_JDK_HOME','D:/'))
    cc=mingw/'gcc.exe';cxx=mingw/'g++.exe';flags+=['-I'+str(jdk/'include'),'-I'+str(jdk/'include/win32'),'-I'+str(whisper/'ggml/include')]
    library=root/'native/build/windows/qihang_speech.dll'
sources += [base/'native/cpp/speech.cpp'];flags+=['-I'+str(whisper/'include')]
def compile_one(item):
    i,source=item;obj=out/(str(i)+'.o');command=[str(cxx if source.suffix=='.cpp' else cc),*flags,*(['-std=c++17'] if source.suffix=='.cpp' else ['-std=gnu11']),'-c',str(source),'-o',str(obj)]
    signature=hashlib.sha256((' '.join(command)+str(source.stat().st_mtime_ns)).encode()).hexdigest();stamp=out/(str(i)+'.stamp')
    if obj.is_file() and stamp.is_file() and stamp.read_text()==signature:return obj
    result=subprocess.run(command,capture_output=True)
    (out/(str(i)+'.log')).write_bytes(result.stdout+result.stderr)
    if result.returncode:raise RuntimeError(str(source)+'\n'+(result.stdout+result.stderr).decode('utf-8','replace')[-5000:])
    stamp.write_text(signature);return obj
print('Compiling',target,len(sources),'sources',flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:objects=list(pool.map(compile_one,enumerate(sources)))
library.parent.mkdir(parents=True,exist_ok=True)
link=[str(cxx),*([f'--target=aarch64-none-linux-android26','--sysroot='+str(llvm/'sysroot'),'-static-libstdc++','-Wl,-z,max-page-size=16384','-Wl,--no-undefined','-llog','-latomic','-lm'] if target=='android' else ['-static-libgcc','-static-libstdc++']),'-shared','-o',str(library),*[str(o) for o in objects]]
if target!='android':
    whisper_dll=pathlib.Path(os.environ.get('QIHANG_WHISPER_DLL',str(tools/'whisper-win/Release/whisper.dll')))
    if not whisper_dll.is_file():whisper_dll=next((tools/'whisper-win').rglob('whisper.dll'))
    link += [str(whisper_dll),str(whisper_dll.with_name('ggml.dll')),str(whisper_dll.with_name('ggml-base.dll')),'-lcrypt32']
result=subprocess.run(link,capture_output=True);(out/'link.log').write_bytes(result.stdout+result.stderr)
if result.returncode:raise RuntimeError((result.stdout+result.stderr).decode('utf-8','replace')[-6000:])
print('Native library:',library,library.stat().st_size,'bytes',flush=True)
