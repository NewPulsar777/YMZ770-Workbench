# YMZ770B / YMZ770C AMM Workbench

ブラウザで動く Yamaha YMZ770B (AMMSL) / YMZ770C (AMMS-A) のレジスタ／ミキサー挙動エミュレータです。8つの再生チャンネル、phrase・音量・パン・ループ・key on/off、マスター音量・mute・clip/boostレジスタ、address/dataポートを実装しています。

YMZ770C仕様に従い、phrase開始位置をATBL byteのD0を含む25-bit byte addressとして扱います。8-bit ROMは最大16 MiB、16-bit ROMは最大32 MiBです。

ROMロード時はテーブルの範囲検査に加えて、同じ開始位置を共有するphraseをまとめ、固有ポインタごとにAMM先頭フレームをprobeします。終端ダミーなど復号不能なエントリは未使用としてUIから除外します。

各チャンネルの `SAVE PHRASE WAV` で単一phraseを保存できます。シーケンス欄の `SAVE WAV` は、指定順序、無音トリム、20msクロスフェード、チャンネル音量・パン、マスター設定を反映した16-bit PCM WAVをオフライン生成します。

起動時のMASTER音量は最大値の255です。

各チャンネルのPHRASE欄には前後移動ボタンがあり、未使用番号を飛ばして有効なPHRASEだけを循環選択できます。再生中の変更では新しいPHRASEへ即座に切り替わります。

## Windows standalone版

WindowsではElectronウィンドウ、内蔵localhost API、ネイティブ`amm_decode.exe`を1つのアプリとして配布できます。Pythonや外部ブラウザは不要です。ビルド方法は `windows/BUILD-WINDOWS.md` を参照してください。

## macOS standalone版

macOSではElectronの`.app`とネイティブ`amm_decode`をDMGまたはZIPとして配布できます。Pythonや外部ブラウザは不要です。ビルド方法は `macos/BUILD-MACOS.md` を参照してください。

```sh
clang++ -std=c++20 -O3 native/amm_decode.cpp native/mpeg_audio.cpp -o native/amm_decode
python3 server.py
# http://127.0.0.1:8765
node --test
```

ROM未ロード時はUIとレジスタ動作を確認するためのWeb Audio代替波形を使います。ROMロード後はAMM/AMMSL Layer IIデコーダで各phraseをPCM化し、実データを再生します。物理ROMダンプ向けに「16-BIT BYTE SWAP」は初期状態で有効です。MAME等ですでにword-swap済みのイメージでは解除してください。ゲームROMや音声ROMは同梱していません。

検証済みROM: `BANCHO_SND.BIN`（8 MiB、SHA-256 `72276281c8331c541089a4c213815151c4ec0e00921f093c835269b47406d15d`）。16-bit byte-swap有効時にphrase 0以降を32 kHz AMMSLとして復号できることを確認しています。

各phraseの復号上限には、ROM上で次に現れる有効なphrase開始位置を使用します。番号が疎で直後のエントリが未使用でも、次の有効音声の手前で停止するため、デコーダのsync検索が別の音へ入ることを防ぎます。

ROM読込時にphraseテーブルを検査し、`0xFFFFFFFF`やROM範囲外を指す未使用エントリを無効化します。最初に見つかった有効phraseを全チャンネルへ自動設定します。

## シーケンス再生

SEQUENCE PLAYERへ `017 019 020 021` のように10進数のPHRASE番号を空白・カンマ・改行区切りで入力し、チャンネルを選んで `PLAY SEQUENCE` を押します。開始前に全音声をPCMへ展開し、先頭・末尾の無音および低レベルのパディングを検出して除外した後、Web Audioの同一タイムライン上で20 msクロスフェード接続します。`LOOP`を有効にするとリスト全体を繰り返します。`0x17`のような明示的な16進表記も使用できます。

レジスタ挙動はMAMEの `ymz770_device` 実装を参照しました。`native/mpeg_audio.*` はMAMEから移植したBSD-3-Clauseコードです。著作権表示は各ソース先頭にあります。
