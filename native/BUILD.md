# 本地口语构建

本目录实现 Windows / Android 的模型管理、当前设备 Whisper 识别、小智独立身份和考试任务工具。终端用户不需要构建工具。

## 固定依赖

- 模型：`bofenghuang/whisper-large-v3-french`，提交 `90a7cd1fea9cd69f80f5a0fc49738418dba96083`。`ggml-model-q5_0.bin`，1,081,140,203 字节；SHA-256：`d8da7cb6cdadfac47829abf46fe8cd36fcfef06db5601bfd8acbcd40579010a5`。权重不打进安装包。
- whisper.cpp：`ggml-org/whisper.cpp` v1.8.3；源码 https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v1.8.3.zip 。Windows DLL 来自该版本官方 `whisper-bin-x64.zip`，安卓使用同版源码。
- Opus：1.5.2，https://downloads.xiph.org/releases/opus/opus-1.5.2.tar.gz 。
- JSON-java：20240303，https://repo.maven.apache.org/maven2/org/json/json/20240303/json-20240303.jar 。安卓使用系统 org.json。
- Windows JRE：Eclipse Temurin 21.0.13+9 x64，下载地址和校验值由 `scripts/build-windows-host.mjs` 读取的 `.native-tools/jre-assets.json` 固定，并写入运行包的 `runtime-source.json`。完整 legal 目录随包提供。
- Windows 原生编译：MinGW-w64 GCC 8.1.0；OpenMP 依赖 Microsoft Visual C++ Runtime 14.44.35211.0 x64，许可随包。
- 安卓：NDK r27d、API 26、ARM64；原生库静态链接 libc++，ELF 加载页对齐 16 KB。

各依赖遵循自己的许可，见 `licenses/`。应用原创代码为 GPL-3.0-only。

## 构建环境布局

`scripts/build-native.py` 使用 `.native-tools/whisper.cpp-1.8.3`、`.native-tools/opus-1.5.2`、`.native-tools/android-ndk-r27d`。Windows 动态库放 `.native-tools/whisper-win/Release`，JSON jar 放 `.native-tools/json.jar`。构建工具目录不随产品分发。

当前维护环境的 JDK 位于 `D:/bin`，MinGW 位于 `D:/mingw64/bin`；换电脑时调整对应脚本路径。Javac 以 source / target 17 生成字节码，Windows 随包运行于 JRE 21。Android SDK 布局由 `scripts/build-android.mjs` 的 `QIHANG_ANDROID_TOOLS` 指定。

Windows 运行环境档案是 `.native-tools/temurin-jre.zip`，解压到 `.native-tools/jre`，对应官方资产 JSON 放 `.native-tools/jre-assets.json`。OpenMP 文件从微软官方 `vc_redist.x64.exe` 的 x64 可再分发 CAB 提取，当前脚本读取 `.native-tools/vcredist-cabs/1/expanded-a12/vcomp140.dll_amd64`。脚本只复制运行库，不要求终端用户安装此 EXE。

依次执行：

```text
python scripts/export-oral-bank.py
python scripts/build-native.py windows
python scripts/build-native.py android
npm run build:share
npm run build:apk
```

安卓原生构建现在同时生成ARM64基础、FP16和FP16+dotprod三种完整推理库，另有仅含HWCAP探测的基础库。探测库不使用扩展指令；Java在加载推理JNI前根据系统能力选择，缺库／加载失败退到受支持的低一级实现。打包必须带齐4个so，不能只复制旧libqihang_speech.so。`build-android.mjs`会检查缺失及打包字节一致性。CMake单库入口不会产出这组变体，正式安卓包请使用上述Python入口。

`recognizer.cpuLibrary`及识别结果的`nativeLibrary`标明实际选用实现，练习记录的recognition.native_library保留这一诊断值。模型、量化等级、语言、音频上下文和解码策略不变；没有启用远程识别或上传原声。不同硬件浮点指令可能出现数值差异，准确度仍需原句对照复测。

后续test2仅在Android明确opt-in时使用transcribeShort入口，根据录音时长缩小短句计算窗口；默认接口与Windows仍是完整窗口。详见docs/安卓短句窗口试验_20261104.md，不能将试验行为泛称为上下文未改变。JNI timings末尾增加audio_context，Java兼容旧Windows七项计时数组。重编Android库时本地头文件也纳入缓存指纹，避免只改窗口头文件却复用旧对象。

Python 仅用于维护时导出题库、编译原生库，不进入成品。原模块及其参考答案保留于 `oral-assistant`，主应用只复制运行需要的题库和界面文件。

## 运行及数据边界

Windows 启动器使用自带 javaw，内部 HTTP 仅监听 `127.0.0.1:5188`。更新保留原有浏览器来源和词汇 IndexedDB。词汇页面通过心跳维持后台；全部页面关闭后后台超时退出。模型、口语历史和受当前 Windows 用户 DPAPI 保护的绑定位于 `%LOCALAPPDATA%/QihangFrench`。

安卓模型与口语历史放应用持久私有目录，绑定通过 Android Keystore AES-GCM 加密。两个平台更新保留数据，分别生成安装身份，不导出身份或凭证。

`model-manifest.json` 固定模型来源、版本、大小和校验值。模型作为独立 Release 资产分发，两端只提供本地导入及删除入口。导入先校验，再原子替换持久目录内的模型。

小智采用软件设备 Activation-Version 1、官方 OTA 和安全 WebSocket，考试工具由本机提供。当前仅实现 WebSocket v1 配置；若账号只返回 MQTT 配置，会明确失败，不假装连接。激活、握手及两项考试工具初始化完成后才显示已连接。

## 交付与检查

测试版 APK 包名为 `cn.qihang.francais`，活动及组件使用原 Java 类的完整名称，分享 authority 独立，沿用原应用身份覆盖更新。测试版后续沿用此包名及签名更新；私钥与密码禁止进入分享包或源码包。Windows ZIP 只打包显式文件白名单。交付不含权重、个人身份、录音、历史、测试缓存或开发工具。不要将 `.native-tools`、`android/signing`、`native/build` 当作源码分发。

构建和静态检查不代替目标设备完整链路验收。发布前应分别验证目标电脑和手机的识别、绑定、对话及回听。
