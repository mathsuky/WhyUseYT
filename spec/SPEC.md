# WhyUseYT 要件定義書

## 1. 概要

YouTube の無意識な利用を防ぎ、目的意識を持った視聴を促す Chrome 拡張機能。

### 1.1 解決する課題

- 「なんとなく」YouTube を開いてしまい、気づくと長時間が経過している
- 視聴の目的が曖昧なまま動画を見続けてしまう

### 1.2 基本方針

YouTube にアクセスする際に **目的の言語化** を強制し、視聴後に **振り返り** を促すことで、ユーザーの自己管理を支援する。

---

## 2. 機能要件

### 2.1 目的入力モーダル

YouTube にアクセスした際、目的を入力するまでページを一切表示しない。

#### 制約

- `youtube.com` ドメインへのナビゲーション時に表示する
- YouTube 内の SPA 遷移（ページ内リンク移動）では表示しない（content script は初回ロード時のみ実行される）
- ページリロード時には再度表示しない（セッションが有効な間はスキップ）
- セッションのライフタイム: 目的入力からタブを閉じるまで（または時間超過まで）

#### UI 仕様

- フルスクリーンのオーバーレイ（`z-index: 2147483647`）
- 背景: YouTube ページは `visibility: hidden` で完全に非表示
- 表示要素:
  - 見出し: 「なぜ YouTube を見る必要がありますか？」
  - 説明文: 「なんのために YouTube を見るのか、目的を入力してください」
  - テキストエリア
  - 送信ボタン（テキストエリアが空の場合は disabled）
- 送信後: オーバーレイを除去し、YouTube ページを表示する

#### 技術的な要件

- `run_at: "document_start"` で実行し、YouTube のコンテンツが表示されないようにする
- `document_start` 時点では `<body>` が存在しないため、まず `<html>` に `<style>` を注入して非表示にし、`DOMContentLoaded` 後にモーダル要素を挿入する
- セッション管理に `sessionStorage` を使用する
  - リロード時: `sessionStorage` は維持される → モーダルをスキップ
  - タブを閉じた時: `sessionStorage` は自動でクリアされる → 次回モーダル表示
  - `sessionStorage` はタブごとに独立しているため、複数の YouTube タブで別々の目的を管理できる


---

### 2.2 振り返りモーダル

YouTube から離脱した際に、目的を達成できたかを振り返らせる。

#### トリガー

- `document.visibilitychange` イベントで `visibilityState` が `"hidden"` になったことを検知（タブ切り替え、ウィンドウ切り替え、最小化など）
- 離脱を記録し、**ユーザーが YouTube タブに戻ってきた時**（`visibilityState` が `"visible"` に変化）に振り返りモーダルを表示する

#### 離脱時にモーダルを表示しない理由

- `visibilitychange: "hidden"` の時点でタブは既に非表示であり、ユーザーにモーダルを見せることができない
- `beforeunload` ではブラウザ標準のダイアログしか出せず、カスタム UI を表示できない
- そのため「戻ってきた時に表示」が最も自然な UX となる

#### UI 仕様

- フルスクリーンのオーバーレイ（目的入力モーダルと同様のスタイル）
- 表示要素:
  - 見出し: 「おかえりなさい」
  - 前回入力した目的を表示: 「あなたの目的: 〇〇」
  - 質問: 「目的を達成できましたか？無駄なことをしませんでしたか？」
  - 選択ボタン: 「はい、達成できた」/「いいえ、まだ途中」/「脱線してしまった」
- 回答後: オーバーレイを除去し、YouTube ページを表示する

#### ストレージ

```
Key: history（配列に追記）
Value: [{
  reason: string,          // 入力された目的
  startTime: number,       // セッション開始時刻
  endTime: number,         // 離脱時刻
  reflection: string,      // "achieved" | "in_progress" | "distracted"
  url: string
}]
```

#### 表示制御

- 最初の離脱から戻った時のみ表示（連続してタブを切り替えるたびに表示されるのは煩わしい）
- 一度振り返りを回答したら、次に `visibilitychange: "hidden"` → `"visible"` が発生するまで再表示しない

---

### 2.3 時間制限とロック

目的入力時に目標時間を設定し、超過したら YouTube をロックする。

#### 時間入力

- 目的入力モーダル（2.1）に時間入力フィールドを追加
- ラベル: 「何分間使用しますか？」
- 数値入力（分単位、1〜120 の範囲）
- 入力は任意（空欄の場合は時間制限なし）

#### タイマー管理

- `chrome.alarms` API を使用（Service Worker の休止に耐える）
- 目的送信時にアラームを作成: `chrome.alarms.create("youtube-timer-{tabId}", { delayInMinutes: N })`
- 残り 2 分でコンテンツスクリプトに警告メッセージを送信（オプション）

