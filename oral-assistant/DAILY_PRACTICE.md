# 日常口语与需练习本

先从仓库根目录运行 `npm ci` 和 `node scripts/build-lecture.mjs`，再按 [口语助手安装说明](README.md) 完成一次本机运行环境和法语模型安装。在 Windows 双击 `启动日常口语.cmd`，或在主软件的电脑口语面板点击「打开电脑日常口语」。入口为 `http://127.0.0.1:8127/?desktop=1&daily=1`。八个单元的原创主题练习与示范音已随源码提供，完成模型安装后可离线练习。`daily-practice.json` 仍可显式关闭 A、B。

Windows 独立试玩可在 `oral-assistant` 双击 `启动日常口语第2步.cmd`。它预热已安装的本机 Whisper，再打开 `http://127.0.0.1:18983/?desktop=1&daily=1`，识别占用 18984。持久试玩数据默认在 `.local/daily-preview`，也可通过 `--data-dir` 指定当前需要的试玩目录，`--temporary-data` 使用独立临时目录。模型默认在本服务下，外置模型和依赖可以通过 `--runtime-dir` 指定其原服务目录。

源码分支中的课包生成器读取本机取得授权的教材文本和原声。教材、试听答题记录和安装后的课包各自在本地准备。

「接拍串说」一课 6 条链，每条可先逐块热身或直接连说。「看提示换一格」一课 3 个句框，每组连续口答 4 张，组末可补练，再点「下一个句框」。每张麦克风开始采集后响滴声，等滴声再读高亮的整句，响完后最多录 6 秒。逐卡存档，组内录完再判定，刷新后可接着练。反馈里的「回听我的录音」播放当前页面保留的原始上传录音。开口率不足一半时，每组可选再跟说两句。结果页汇总全课的通过数和待练词形，并可下载 JSONL。

素材来自 Inspire 1 第 16 课 Piste 78。A 取 s13、s21、s24、s3、s22 和 s27，s27 截至完整的 `Je fais de la danse`。B 第一组用 s23 和 s25，后两组用 s24 的时间词组和已经听辨的活动说法编排练习句，页面注明出处。需要重建时在 `oral-assistant` 运行 `.venv/Scripts/python.exe -X utf8 scripts/prepare_fluency_demo.py` 或 `scripts/prepare_slot_demo.py`。关闭预览后可追加 `--disable-a` 或 `--disable-b` 测试入口。录音、播放和判分走本机回环。B 组末结算后清除录音草稿，A 的录音在内存中处理。

## 模块与数据流

| 文件 | 职责 |
| --- | --- |
| `recording_window.py` | 校验 16 kHz 单声道 PCM，按半开采样范围切窗，给原始采样偏移和秒数，封装 WAV。前端 `recording-window.js` 负责采集、超时结束和取消。 |
| `word_alignment.py` | 把参考文本与 ASR 原词做按序对齐，区分命中、低置信、缺失和额外词。跨界词另列，单一 ASR 原词拆分后的标记共享该词的置信度。 |
| `pause_detection.py` | 从 PCM 运行本机语音活动检测，输出语音总时长及语音、停顿区间。仅语音段之间的间隔作为内部停顿候选。 |
| `practice_records.py` | 两款和朗读共用结论枚举及记录结构。新模式的一个尝试对应一行 UTF-8 JSONL，按模式目录原子发布。同编号重发返回原记录，内容冲突报错。 |
| `daily_practice_summary.py` | 从分模式会话投影需练习本和今日练习，保留内容版本。 |
| `daily_practice_config.py`、`daily_practice.py` | 加载本地默认阈值与开关，提供可用卡片信息和只返回证据的诊断接口。 |
| `fluency_rules.py`、`fluency_session.py` | A 的独立节奏判定、会话与本地原声接口。每轮固定课包和阈值，判定记录先落盘，再推进会话；重复上传只应用一次。 |
| `FluencyDemo.vue`、`scripts/prepare_fluency_demo.py` | A 的逐块与连说页面、静态提示、本地素材构建。 |
| `slot_rules.py`、`slot_session.py` | B 的槽位判定、试听门槛、逐卡存档、组末分窗识别、补练和日志。 |
| `SlotDemo.vue`、`scripts/prepare_slot_demo.py` | B 的本地试听、连续口答、组末反馈、结果页和课包构建。 |
| `french_asr.py`、`speech_server.py`、`lecture.py` | 本机 ASR 按需返回词和语音区间。新引导朗读尝试在原子会话保存时同步附上规范记录，沿用原来的朗读结果和进度。 |

