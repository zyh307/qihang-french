# 第三方来源

本目录的应用代码为自主实现，随启航法语采用GPL-3.0-only。以下链接用于协议、模型及练习范围参考；不代表第三方服务或素材包含在本仓库授权中。

| 来源 | 用途 | 本仓库处理 |
| --- | --- | --- |
| [小智WebSocket协议](https://github.com/78/xiaozhi-esp32/blob/main/docs/websocket.md) | 软件客户端连接、音频帧与控制消息 | 自主实现协议客户端；未复制整个上游项目 |
| [小智MCP协议](https://github.com/78/xiaozhi-esp32/blob/main/docs/mcp-protocol.md) | 考官读取真实题卡与对话、提交结构化复盘 | 自主实现设备工具 |
| [py-xiaozhi](https://github.com/huangjunsen0406/py-xiaozhi/tree/d9a2cf8a941a06a3c40291321fccc094f21c5d1f) | 激活及客户端流程参考 | 未整体搬运其代码或资源 |
| [Whisper Large V3 French](https://huggingface.co/bofenghuang/whisper-large-v3-french) | 本机法语ASR | 模型页标注MIT；仅提供固定版本下载工具，不分发权重 |
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | CTranslate2推理 | 通过依赖安装，不内置二进制 |
| [Vosk](https://alphacephei.com/vosk/models) | 可选旧录音复核 | 依赖与模型另行安装，不内置 |
| [FEI A1公开样题](https://www.france-education-international.fr/document/delf-dalf-a1-tp-examinateur-sujet-demo0) | 话题、词卡及获取商品和服务的任务范围 | 本项目编写练习题卡；不附原PDF或标称未公开真题 |
| [FEI A1口试评分表](https://www.france-education-international.fr/document/grille-po-a1) | 任务完成、词汇与语法等评价维度 | 文字练习建议，不映射官方分数 |
| [爱丽丝的法语日记 B站视频第2集](https://www.bilibili.com/video/BV1V3411S7HT/?p=2) | 解释三个环节的对话案例 | 仅链接原页面；MP4、截图和原始下载地址均不上传 |

aiohttp、PyAV、NumPy、CTranslate2及其他依赖保留各自的许可证；GPU依赖由安装者按适用条款自行安装。代码许可证不覆盖第三方托管服务、教材、录音和视频的再分发权。
