<h1 align="center"><img src="src/res/logo.svg" width="96" height="96" alt="Local Translator"></h1>

<h1 align="center">Local Translator for Chromium</h1>

<p align="center">
  <a href="#zh">涓枃</a> 路 <a href="#en">English</a>
</p>

---

<a id="zh"></a>

## 涓枃

### 杩欐槸浠€涔?
涓€涓?*瀹屽叏绂荤嚎**鐨?Chromium 娴忚鍣ㄧ炕璇戞墿灞曘€傜綉椤电炕璇戙€佸垝璇嶇炕璇戙€佹枃鏈炕璇戝叏閮ㄥ湪浣犺嚜宸?鐨勭數鑴戜笂瀹屾垚锛屼娇鐢?Firefox 鍐呯疆缈昏瘧鎵€鐢ㄧ殑鍚屼竴涓紩鎿庯紙[Bergamot](https://browser.mt)锛?缂栬瘧涓?WebAssembly锛夈€?
瀹冧笉鏄换浣曞晢涓氱炕璇戞帴鍙ｇ殑澹炽€傛病鏈変簯绔炕璇戙€佹病鏈夐仴娴嬨€佹病鏈夊穿婧冧笂鎶ャ€佹病鏈夎嚜鍔ㄦ洿鏂般€?鍞竴浼氳仈缃戠殑鍦版柟鏄瀯寤洪樁娈电殑妯″瀷涓嬭浇鑴氭湰锛岃繍琛屽湪浣犺嚜宸辨満鍣ㄤ笂銆?
### 鎶€鏈寒鐐?
- **寮曟搸涓?Firefox 鍚屾簮銆?* 浣跨敤 Mozilla 閫氳繃 Remote Settings 鍙戝竷鐨?Bergamot WASM
  锛坄v0.4.5`锛屼笌 Firefox 122 鍐呯疆鐨勫畬鍏ㄤ竴鑷达級锛屾ā鍨嬫枃浠舵牸寮忋€佺簿搴﹂厤缃紙`int8shiftAlphaAll`锛?  涓庤瘝琛ㄥ竷灞€閮戒笌 Firefox 淇濇寔涓€鑷淬€?- **鏀寔涓枃銆?* 涓枃鎸夊瓧褰㈠垎寮€鍙戝竷锛坄zh-Hans` / `zh-Hant`锛夛紝鎵╁睍鍐呴儴缁熶竴鏄犲皠涓?`zh`锛?  涓?`browser.i18n.detectLanguage` 鍜岀晫闈㈣瑷€鐮佷繚鎸佷竴鑷淬€?- **妯″瀷涓嶉殢鍖呭垎鍙戙€?* 姣忎釜璇█鏂瑰悜鍔ㄨ緞鍑犲崄 MB锛屽澶氭暟浜烘棤鐢ㄣ€傛墿灞曢粯璁?*涓嶅寘鍚换浣?  缈昏瘧妯″瀷**锛岀敱浣犲湪璁剧疆鐣岄潰瀵煎叆锛屾垨浠?Release 涓嬭浇妯″瀷鍖呫€?- **妯″瀷瀛楄妭涓嶈法涓婁笅鏂囦紶閫掋€?* 杩欐槸鏈」鐩殑鏍稿績璁捐绾︽潫锛歁V3 鐨勫悗鍙?Service Worker
  鏃犳硶鍒涘缓 `Worker`锛岀炕璇戣窇鍦?offscreen document 閲岋紝鑰屾ā鍨嬫暟鎹棦杩囦笉浜?  `runtime.sendMessage`锛圕hromium 涓婇檺 64 MiB锛夛紝涔熻繃涓嶄簡闀胯繛 `MessagePort`
  锛堝ぇ `ArrayBuffer` 鐨勫唴瀹逛細琚潤榛樹涪寮冿級銆傚洜姝ゅ悗鍙板彧浼犻€?*鏂囦欢 URL**锛岀敱鐪熸闇€瑕佸瓧鑺傜殑
  worker 鑷繁璇诲彇 鈥斺€?鏃犺妯″瀷鍦ㄦ墿灞曞寘閲岃繕鏄湪浣犲鍏ョ殑瀛樺偍閲屻€?- **瀵煎叆鐨勬ā鍨嬪氨鍦拌鍙栥€?* 瀵煎叆鐨勬ā鍨嬪瓨杩涙墿灞曡嚜宸辩殑 IndexedDB锛寃orker 鍦ㄥ悓涓€鏉ユ簮涓嬬洿鎺?  璇诲彇锛屽叏绋嬩笉缁忚繃娑堟伅閫氶亾銆?
### 浣跨敤鏂规硶

1. 鍦?`chrome://extensions` 鎵撳紑銆屽紑鍙戣€呮ā寮忋€嶏紝閫夋嫨銆屽姞杞藉凡瑙ｅ帇鐨勬墿灞曠▼搴忋€嶏紝鎸囧悜
   鏋勫缓浜х墿鐨?`build/chromium` 鐩綍銆?2. **瀵煎叆缈昏瘧妯″瀷**锛堝繀鍋氾紝鍚﹀垯娌℃湁鍙炕璇戠殑璇█锛夛細
   - 鎵撳紑鎵╁睍璁剧疆椤?鈫?**缈昏瘧妯″瀷** 鈫?銆屽鍏ユā鍨嬫枃浠垛€︺€?   - 閫夋嫨**鍚屼竴涓瑷€鏂瑰悜**鐨勫叏閮ㄦ枃浠讹紙`model.*`銆乣lex.*` 浠ュ強 `vocab.*` 鎴?     `srcvocab.*` + `trgvocab.*`锛夛紝鎵╁睍浼氳嚜鍔ㄨ瘑鍒瑷€瀵瑰苟娉ㄥ唽銆?3. 浣跨敤锛氱偣鍑诲伐鍏锋爮鍥炬爣鍙炕璇戞枃鏈紱鍦ㄤ换鎰忕綉椤典笂閫変腑鏂囧瓧鍙炕璇戦€夊尯锛涘彸閿彍鍗曞彲缈昏瘧鏁撮〉銆?
#### 濡備綍鑾峰彇妯″瀷鏂囦欢

涓夌鏂瑰紡锛屼换閫夊叾涓€锛?
**A. 浠庢湰椤圭洰鐨?Release 涓嬭浇妯″瀷鍖咃紙鎺ㄨ崘锛?*

Release 椤甸潰鎻愪緵 `local-translator-models.zip` 鈥斺€?鍏ㄩ儴妯″瀷鏂囦欢**骞抽摵鍦ㄥ帇缂╁寘鏍圭洰褰?*锛屾柟渚?涓€娆℃€у叏閫夈€傝В鍘嬪悗锛屽湪璁剧疆椤甸€変腑浣犺鐢ㄧ殑璇█鏂瑰悜鐨勫叏閮ㄦ枃浠跺嵆鍙€傚寘鍐呯殑 `manifest.json`
璁板綍浜嗘瘡涓枃浠剁殑鏉ユ簮銆佸ぇ灏忎笌 SHA-256锛屼究浜庢牎楠屻€?
鍙戝竷鍒楄〃褰撳墠鍖呭惈锛?
- `en` 鈫?`zh-Hans`锛堣嫳璇?鈫?绠€浣撲腑鏂囷級

鏇村璇█鏂瑰悜璇风敤涓嬮潰鐨勬柟寮?B 鎴?C 鑷鑾峰彇锛涘彂甯冨寘涔熶細闅忕増鏈墿鍏呫€?
**B. 鐢ㄤ粨搴撻噷鐨勮剼鏈嚜琛屼笅杞?*

```bash
npm run fetch:models -- --pairs en-zh-Hans,zh-Hans-en
```

鏂囦欢浼氬啓鍏?`models/files/`锛屽悓鏃剁敓鎴愭敞鍐岃〃 `models/index.json`銆傜劧鍚庨噸鏂版瀯寤猴紝杩欎簺妯″瀷灏变細
**闅忔墿灞曚竴璧锋墦鍖?*锛堥€傜敤浜庤嚜鐢ㄦ垨鍐呴儴鍒嗗彂锛夈€?
**C. 鐩存帴浠?Mozilla 鑾峰彇**

妯″瀷鐢?Mozilla 浠?MPL-2.0 鍙戝竷锛屾潵婧愭槸 Remote Settings 鐨?`translations-models-v2`
闆嗗悎锛涜缁冧笌鏁版嵁浠撳簱瑙?[mozilla/translations](https://github.com/mozilla/translations)锛?妯″瀷鏂囦欢鎵樼鍦?`firefox-settings-attachments.cdn.mozilla.net`銆備笅杞藉悗鐨勬枃浠跺悕褰㈠
`model.enzh.intgemm.alphas.bin.zst`锛岀敤 [zstd](https://github.com/facebook/zstd) 瑙ｅ帇
锛堝幓鎺?`.zst` 鍚庣紑锛夊嵆鍙鍏ャ€?
> 鏂囦欢鍚嶉噷鐨?`enzh` 杩欑被浠ｇ爜琛ㄧず璇█鏂瑰悜锛氬墠涓や綅鏄簮璇█锛屽叾浣欐槸鐩爣璇█
> 锛坄enzh` = 鑻辫鈫掍腑鏂囷級銆傛墿灞曚細鎹鑷姩鍒嗙粍銆?
### 鏋勫缓

闇€瑕?Node.js 鈮?22.15锛堟ā鍨嬭剼鏈敤鍒板唴缃?`zstd` 瑙ｅ帇锛夈€?
```bash
npm ci
npm run fetch:engine      # 涓嬭浇鍥哄畾鐗堟湰鐨?Bergamot WASM锛堟瀯寤洪樁娈靛敮涓€鑱旂綉姝ラ涔嬩竴锛?npm run fetch:models      # 榛樿鍐欏叆绌烘敞鍐岃〃锛涘姞 --pairs 鎵嶄細鎵撳寘妯″瀷
npm run build:chromium    # 浜х墿鍦?build/chromium
```

鐢?`make` 浜﹀彲锛歚make build`銆傛寚瀹氱洰鏍囷細`make build TARGET=chrome`銆?
浠庢簮鐮佹瀯寤?WASM 寮曟搸闇€瑕?Docker 鎴?Emscripten SDK锛岃
`thirdparty/bergamot/makefile`銆?
### 娴嬭瘯

```bash
npm run test:models      # 妯″瀷娉ㄥ唽琛ㄤ笌閫夋嫨閫昏緫
npm run test:engine      # 鐪熷疄瀹炰緥鍖?WASM 骞舵牎楠屾墍缁戝畾鐨?API
npm run test:worker      # 鐢ㄦ瀯寤轰骇鐗╄窇閫氳嫳璇戜腑
npm run test:browser     # 鍦ㄧ湡瀹?Chromium 閲屽姞杞芥墿灞曞苟缈昏瘧锛堥渶鏈満宸茶 Chromium/Chrome锛?npm test                 # 搴旂敤娴嬭瘯濂椾欢
npm run audit:offline -- build/chromium   # 瀹¤锛氫骇鐗╀腑涓嶅緱鍑虹幇浠讳綍杩滅▼鍦板潃
```

鎵撲竴涓彂甯冪敤鐨勬ā鍨嬪寘锛堢敓鎴?`dist/local-translator-models.zip`锛屽惈 `manifest.json`锛夛細

```bash
npm run model-pack -- --pairs en-zh-Hans,zh-Hans-en
```

### 娉曞緥淇℃伅

- **璁稿彲璇?*锛欱SD-3-Clause銆傚畬鏁存枃鏈 [LICENSE](LICENSE)銆備笂娓?Linguist 閲囩敤鍚屼竴璁稿彲锛?  鏈」鐩綔涓鸿鐢熶綔鍝佷繚鐣欏師鏈夌増鏉冨０鏄庡苟娌跨敤璇ヨ鍙€?- **缈昏瘧寮曟搸**锛欱ergamot / Marian锛孧PL-2.0銆?- **缈昏瘧妯″瀷**锛氱敱 Mozilla 鍙戝竷锛孧PL-2.0銆傛ā鍨嬩笉闅忔湰浠撳簱鍒嗗彂锛屼笅杞戒笌浣跨敤璇烽伒瀹堝叾璁稿彲銆?- **涓婃父椤圭洰**锛氭湰椤圭洰 fork 鑷?[translate-tools/linguist](https://github.com/translate-tools/linguist)銆?  渚濇嵁 GPL-3.0 淇濈暀浜嗙浉鍚岀殑璁稿彲涓庣増鏉冨０鏄庛€?- **闅愮**锛氭墿灞曚笉鏀堕泦銆佷笉涓婁紶浠讳綍鏁版嵁銆傜炕璇戝唴瀹广€佸巻鍙茶褰曘€佽瘝鍏镐笌瀵煎叆鐨勬ā鍨嬪潎鍙繚瀛樺湪
  鏈満銆傚畨瑁呭寘鍐呬笉鍚换浣曡繙绋嬬鐐癸紝鍙敤 `npm run audit:offline` 澶嶆牳銆?- **鍏嶈矗澹版槑**锛氭湰杞欢鎸夊師鏍锋彁渚涳紝涓嶉檮甯︿换浣曟媴淇濄€傜炕璇戠粨鏋滅敱鏈哄櫒鐢熸垚锛屽彲鑳戒笉鍑嗙‘銆?
---

<a id="en"></a>

## English

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
  the bytes reads them itself 鈥?whether they live in the extension package or in your imported
  storage.
- **Imported models are read in place.** Imported models go into the extension's own IndexedDB and
  are read by the worker, same origin, without going through messaging at all.

### Usage

1. Open `chrome://extensions`, enable *Developer mode*, choose *Load unpacked* and point it at
   `build/chromium`.
2. **Import a model** (required 鈥?otherwise there is no language to translate):
   - Open the extension settings 鈫?**Translation models** 鈫?*Import model files鈥?
   - Select every file for **one direction** (`model.*`, `lex.*` plus either `vocab.*` or
     `srcvocab.*` + `trgvocab.*`). The language pair is detected from the file names.
3. Use it: the toolbar icon translates text, selecting text on a page offers a translation, and
   the context menu translates a whole page.

#### How to get model files

Pick whichever suits you:

**A. Download the model pack from this project's releases (recommended)**

Each release publishes `local-translator-models.zip` with the model files **flat at the archive
root**, so the whole set can be selected in one go. Unpack it and import the direction you want
through the settings page; `manifest.json` inside records each file's source, size and SHA-256 so
the download can be verified.

The current release ships:

- `en` <-> `zh-Hans` (English <-> Simplified Chinese)

More directions can be fetched with option B or C below.

**B. Fetch them with the script in this repository**

```bash
npm run fetch:models -- --pairs en-zh-Hans,zh-Hans-en
```

Files are written to `models/files/` and a registry to `models/index.json`. Rebuild, and those
models are **bundled with the extension** 鈥?handy for personal or internal distribution.

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

Requires Node.js 鈮?22.15 (the model scripts use the built-in `zstd` decompressor).

```bash
npm ci
npm run fetch:engine      # pinned Bergamot WASM (one of the two network steps, build time only)
npm run fetch:models      # writes an empty registry; add --pairs to bundle models
npm run build:chromium    # output in build/chromium
```

`make build` wraps the same steps; `make build TARGET=chrome` is the Chrome target.

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

Build a distributable model pack (`dist/local-translator-models.zip`, with a
`manifest.json` inside):

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
  [translate-tools/linguist](https://github.com/translate-tools/linguist). The same licence and
  copyright notices are kept, as GPL-3.0 requires.
- **Privacy**: the extension collects and uploads nothing. Translations, history, dictionary and
  imported models stay on your device. No remote endpoint is present in the package; verify with
  `npm run audit:offline`.
- **Disclaimer**: provided as is, without warranty of any kind. Translations are machine-generated
  and may be wrong.
