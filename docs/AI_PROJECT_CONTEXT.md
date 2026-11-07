# 启航法语：AI 项目分析与接手说明

最后更新版本：2.5.1（用户已授权提交 GitHub 和发布，正在同步）。先读前两节，再按任务读取对应源码；目录与远端状态必须重新确认。

## 当前任务与准确状态

2026-11-07 追加：模糊匹配统一支持 oe/œ（以及 ae/æ）；规范写法差异以黄色连字提示显示，关闭模糊识别仍严格判定。Windows/桌面填空与变位填空新增常用重音按钮，按当前光标插入、保留选区替换，手机原键盘不改。用户明确不测试，本次只修改源码并重新构建本地 2.5.1 交付，不进行测试；后续用户已授权更新 GitHub。追加改动已构建并同步至本地正式版 APK、Windows ZIP 和分享版 EXE 资源；仅更新交付文件及校验表，没有追加测试。

本轮同时开发三项：全模式浏览器记录与手机/电脑互通备份；Windows 独立 EXE 与固定记录目录；面向 AI 的本分析文档。用户说明口语和语法尚无需要迁移的既有记录，不删除功能，不删除原词汇/变位进度。

最新用户要求：词汇备份不带任何词汇音频（含导入词），只带词条、课次、词本和学习进度，音频用安装包；口语历史带口语录音。电脑可把 ZIP 拖入窗口校验并确认恢复；手机点选同一 ZIP。电脑界面要单独适配，不能只是放大手机版。

当前版本为 2.5.1，两端安装包和本地正式版已生成。用户于 2026-11-07 明确要求在 GitHub 更新，已授权提交、推送并发布本版本；正在同步。仍不追加测试。

已实现并有隔离检查：

1. `src/platform/browser-database.js` 原地把 `francais-ensemble-v1` v1 升级为 v2，保留 state/audio，新增 oralSessions/oralAudio。词汇、变位、语法、口语记录在浏览器/应用专属配置中；模型和绑定仍原生安全保存。
2. `src/oral/browser-client.js` + `browser-store.js` 是口语记录适配；OralCore.java 新增内存会话缓存、分块 WAV 缓存与中断恢复。新前端不调用原生历史 session.save/get/list。旧原生历史文件不删除。
3. `src/platform/records-backup.js` 是全模式 ZIP 备份和恢复，完整文件 SHA-256 校验，兼容旧词汇备份。manifest 的 wordAudio=installed 表示不含词汇音频，恢复保留目标的内置录音缓存。恢复后的旧页面写入有版本保护，语法 localStorage 有修订标记。
4. `native/tests/browser-records.test.mjs` 已通过独立浏览器上下文的电脑→模拟手机→电脑双向恢复、v1 升级、语法/未完成练习/录音、损坏拒绝、旧备份兼容与重开保存。模拟手机不是真机；Java BrowserRecordsTest 已通过。
5. Windows 独立窗口源为 `native/windows-desktop/DesktopApp.cs`，`scripts/build-windows-desktop.mjs` 已生成 EXE；固定数据根 `%LOCALAPPDATA%\QihangFrench`，WebView2 专属配置在 BrowserRecords 子目录，与版本及程序解压位置无关。优先系统 WebView2，缺失时自动准备随附的固定 runtime。
6. `src/desktop.css` 只对 Windows WebView2 + >=900px 生效：左侧导航、首页分栏、更多课次列、设置侧边栏。安卓布局不变。真实 EXE 在隔离记录目录下的布局、拖入 ZIP、清 Cookie 后刷新、关闭重开、固定 runtime 自动准备均已验证。

用户最新要求停止测试，已停止追加规则、浏览器交互或真机测试。最后一轮仅同步简明使用说明；两端打包已结束，最终产物已复制到正式版目录并生成校验表，未再次运行整包审计。最终包之前的功能检查及边界见下文。`启航法语-正式版-v2.5.1` 为本地交付，`分享版/启航法语.exe` 可直接启动；两端包包含同一份最新 H5。Windows Java host 为 2.5.1 / protocol 20261106-browser-records。APK versionCode=20533，包名与签名不变。

本轮验证边界：真实 EXE 测试使用合成记录和独立配置目录，不读取用户正式浏览器数据；未做用户真实 2.4 数据迁移、安卓真机或真实小智/麦克风联调。不要把打包和模拟移动端检查当成这些验证。

用户最新明确是同电脑从 2.4 升级到 EXE：原浏览器 Settings→词汇→资料导出旧 ZIP，关闭旧页面（原服务可能 3–4 分钟才退出），新版 EXE 拖入 ZIP 确认。保留旧文件和 ZIP 至核对成功。此后 EXE 同电脑更新自动读取固定目录，不需反复迁移。不能声称 EXE 自动读到旧 Chrome/Edge 的 IndexedDB。

