# 启航法语

中法双语词汇、语法和 DELF A1 口语练习。

## 下载

[打开下载页](https://github.com/zyh307/qihang-french/releases/tag/v2.4.0)

| 设备 | 下载文件 | 打开方式 |
|---|---|---|
| Windows | [启航法语 · Windows](https://github.com/zyh307/qihang-french/releases/download/v2.4.0/QihangFrench-Windows-v2.4.0.zip) | 完整解压，双击“启动启航法语.bat” |
| 安卓 | [启航法语 · Android](https://github.com/zyh307/qihang-french/releases/download/v2.4.0/QihangFrench-Android-v2.4.0.apk) | 下载后安装 |
| 口语练习，两端通用 | [ggml-model-q5_0.bin](https://github.com/zyh307/qihang-french/releases/download/v2.4.0/ggml-model-q5_0.bin) | 设置 → 口语 → 导入本地模型 |

词库包含 18,949 个词条，支持逗号导入，新增 76 个常用自反动词及其词组用法。课内录音、课外单词和例句录音均已内置，安装后可离线播放，无需另下语音包。

Windows 和安卓程序包均不含法语识别模型。口语首次使用请单独下载约 1.08 GB 的模型，在应用中导入。只用词汇或语法无需导入模型。口语转写在当前设备运行，考官回复需要联网。

## 口语开始使用

1. 从下载页单独下载 ggml-model-q5_0.bin，在设置 → 口语 → 导入本地模型，等待校验完成。两端共用同一个模型文件。
2. 允许麦克风，点击“绑定小智”。
3. 在自己的小智账号创建法语考官，粘贴应用提供的考官配置，选择模型和法语音色，使用绑定码添加设备。
4. 返回应用选择练习。说完自动转写并发送，无需确认或修改文字。

电脑和手机分别绑定。模型、绑定和记录保存在各自设备，更新时不要先卸载。AI 点评依据文字，不评发音，也不提供官方成绩。

## 词汇与语法

Inspire 1–4 均可逐课学习，教材录音及来源信息随课提供。词汇支持逐课背诵、选择、拼写、收藏、错题及定期复习。语法按单元进入课次，先看本课概览，再逐个学习语法点，各单元综合练习分别保存进度。教材分别记住上次选择的 Lesson；导入本每课 30 词，与 Inspire 共用卡片背诵和五词练习。候选词显示已有位置，导入结果列出成功单词及 Lesson；学完自动进入复习本，也可标记已会。

[资料导入教程](docs/使用教程.md)

## 源码

Node.js 20+：`npm ci`、`npm run dev`。口语运行时构建见 [构建说明](native/BUILD.md)。用户直接下载成品，无需安装开发工具。

程序采用 GPL-3.0-only，第三方模型及依赖保留其许可。Copyright (C) 2026 启航 AI 俱乐部。