录音窗口将 PCM 发送给本机接口，识别服务返回词级证据与独立的声学停顿。参考文本只参与对齐。A 只有词覆盖充分时才检查语速、停顿、重启，反馈取超出阈值比例最大的节奏问题。记录外层为 `{mode,item,verdict,evidence,ts}`，结论用 `pass`、`retry`、`release`、`undetermined`。A 内层保存窗口、发声时长、按序命中率、规则名、实用阈值和节奏指标。逐块热身计实际发声，完整链的每次判定写一行。低覆盖、静默或关键时间戳不足不会判为节奏错误。

## 配置

普通应用读取其数据目录内的 `daily-practice.json`。顶层键为 `fluency`、`slot`，各自支持 `enabled`、`window_seconds`、`rules`，A 另支持 `release_seconds`。锁定一轮时应保留它使用的阈值快照。

| A 规则键 | 默认值 | B 规则键 | 默认值 |
| --- | --- | --- | --- |
| `min_coverage` | 0.80 | `min_frame_coverage` | 0.70 |
| `min_word_probability` | 0.55 | `min_frame_probability` | 0.50 |
| `min_hits_per_group` | 1 | `min_target_probability` | 0.68 |
| `words_per_minute` | [55,145] | `min_opposite_probability` | 0.75 |
| `max_internal_pause_seconds` | 0.75 秒 | `min_release_seconds` | 1.2 秒 |
| `max_boundary_pause_seconds` | 1.20 秒 | | |
| `max_restarts_per_group` | 1 次 | | |

A 的独立判定在检测到有效发声后检查词覆盖、停顿、重启和录音边界。A 的窗口为 12 秒，带提示放行需要 1.5 秒发声。B 的窗口为 6 秒。普通口答检查有效发声、固定句框和目标词形，发声时长用于统计开口率。带提示完成用 1.2 秒确认开口。到时仍有声音时，系统检查整句最后一词能否在窗口内确认。冲突、词跨界、缺词和弱证据会给出相应的未确认反馈。

## 需练习本和今日练习

从「日常练习 → 读课文 → 需练习本」打开。课文句子沿用原复练流程，接拍串说按整条链入本，看提示换一格按句框中的词形对入本。A 整条连说通过后移出待练，B 需要两种形式都各独立通过一次。各自的复练会话可以刷新续练，普通练习继续使用原会话。旧课包版本仍可查看其待练条目。

需练习本使用只读 `GET /api/daily-practice/notebook` 查询。新待练状态和会话同时落盘，旧记录按已经保存的判定读取。「今日练习」由 `GET /api/daily-practice/today` 读取，客户端传入本地日界。A、B 的新版开口时间按检测到的发声区间汇总，以本机收到录音的时间为锚点。旧记录在整轮明确落在当天时使用已有开口总时长。读课文和考试展示能够核对的完成轮数，开口时长显示「未记录」。

## 内容包校验

`python scripts/validate_daily_practice.py <课包文件> --stage demo` 检查 Demo 数据。正式包用 `--stage formal`。两种课包顶层包含 `lesson_id`、正整数 `version` 和对应的条目数组。

- `chains.json` 的 `chains` 条目用 `id`、`groups`、`pause_after_words`、`short_groups`、`demo_wav`、`short_demo_wav`。边界用累计词数表示，按对齐器同一分词检查每链 9–14 词。验证短版对应前两块及两个本地 WAV 的完整性。
- `frames.json` 的 `frames` 条目用 `id`、含一个 `{slot}` 的 `template`、`candidates`（各有 `id/form/pronunciation/condition`）、`prompts`（各有 `id/target/cue`）、`examples`（各有 `prompt/spoken_candidate/accepted`）及 `validation`（`listened/blind_test/asr_hits`）。验证两个形式各出现两次，每个都有正反例，发音标注可区分。Demo 要求人工试听；正式内容还要求真人盲测通过和 ASR 试跑记录。
- 两种包都校验必填字段、各自范围内的 ID 唯一性和占位符。B 候选若有 `demo_wav`，校验本地切片。B 扩展的三组沿用同一真人通过的词形对。生成器从 `content/daily-practice/inspire1-u5-l16/盲测20261122.json` 校验真人答题记录。多句框课包须通过正式校验才可加载。

## 开发自测

在项目目录运行 `node scripts/build-oral.mjs`，在 `oral-assistant` 运行 `.venv/Scripts/python.exe -X utf8 -m unittest discover -s tests`。A 的规则和会话测试见 `tests/test_fluency_demo.py`，B 的试听、槽位阈值、恢复和批次日志测试见 `tests/test_slot_demo.py`。
