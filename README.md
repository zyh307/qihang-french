# 启航法语 · Cap sur le français

中法双语词汇学习应用，使用 Vue 3、uni-app 和 Android WebView。支持 Android APK 与浏览器运行，学习记录保存在本机。

## 功能

- 按教材和 Lesson 学习，翻卡背诵、选义与拼写练习，每轮 5 词。
- 跨课乱序复习，独立错题专练、收藏、学习日历和完整备份。
- 单词及例句录音、例句高亮、模糊识别和冠词练习。
- 分享海报、复习通知与中法双语界面。

## 直接使用

在 [Releases](https://github.com/zyh307/qihang-french/releases/latest) 下载：

- 安卓：下载 APK 并安装。
- Windows：下载电脑版 ZIP，完整解压后双击“启动启航法语.bat”，无需安装 Python 或 Node.js。

两个版本均包含当前词库和录音。学习记录保存在自己的设备上，分发包不包含维护者的个人学习记录。

## 源码启动

安装 Node.js 20 或更高版本，然后执行：

```sh
npm ci
npm run dev
```

浏览器打开 http://127.0.0.1:5190/ 。网页构建使用 `npm run build`；Windows 分享包使用 `npm run build:share`。

仓库包含程序运行所需的预处理词库与音频。也可在设置的资料页导入 XLSX / JSON 与录音 ZIP。个人学习记录、签名私钥、缓存和音频处理过程文件不会上传。导入格式和音频编号规则见 [使用教程](docs/使用教程.md)。

如需整合本地教材资料，构建脚本读取项目上一级的 `词库/Inspire1`。缺少原始资料时会生成空内容包，程序仍可启动。已有本地内容包不会被空包覆盖。

## Android 构建

执行 `npm run build:apk`。现有构建脚本面向 Windows，需提供 JDK 和 Android SDK 工具；设置 `JAVA_HOME` 和 `QIHANG_ANDROID_TOOLS`。后者包含 `build-tools/android-15`、`platform/android-35/android.jar` 等脚本要求的工具布局，参见 [构建脚本](scripts/build-android.mjs)。

首次构建会生成项目自己的签名文件，保存在 `android/signing`；请备份并保密。不同开发者生成的密钥不同，不能相互覆盖安装。正式发行由维护者统一签名。

## 协作

欢迎提交 Issue 和 Pull Request。仓库所有者也可在 Settings → Collaborators 中邀请熟人共同开发。开发流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

当前版本：1.0.22。手机版使用 QWERTY 键位，长按后滑动选择重音字母，松手输入；电脑版使用实体键盘。

## 协议与素材

本项目原创程序代码采用 **GPL-3.0-only**，完整条款见 [LICENSE](LICENSE)。第三方依赖保留其各自协议；公版名言、作者及出处见 [SOURCES.md](SOURCES.md)。教材、录音和用户导入资料不因程序开源而获得再分发授权。

Copyright (C) 2026 启航 AI 俱乐部。
