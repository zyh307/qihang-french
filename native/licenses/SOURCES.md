# 本地口语组件


- 法语模型：bofenghuang/whisper-large-v3-french，MIT；固定提交 `90a7cd1fea9cd69f80f5a0fc49738418dba96083`。文件、大小和 SHA-256 见 model-manifest.json。作者模型卡随附。权重单独下载，不随软件分发。
- whisper.cpp / ggml：ggml-org/whisper.cpp `v1.8.3`，MIT。Windows 使用该版本的官方 x64 动态库；安卓由相同源码编译 ARM64 CPU 实现。
- Opus：Xiph.Org `1.5.2`，BSD。https://downloads.xiph.org/releases/opus/opus-1.5.2.tar.gz
- JSON-java：stleary/JSON-java `20240303`，附原始许可。安卓使用系统 org.json。
- Windows Java 运行环境：Eclipse Temurin `21.0.13+9` JRE x64，GPLv2 with Classpath Exception；完整 LICENSE、NOTICE 和 legal 目录随运行环境提供。来源与 SHA-256 见 runtime-source.json。
- Windows C++ 辅助库：MinGW-w64 GCC 8.1.0，GCC Runtime Library Exception；winpthreads 原许可随附。
- Microsoft Visual C++ OpenMP Runtime：`vcomp140.dll` x64，14.44.35211.0。取自 Microsoft 官方 Visual C++ 2015–2022 Redistributable，下载来源与校验值见 runtime-source.json；许可见 Microsoft-Visual-C++-Runtime.rtf。仅按可再分发组件随 Windows 运行包提供。
- Android NDK `r27d` 只用于构建，不随软件分发。
- 小智协议参考：78/xiaozhi-esp32 的 OTA 激活、WebSocket 与 MCP 实现。客户端不包含小智云端服务、他人身份或任何共享 AI 密钥。

本应用源码按 GPL-3.0-only 提供。模型与各依赖按各自许可提供。

## 2026-11-02 Windows 识别加速候选

- whisper.cpp v1.8.3 官方 BLAS 资产 `whisper-blas-bin-x64.zip`，SHA-256 `2c9e6b95d9b679120553631d07b97d4bb1a56668a592052838dc9e7e24769c04`，包含 OpenBLAS 0.3.29（BSD，许可见 OpenBLAS-BSD.txt）。
- 可选 NVIDIA CUDA 后端来自同版官方 `whisper-cublas-12.4.0-bin-x64.zip`，SHA-256 `c12a563333d3c3707be70754dc0e87c1cb58aa6333a87055bbcf9b524488dfb0`；CUDA运行库按其自身条款提供，不属于本项目GPL授权内容。许可见 NVIDIA-CUDA-12.4-EULA.txt；未分发驱动或开发工具。
- 本轮 JNI 库由 w64devkit 2.11.0 / GCC 16.2.0 编译，使用同版 whisper.cpp 头文件和 Opus 1.5.2源码；w64devkit归档 SHA-256 `54c2bb9962e8a30c8270e34c5efc3d5fee579f53087fa7d435b95fbba2af7b2b`。开发工具不随应用分发。
- 法语模型、Q5量化与解码精度不变，不把权重放入应用ZIP。GPU不可用时使用CPU。
