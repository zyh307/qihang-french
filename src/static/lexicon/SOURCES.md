# 法语词库来源 / Sources

词库数据独立于应用代码，以 CC BY-SA 4.0 分发。Wiktionary 原始贡献者及引用出处通过原词条页面和例句 ref 保留；Tatoeba 例句另按 CC BY 2.0 分发。应用代码仍遵循 GPL-3.0-only。

- Wiktextract：https://github.com/tatuylonen/wiktextract ，固定提交 19f9a3006a405fb7bfb40193dca41c7117a009a5。
- Kaikki 数据：https://kaikki.org/zhwiktionary/ 、https://kaikki.org/dictionary/French/ 、https://kaikki.org/frwiktionary/ 。固定导出、输入哈希与输出哈希见 manifest.json。
- 原词条及贡献历史：https://zh.wiktionary.org/wiki/词条 、https://fr.wiktionary.org/wiki/词条 、https://en.wiktionary.org/wiki/词条 。各词条名对应 entries[].word，作者见页面历史；参考文学或报刊材料的例句保留原始引用。
- Tatoeba：https://tatoeba.org/ ，2026-10-31 法语句库与法语—汉语链接导出；例句的作者、句子 ID 和链接随条目保留。许可 https://creativecommons.org/licenses/by/2.0/ 。
- IPA-dict：https://github.com/open-dict-data/ipa-dict ，固定提交 972cd67dd5f96bc5660e28070cde26e3928abcd7，MIT；原词典及 Wiktionary 的来源要求仍适用。
- wordfreq：https://github.com/rspeer/wordfreq ，3.1.1；数据 CC BY-SA 4.0，代码 Apache-2.0。只使用词频筛选，未分发 Python 运行库。此筛选不是官方 CEFR 分级。
- 启航法语补充例句及音标：与词库一起以 CC BY-SA 4.0 提供，例句标记 authored=true，补充音标记载 ipaSource。

- OpenLexicon / Lexique 3.83：https://github.com/chrplr/openlexicon ，固定提交 9009f488f664536940965453c127f43cf18b84a4；Lexique 数据来源 https://www.lexique.org/databases/Lexique383/Lexique383.zip ，CC BY-SA 4.0，用于补充词头、词性、性别与词频。
- ECDICT：https://github.com/skywind3000/ECDICT ，固定提交 39cfb9672c0906b63569e0453c2e6abfb9ab182a，MIT（见 ECDICT-MIT.txt）；为部分英文词义提供汉语对照，translationPivot 和 glossEn 保留对应关系。补充词义经自动匹配与部分人工整理，不属于官方分级词表。

课本外词汇的单词与例句合成录音随安装包内置，可离线播放。使用 fr-FR-DeniseNeural 音色生成。课内录音内置，词库不捆绑第三方真人录音，不共享语音服务账号。

常用词补充的固定词表版本、来源与署名见 COMMON-SOURCES.md。