接手后：先看 git status、Release 状态和用户新要求，不重做已完成的构建。本轮发布授权仅适用于 2.5.1，后续发布仍需用户要求。

## 项目位置、版本与边界

- 当前项目：`D:\agent开发\社团法语软件\启航法语2.0\app`。
- 已公开版本：2.5.0；本轮开始时源代码 HEAD `4ce097f`，main 与 v2.5.0 指向该提交。当前未提交改动为上述存储迁移及本文档。
- 仓库：<https://github.com/zyh307/qihang-french>。
- 已发布文件：`启航法语-正式版-v2.5.0`，含 Windows ZIP、安卓 APK、独立识别模型、模型许可、简短说明和校验表。
- PR #8 已真实合并，包含 PR #7 的三个安卓 CPU 提交；GitHub 已确认 #7、#8 均为 merged。#4、#6 的部分内容历史上已纳入，不能盲目重复合并。
- 软件名称：启航法语。普通更新默认递增最后一位，但以用户指定版本为准。不得改 Android applicationId 或签名来做普通更新。

## 产品结构与核心入口

技术：Vue 3 + uni-app H5。2.5.0 的 Windows 使用随包 Java 打开默认浏览器；本地 2.5.1 改为 C# WinForms + WebView2 独立窗口，复用随包 Java 管理本机识别/小智。安卓使用原生 WebView / JNI。桌面接收者无需 Python 或 Node.js。

| 功能 | 关键文件 | 注意事项 |
|---|---|---|
| 主界面与导航 | `src/pages/index/index.vue` | 三种模式、备份恢复、学习入口及提交持久化 |
| 词汇规则与复习 | `src/domain/learning.js`、`review-plan.js` | 普通学习、复习、专练、错题、收藏分别保存会话 |
| 单词数据 | `src/static/content/inspire1.zip` 至 `inspire4.zip`、`src/static/lexicon/french.json` | 原词表与编号保留；教材优先；不能任意重建 ID |
| 词义与纠正 | `src/domain/meanings.js`、`src/lexicon/reviewed-*.json` | `primaryMeaningChosen` 优先保留；默认释义对应例句语义 |
| 卡片 | `src/components/RecitationPanel.vue`、`src/ui/fit-card-text.js`、`src/study-flow.css` | 一排三个；翻面 3 秒；长词不能挤掉中文、词性、按钮 |
| 变位 | `src/conjugation/`、`ConjugationDetails.vue`、`ConjugationPractice.vue` | 原形与每个时态独立；派生卡放 conjugationDecks |
| 语法 | `src/components/GrammarMode.vue`、`src/grammar/` | 按单元保存综合练习与返回位置 |
| 口语前端 | `src/oral/local-client.js`、`delf-exam.js`、`delf-cards.json`、`oral-assistant/web/` | 本机管理考试题卡、阶段、计时、对话；A1–B2 |
| 口语原生 | `native/common/cn/qihang/oral/OralCore.java`、`Examiner.java`、`NativeSpeech.java` | 本机录音和 Whisper、用户自己的小智、MCP 任务工具 |
| 平台宿主 | `native/windows/WindowsApp.java`、`android/src/` | 设备绑定凭证和模型持久保存，不能进入前端或备份 |
| 备份 | `src/platform/files.js`、`repository.js`、`records-backup.js` | 全模式跨平台 ZIP，保留旧词汇 ZIP 兼容；不含词汇音频 |

## 存储现状与本轮目标

### 2.5.0 已发布版

- 词汇与变位：浏览器 IndexedDB，数据库 `francais-ensemble-v1` v1，`state/primary` 和 `audio`。同一浏览器用户资料、同一地址来源才能直接复用。
- 语法：localStorage 的 `qihang-grammar-progress-v1`、`qihang-grammar-round-v1`、`qihang-grammar-settings-v1`。
- 口语历史与 WAV：原生目录 `sessions/`、`recordings/`；Windows 默认 `%LOCALAPPDATA%\QihangFrench`，可由软件根目录 `.qihang-data.json` 的 `directory` 指定。绑定和模型也在原生目录，但不能与记录一起复制给其他人。
- Windows 默认地址 `http://127.0.0.1:5188/`。不要误用历史 beta 的 5194。原服务无页面心跳约 3–4 分钟后退出。
- 原词汇 ZIP 备份含 `snapshot.json` 与 `audio/<sha>.bin`，不含完整语法和口语。原口语导出主要用于查看，不等于完整恢复。

### 迁移约束

- 权威记录改为浏览器数据库，Android 与 Windows 使用同一数据结构和备份协议。
- 原生模型、设备身份和小智凭据仍安全地保存在各自设备；换电脑或手机分别绑定，模型单独导入。
- 本机组件可以为当前录音/识别保留临时缓存与崩溃恢复文件；浏览器确认持久化后清理缓存，不能再把原生历史目录当作权威记录。
- 备份恢复应先完整校验，失败不改原记录；恢复不可与仍在运行的旧口语会话互相覆盖。兼容已有词汇备份。
- 必须保留混合导入会话 `importedPractice` / dictionaryPractice 的受限例外，不能因备份校验收紧而破坏导入本续练。
- 备份只白名单收录学习记录、设置和录音；不收录模型、绑定、令牌、路径或原生运行库。

