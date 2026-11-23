# 口语小镇素材清单

地图和角色使用代码绘制的像素图形。可选的本机素材槽位见下表。

| 画面 | 当前来源 | 可选本机文件 | 可选文件用途 |
| --- | --- | --- | --- |
| 家 | `src/game/graphics.js` 的色块瓦片、床、房屋、田块 | `home.png`（320×192） | 仅本机预览 |
| 商店 | 同一渲染器的色块瓦片、货架、柜台 | `shop.png`（320×192） | 仅本机预览 |
| 野外 | 同一渲染器的色块瓦片、道路、草丛、水池 | `field.png`（384×224） | 仅本机预览 |
| 发型 | 分层色块、两种轮廓 | `hair-1.png`、`hair-2.png` | 仅本机预览 |
| 上衣 | 分层色块、两种配色 | `shirt-1.png`、`shirt-2.png` | 仅本机预览 |
| 裤子 | 分层色块、两种配色 | `pants-1.png`、`pants-2.png` | 仅本机预览 |
| 肤色 | 分层色块、两种配色 | `skin-1.png`、`skin-2.png` | 仅本机预览 |
| 鞋子 | 分层色块、两种配色 | `shoes-1.png`、`shoes-2.png` | 仅本机预览 |
| 黑洞、影子和粒子 | Canvas 基础图形，每帧绘制 | — | — |
| 开场四格漫画 | 内置 imagegen 生成的原创四格画稿 `src/game/art/opening-comic.png`，1536×1024 | — | 应用内开场画面 |
| 可选开场配乐 | 用户提供的 Steam《UNDERTALE Soundtrack》第 01 首 `Once Upon a Time`，作者 Toby Fox | 本机使用 `opening.mp3`，也支持 `opening.ogg` 或 `opening.wav` | 仅本机预览 |
| 默认电台 | 用户提供的 Steam《Stardew Valley Soundtrack》，ConcernedApe，全 100 首 MP3 | `assets-private/radio/` 内保留 Steam 的编号和文件名。私有 `tracks.json` 逐首记录文件名、作者和时长 | 仅本机收听，禁止分发 |

可选文件放在项目根目录的 `assets-private/`，并在本机记录文件来源。工作约定要求这些文件只在本机使用，禁止进入 Git、APK、ZIP、截图或 Release。使用者可自行安装有权在本机使用的音频。

角色表为透明 PNG，64×96，四列对应 4 个 16×24 行走帧，四行依次朝下、左、右、上。地图素材与同名格子边界对齐。私有预览仅识别清单中的 PNG。缺失、尺寸不符或解码失败时用已有色块图形与文字。

默认 `assetSource` 为 `private`，只有本机试玩服务附 `--game-private-assets` 时才供图。地图上的「画面设置」可以把内置图形设为默认。试玩 URL 带 `assetSource=cc0` 时本次运行固定使用基础图形。截屏使用这一模式。

把可供本机播放的配乐放在根目录 `assets-private/`，按 `opening.mp3`、`opening.ogg`、`opening.wav` 的优先顺序选取。已有开场播放记录的角色可点「重看四格开场」试听。没有本地文件时，漫画会按静音播放。`assetSource=cc0` 试玩链接屏蔽本机配乐。

## 本机电台

默认电台从 `assets-private/radio/` 读取数字开头的 MP3、M4A、OGG 或 WAV，随后按数字播放。可选的私有 `tracks.json` 为数组，每项用 `file` 对应完整文件名，并可提供 `title`、`artist`、`durationSec`、`loopStartSec` 和 `loopEndSec`。一首曲目使用循环点时，以秒为单位。启动试玩需启用 `--game-private-assets`，电台音频仅由本机回环接口提供。关掉这个开关或移走文件时，电台面板显示「默认电台暂不可用」。画面的 `cc0` 设置只切换地图素材，电台仍要用户点击才播放。

## 四格画稿的生成提示词

```text
Use case: illustration-story. Single in-game sprite sheet for four matching wide comic panels, arranged as an EXACT two-column by two-row grid on a landscape 3:2 canvas. Each equal quadrant fills its full rectangle to the edge. Place the vertical cut EXACTLY at 50% width and horizontal cut EXACTLY at 50% height. No panel lines, frames, margins or gutters, no typography; the app will split the rectangular quadrants and add Chinese captions underneath. Four distinct self-contained rectangular illustrations, no crossover, left-to-right top-to-bottom: 1 upper-left, in a deep indigo night on a quiet cobblestone path, a close view of a young adult traveler crouching and lifting a glowing little amber letter tile from between stones; 2 upper-right, bird's-eye dynamic view of the same traveler with arms out falling through a gap in the path, floating square particles, moonlit clouds, with softly lit meadow below; 3 lower-left, the traveler approaches a quaint old timber cottage in a French countryside village at pre-dawn, warm amber window and a folded note pinned to wooden door, path going north between hedges; 4 lower-right, at sunrise, the traveler stands on the edge of a small garden with four freshly tilled plots beside the cottage, a bright route through the grass and golden window light. The same character with black short hair, forest green jacket, tan trousers, brown shoes, small dark burgundy satchel across all four quadrants. Original hand-drawn pixel-inspired indie storybook, strong inked silhouettes, tactile painted blocks, subtle paper grain, moody indigo/olive/amber palette, each scene instantly readable at small scale. Keep important details 8% in from the edges of each quadrant. No logos, no watermarks, no captions, no existing game characters or recognizable game scenes. This is an original new setting.
```