#### ロック

- アラーム発火時、Background → Content Script にメッセージ送信
- Content Script が解除不可のフルスクリーンオーバーレイを表示
- 表示要素:
  - 見出し: 「時間切れです」
  - メッセージ: 「設定した ○ 分が経過しました。YouTube を閉じてください。」
  - テキストエリアや送信ボタンは**なし**（解除不可）
- MutationObserver でオーバーレイが削除された場合に再挿入する（DevTools での除去対策）

#### 警告バナー（残り 2 分）

- ページ上部に非侵入的なバナーを表示: 「残り 2 分です」
- 5 秒後に自動で消える

---

### 2.4 セッション履歴と振り返り表示

振り返り（2.2）で収集したデータを目的入力モーダル（2.1）に表示し、自己認識を促す。

#### データ保存

- 振り返り回答時に `chrome.storage.local` へセッション履歴を追記する
- ストレージ:
  ```
  chrome.storage.local:
    Key: "history"
    Value: [{
      reason: string,          // 入力された目的
      startTime: number,       // セッション開始時刻
      endTime: number,         // 離脱時刻
      reflection: string,      // "achieved" | "in_progress" | "distracted"
      url: string
    }]
  ```
- 保存上限: 直近 100 件（古いものから削除）

#### 目的入力モーダルへの表示

- 目的入力モーダル（2.1）のテキストエリア上部に、過去の振り返り要約を表示する
- 表示要素:
  - 直近のセッション: 「前回: 〇〇 → 達成できた／脱線してしまった」
  - 今週の達成率: 「今週の達成率: 3/5 (60%)」
- 履歴がない場合（初回利用時）は表示しない

#### 技術的な要件

- content script から `chrome.storage.local.get("history")` で履歴を取得する
- 集計は content script 内で行う（軽量な処理のため background 不要）
- `"storage"` 権限が必要

---

## 3. 非機能要件

### 3.1 パフォーマンス

- YouTube ページの初回描画をブロックするため、content script は軽量に保つ
- DOM 操作は最小限にし、スタイルは JavaScript 内の文字列定数として管理する

### 3.2 堅牢性

- Service Worker の休止・再起動に対応する（状態は `chrome.storage.local` に保持、タイマーは `chrome.alarms` を使用）
- YouTube の DOM 操作（SPA フレームワーク）によるオーバーレイ削除に対応する（MutationObserver）

### 3.3 プライバシー

- データはすべてローカル（`chrome.storage.local`）に保存し、外部送信しない
- 必要最小限の権限のみ要求する

---

## 4. 技術設計

### 4.1 ディレクトリ構成

```
WhyUseYT/
├── manifest.json                # 拡張機能マニフェスト (Manifest V3)
├── package.json                 # npm 設定・ビルドスクリプト
├── tsconfig.json                # TypeScript 設定
├── .gitignore                   # node_modules/, dist/
├── spec/
│   └── SPEC.md                  # 本ファイル（要件定義書）
├── src/
│   ├── content.ts               # Content Script（YouTube 上で実行）
│   │                            #   - 目的入力モーダル (2.1)
│   │                            #   - 振り返りモーダル (2.2)
│   │                            #   - ロックオーバーレイ (2.3)
│   ├── background.ts            # Service Worker
│   │                            #   - タブ追跡 (2.2)
│   │                            #   - アラーム管理 (2.3)
│   │                            #   - メッセージング
│   └── types.ts                 # 共有型定義（コンパイル時消去）
└── dist/                        # ビルド成果物（gitignore 済み）
    ├── content.js
    └── background.js
```

### 4.2 manifest.json（全機能実装時）

```json
{
  "manifest_version": 3,
  "name": "WhyUseYT",
  "version": "1.0.0",
  "description": "A Chrome extension that asks you why before opening YouTube",
  "permissions": ["storage", "tabs", "alarms"],
  "background": {
    "service_worker": "dist/background.js"
  },
  "content_scripts": [
    {
      "matches": ["*://*.youtube.com/*"],
      "js": ["dist/content.js"],
      "run_at": "document_start"
    }
  ]
}
```

## 5. 実装フェーズ

| Phase | 機能                              | 対象ファイル                                      |
| ----- | --------------------------------- | ------------------------------------------------- |
| 1     | 目的入力モーダル (2.1)            | `content.ts`, `tsconfig.json`                     |
| 2     | 振り返りモーダル (2.2) + 履歴表示 (2.4) | `content.ts`（拡張）, `manifest.json`        |
| 3     | 時間制限とロック (2.3)            | `content.ts`（拡張）, `background.ts`（新規） |

各フェーズ完了時に `chrome://extensions` で動作確認を行う。