## 已确定的词汇规则

- 每轮 5 词，先完成选择再填空；未完成续练保留冻结的题目、选项、位置。一课或一组完成后可继续。
- 法语选中文：优先形近法语词的中文主释义；初学优先同课，复习、专练、错题、收藏用全库常用词。允许不同词性，但排除同词派生的名词/形容词干扰。
- 店铺类可互作中文干扰，如面包店、糕点店、肉店、熟食店。通用“商店”不能挤占具体店铺的正确判断。
- 复习日历固定在学习第 2、4、7、15、30、60、90 天，之后每 30 天一次；答错次日加练独立计算。
- 教材与导入本共享原词条进度，已会与复习本正常适用。导入本每课 30 词。
- 用户手选主释义保留。课内 boîte 在“一罐金枪鱼”例句中主释义为“罐头”，保留盒子等其他释义；泛词典的盒子义不要全局误改。
- 高跟鞋卡片的已修复问题：长法语导致 flex 挤压中文到约 6px。中文 flex-shrink 禁用、保留完整自然高度，法语适配剩余空间，极长内容撑高卡片。

## 构建、校验与交付

使用现有 Node `D:/node.exe`、npm `D:/npm.cmd`、Java `D:/bin/`，现有安卓打包工具位于 `D:/agent开发/法语变位器3.0/.android-tools`。构建依赖在项目 node_modules 和 `.native-tools`，不随用户成品交付。

1. `D:/npm.cmd run build`：内容、录音、口语静态资源、教程与 H5。
2. 原生源码改动后需要重建：`python scripts/build-native.py android`；Windows 使用对应 runtime 的 whisper DLL，并运行 `scripts/build-windows-host.mjs`。
3. 重建 `scripts/build-windows-desktop.mjs`，需按 `native/windows-desktop/webview-runtime.json` 固定版本和 SHA-256 准备 `.native-tools/webview2/sdk.nupkg`、解压到 sdk/ 以及 runtime.cab。依赖不提交，源码含精确来源；EXE 当前未做发行者签名。H5 冻结后可并行运行 `scripts/build-android.mjs --skip-web` 和 `scripts/build-share.mjs`。
4. `python scripts/package-release.py --model <已校验的独立模型文件>` 组装本地正式版并审计。此脚本不会自行发布 GitHub。
5. APK 需核对包名 `cn.qihang.francais`、递增 versionCode、签名和对齐。证书 SHA256：`e9c83a9641b3a984a3639b22012d5efac320155b3d30eeb5fbc98c5182e31c8c`。

Windows 识别模型：`bofenghuang/whisper-large-v3-french` Q5，详见 `native/model-manifest.json`，大小 1,081,140,203 字节，SHA256 `d8da7cb6cdadfac47829abf46fe8cd36fcfef06db5601bfd8acbcd40579010a5`。同一模型用于安卓。模型不在 APK/Windows ZIP 内。

2.5.0 历史已验证：Java 与 JS 隔离口语规则、安卓 CPU 选择/短句边界、原生库编译/16KB 对齐、两端打包、APK 原签名、全部文件与音频审计。2,514 个课内词卡在 320/390px 及代表性长词 6 种屏宽下无裁切重叠。

2.5.0 及本地 2.5.1 均未验证：真实手机录音和性能、真实小智 A2–B2 完整考试。历史他人测试或模拟结果不能代替本次真机验证。

## 工具、隐私与常见问题

- `.lexicon-work` 是私有处理与检查目录，`.native-tools` 是本地构建依赖；二者不上传。原始词表在 app 的上级 `词库` 中。
- 生成的 `src/static/oral` 通过 `scripts/build-oral.mjs` 重建，修改源文件，不只改生成文件。
- 浏览器语音资源在 `src/static/lexicon/audio/index.json`；录音由哈希校验，新增音频可重建所需源在 `audio-updates`。
- 当前 `D:/bin/javac` 为 JDK 26，缺少旧 release 的 ct.sym；原生测试使用 `-source/-target 17`。安卓正式编译需显式 Android bootclasspath。
- Windows Store Python 启动的 gh 子进程在本机读不到登录；直接 PowerShell `gh` 或 `D:/node.exe` 启动 GitHub CLI 可用。不要打印令牌排查。
- 网络发布应先查草稿/资产状态，避免重复创建；上传后逐项核对 size、digest、state 和 main/tag。草稿不等于已公开发布。
- 当前任务若被压缩，先读本文“当前任务”并检查源码，不重做已发布 2.5.0 和已交付本地 2.5.1；后续工作仍需按真实结果更新状态。
