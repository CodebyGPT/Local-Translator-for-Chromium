<h1 align="center"><img src="src/res/logo.svg" width="96" height="96" alt="Local Translator"></h1>

<h1 align="center">Local Translator for Chromium</h1>

<p align="center">
  <a href="#zh">中文</a> · <a href="#en">English</a>
</p>

---

<a id="zh"></a>

## 中文

ℹ️由于翻译质量一般，本翻译扩展仅建议性能不高或注重节能的电脑使用，高性能电脑推荐使用[简约翻译](https://github.com/fishjar/kiss-translator)并接入本地大模型（如 [Index-Translate-2B](https://github.com/bilibili/Index-Translate)）实现高质量离线翻译。

### 这是什么

一个**完全离线**的 Chromium 浏览器翻译扩展。网页翻译、划词翻译、文本翻译全部在你自己
的电脑上完成，使用 Firefox 内置翻译所用的同一个引擎（[Bergamot](https://browser.mt)，
编译为 WebAssembly）。

它不是任何商业翻译接口的壳。没有云端翻译、没有遥测、没有崩溃上报、没有自动更新。
唯一会联网的地方是构建阶段的模型下载脚本，运行在你自己机器上。

### 技术亮点

- **引擎与 Firefox 同源。** 使用 Mozilla 通过 Remote Settings 发布的 Bergamot WASM
  （`v0.4.5`，与 Firefox 122 内置的完全一致），模型文件格式、精度配置（`int8shiftAlphaAll`）
  与词表布局都与 Firefox 保持一致。
- **支持中文。** 中文按字形分开发布（`zh-Hans` / `zh-Hant`），扩展内部统一映射为 `zh`，
  与 `browser.i18n.detectLanguage` 和界面语言码保持一致。
- **模型不随包分发。** 每个语言方向动辄几十 MB，对多数人无用。扩展默认**不包含任何
  翻译模型**，由你在设置界面导入，或从 Release 下载模型包。
- **模型字节不跨上下文传递。** 这是本项目的核心设计约束：MV3 的后台 Service Worker
  无法创建 `Worker`，翻译跑在 offscreen document 里，而模型数据既过不了
  `runtime.sendMessage`（Chromium 上限 64 MiB），也过不了长连 `MessagePort`
  （大 `ArrayBuffer` 的内容会被静默丢弃）。因此后台只传递**文件 URL**，由真正需要字节的
  worker 自己读取 —— 无论模型在扩展包里还是在你导入的存储里。
- **导入的模型就地读取。** 导入的模型存进扩展自己的 IndexedDB，worker 在同一来源下直接
  读取，全程不经过消息通道。

### 使用方法

1. 在 `chrome://extensions` 打开「开发者模式」，选择「加载已解压的扩展程序」，指向
   构建产物的 `build/chromium` 目录（或从 Release 下载 `local-translator-*.zip` 解压后加载）。
2. **导入翻译模型**（必做，否则没有可翻译的语言）：
   - 打开扩展设置页 → **翻译模型** → 「导入模型文件…」
   - 选择**同一个语言方向**的全部文件：`model.*`、`lex.*`，以及 `vocab.*`，或者
     `srcvocab.*` 和 `trgvocab.*` 两个都要。扩展会从文件名自动识别语言对。
3. 使用：点击工具栏图标可翻译文本；在任意网页上选中文字可翻译选区；右键菜单可翻译整页。

#### 如何获取模型文件

三种方式，任选其一：

**A. 从本项目的 Release 下载语言包（推荐）**

语言包发布在**单独的 release** —— [`models-v1`](https://github.com/CodebyGPT/Local-Translator-for-Chromium/releases/tag/models-v1)。
它们和扩展分开，因为模型来自 Mozilla、变动很少，而扩展会随代码更新。

每个语言一个独立压缩包，全部模型文件**平铺在压缩包根目录**，方便一次性全选。每个包都含
**双向**（英译该语言、该语言译英）：

| 语言包 | 内容 |
|---|---|
| `local-translator-models-zh-Hans.zip` | 英语 ↔ 简体中文 |
| `local-translator-models-zh-Hant.zip` | 英语 ↔ 繁体中文 |
| `local-translator-models-ja.zip` | 英语 ↔ 日语 |
| `local-translator-models-ko.zip` | 英语 ↔ 韩语 |
| `local-translator-models-ru.zip` | 英语 ↔ 俄语 |
| `local-translator-models-es.zip` | 英语 ↔ 西班牙语 |
| `local-translator-models-fr.zip` | 英语 ↔ 法语 |
| `local-translator-models-de.zip` | 英语 ↔ 德语 |

解压后，在设置页选中该语言包里的**全部文件**（都是同一批语言方向）即可。每个包内的
`manifest.json` 记录了每个文件的来源、大小与 SHA-256，便于校验。

**B. 用仓库里的脚本自行下载**

```bash
# 只下载模型文件
npm run fetch:models -- --pairs en-de,de-en
```

然后在设置页导入 `models/files/` 下的文件。若要让模型**随扩展一起打包**（自用或内部
分发），重新构建即可：`npm run build:chromium`。

**C. 直接从 Mozilla 获取**

模型由 Mozilla 以 MPL-2.0 发布，来源是 Remote Settings 的 `translations-models-v2`
集合；训练代码与数据见 [mozilla/translations](https://github.com/mozilla/translations)，
模型文件托管在 `firefox-settings-attachments.cdn.mozilla.net`。下载后的文件名形如
`model.enzh.intgemm.alphas.bin.zst`，用 [zstd](https://github.com/facebook/zstd) 解压
（去掉 `.zst` 后缀）即可导入。

> 文件名里的 `enzh` 这类代码表示语言方向：前两位是源语言，其余是目标语言
> （`enzh` = 英语到中文）。扩展会据此自动分组。

### 构建

需要 Node.js ≥ 22.15（模型脚本用到内置 `zstd` 解压）。

```bash
npm ci
npm run fetch:engine      # ① 下载 Bergamot WASM 并构建 translator.worker.js
npm run fetch:models      # ② 默认写入空注册表；加 --pairs 才会下载模型
npm run build:chromium    # ③ 打包到 build/chromium
```

**顺序不能颠倒**：打包步骤会把 `thirdparty/bergamot/build/` 里的引擎产物复制进扩展，所以
必须先跑 ①，否则会打进去一个过期的 worker（表现为导入模型后翻译报错）。

用 `make` 亦可，它已经按正确顺序编排：`make build`（等价于 `clean prepare engine models`
再打包）。指定目标：`make build TARGET=chrome`。

从源码构建 WASM 引擎需要 Docker 或 Emscripten SDK，见 `thirdparty/bergamot/makefile`。

### 测试

```bash
npm run test:models      # 模型注册表与选择逻辑
npm run test:engine      # 真实实例化 WASM 并校验所绑定的 API
npm run test:worker      # 用构建产物跑通英译中
npm run test:browser     # 在真实 Chromium 里加载扩展并翻译（需本机已装 Chromium/Chrome）
npm test                 # 应用测试套件
npm run audit:offline -- build/chromium   # 审计：产物中不得出现任何远程地址
```

打一个发布用的模型包（生成 `dist/local-translator-models.zip`，含 `manifest.json`）：

```bash
npm run model-pack -- --pairs en-zh-Hans,zh-Hans-en
```

### 法律信息

- **许可证**：BSD-3-Clause。完整文本见 [LICENSE](LICENSE)。上游 Linguist 采用同一许可，
  本项目作为衍生作品保留原有版权声明并沿用该许可。
- **翻译引擎**：Bergamot / Marian，MPL-2.0。
- **翻译模型**：由 Mozilla 发布，MPL-2.0。模型不随本仓库分发，下载与使用请遵守其许可。
- **上游项目**：本项目 fork 自 [translate-tools/linguist](https://github.com/translate-tools/linguist)。
- **隐私**：扩展不收集、不上传任何数据。翻译内容、历史记录、词典与导入的模型均只保存在
  本机。安装包内不含任何远程端点，可用 `npm run audit:offline` 复核。
- **免责声明**：本软件按原样提供，不附带任何担保。翻译结果由机器生成，可能不准确。

---

<a id="en"></a>

## English

ℹ️Because the translation quality is only average, this extension is recommended only for low-performance or power-saving computers. On a high-performance computer, use [Kiss Translator](https://github.com/fishjar/kiss-translator) with a local LLM (e.g. [Index-Translate-2B](https://github.com/bilibili/Index-Translate)) for high-quality offline translation.

### What this is

A **fully offline** translation extension for Chromium browsers. Page translation, selected-text
translation and text translation all happen on your own machine, using the same engine Firefox
uses for its built-in translations ([Bergamot](https://browser.mt), compiled to WebAssembly).

It is not a wrapper around a commercial translation API. There is no cloud translator, no
telemetry, no crash reporting and no auto-updater. The only code that touches the network is the
build-time model fetcher, which runs on your machine.

### Technical highlights

- **Same engine as Firefox.** It uses the Bergamot WASM that Mozilla publishes through Remote
  Settings (`v0.4.5`, identical to the one shipped in Firefox 122), so model format, quantisation
  (`int8shiftAlphaAll`) and vocabulary layout match Firefox.
- **Chinese is supported.** Chinese is published per script (`zh-Hans` / `zh-Hant`) and mapped to
  the plain `zh` code used by the UI and by `browser.i18n.detectLanguage`.
- **Models are not bundled.** A single direction is tens of megabytes and useless to most people,
  so the extension ships **no translation models**; you import them in the settings page or take
  them from a release.
- **Model bytes never cross a context boundary.** This is the project's core design constraint. An
  MV3 service worker cannot spawn `Worker` threads, so translation runs in the offscreen document,
  and model data can travel neither through `runtime.sendMessage` (Chromium caps a message at
  64 MiB) nor through a long-lived `MessagePort` (the contents of large `ArrayBuffer`s are
  silently dropped). The background therefore sends only **file URLs**, and the worker that needs
  the bytes reads them itself — whether they live in the extension package or in your imported
  storage.
- **Imported models are read in place.** Imported models go into the extension's own IndexedDB and
  are read by the worker, same origin, without going through messaging at all.

### Usage

1. Open `chrome://extensions`, enable *Developer mode*, choose *Load unpacked* and point it at
   `build/chromium` (or unzip `local-translator-*.zip` from a release and load that).
2. **Import a model** (required — otherwise there is no language to translate):
   - Open the extension settings → **Translation models** → *Import model files…*
   - Select every file for **one direction**: `model.*`, `lex.*`, and either `vocab.*` or both
     `srcvocab.*` and `trgvocab.*`. The language pair is detected from the file names.
3. Use it: the toolbar icon translates text, selecting text on a page offers a translation, and
   the context menu translates a whole page.

#### How to get model files

Pick whichever suits you:

**A. Download a language pack from this project's releases (recommended)**

The packs live in their **own release**, [`models-v1`](https://github.com/CodebyGPT/Local-Translator-for-Chromium/releases/tag/models-v1),
separate from the extension: the models come from Mozilla and change rarely, while the extension
moves with the code.

One archive per language, with the model files **flat at the archive root** so the whole set can be
selected in one go. Every pack contains **both directions** (English to that language and back):

| Pack | Contents |
|---|---|
| `local-translator-models-zh-Hans.zip` | English <-> Simplified Chinese |
| `local-translator-models-zh-Hant.zip` | English <-> Traditional Chinese |
| `local-translator-models-ja.zip` | English <-> Japanese |
| `local-translator-models-ko.zip` | English <-> Korean |
| `local-translator-models-ru.zip` | English <-> Russian |
| `local-translator-models-es.zip` | English <-> Spanish |
| `local-translator-models-fr.zip` | English <-> French |
| `local-translator-models-de.zip` | English <-> German |

Unpack one and select every file in it on the settings page; they all belong to the same
directions. `manifest.json` inside records each file's source, size and SHA-256 so the download can
be verified.

**B. Fetch them with the script in this repository**

```bash
# Download model files only
npm run fetch:models -- --pairs en-de,de-en
```

Then import the files under `models/files/` through the settings page. To bundle them **into** the
extension instead (personal or internal distribution), rebuild with
`npm run build:chromium`.

**C. Get them from Mozilla directly**

Models are published by Mozilla under MPL-2.0 through the `translations-models-v2` Remote Settings
collection; the training code and data live in
[mozilla/translations](https://github.com/mozilla/translations) and the files are hosted on
`firefox-settings-attachments.cdn.mozilla.net`. Downloads are named like
`model.enzh.intgemm.alphas.bin.zst`; decompress with
[zstd](https://github.com/facebook/zstd) (drop the `.zst` suffix) and import.

> Codes like `enzh` in a filename denote the direction: the first two letters are the source
> language, the rest the target (`enzh` = English to Chinese). The extension groups files by this
> code.

### Build

Requires Node.js ≥ 22.15 (the model scripts use the built-in `zstd` decompressor).

```bash
npm ci
npm run fetch:engine      # 1. fetch the Bergamot WASM and build translator.worker.js
npm run fetch:models      # 2. writes an empty registry; add --pairs to download models
npm run build:chromium    # 3. package into build/chromium
```

**The order matters.** The packaging step copies the engine artifacts out of
`thirdparty/bergamot/build/`, so step 1 has to run first; otherwise an out-of-date
worker is packaged and translation of imported models fails.

`make build` wraps the same steps in the right order (`clean prepare engine models`,
then package); `make build TARGET=chrome` is the Chrome target.

Building the WASM engine from source needs Docker or an Emscripten SDK; see
`thirdparty/bergamot/makefile`.

### Tests

```bash
npm run test:models      # registry and model selection
npm run test:engine      # instantiates the real WASM and checks the bound API
npm run test:worker      # translates English to Chinese with the built artifacts
npm run test:browser     # loads the extension into a real Chromium (uses your Chromium/Chrome)
npm test                 # application test suite
npm run audit:offline -- build/chromium   # fails if any remote endpoint shipped
```

Build a distributable model pack (`dist/local-translator-models.zip`, with a `manifest.json`
inside):

```bash
npm run model-pack -- --pairs en-zh-Hans,zh-Hans-en
```

### Legal

- **License**: BSD-3-Clause. Full text in [LICENSE](LICENSE). Upstream Linguist uses the same
  licence; this fork keeps the original copyright notice and continues under it.
- **Translation engine**: Bergamot / Marian, MPL-2.0.
- **Translation models**: published by Mozilla under MPL-2.0. They are not distributed in this
  repository; their download and use are subject to that licence.
- **Upstream**: this project is a fork of
  [translate-tools/linguist](https://github.com/translate-tools/linguist).
- **Privacy**: the extension collects and uploads nothing. Translations, history, dictionary and
  imported models stay on your device. No remote endpoint is present in the package; verify with
  `npm run audit:offline`.
- **Disclaimer**: provided as is, without warranty of any kind. Translations are machine-generated
  and may be wrong.
