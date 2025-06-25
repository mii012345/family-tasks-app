# Googleカレンダー連携＆自動スケジューリング機能の実装

## 📋 概要
Issue #8 の要件に基づき、Googleカレンダー連携機能と自動スケジューリング機能を実装しました。

## ✨ 実装した機能

### 🔐 Google認証システム
- **Google Identity Services (GIS)** を使用した最新の認証方式
- **認証情報の永続化** - ページリロード後も認証状態を維持
- **自動トークン管理** - 有効期限の自動チェックと更新

### 📅 自動カレンダー連携
- **タスク追加時の自動スケジューリング** - 期限があるタスクを自動でGoogleカレンダーに追加
- **AI見積もりベースの時間配分** - タスクを4つのフェーズ（アイデア→設計→実装→改善）に分割
- **就業時間内での最適配置** - 設定された就業時間内の空き時間に自動配置

### ⚙️ 設定機能
- **カレンダー設定UI** - Google認証、就業時間設定、タスク設定
- **就業時間の曜日別設定** - 各曜日ごとに開始・終了時間と有効/無効を設定
- **バッファ時間設定** - タスク間の休憩時間を設定可能

### 📊 スケジュール表示
- **日次・週次ビューでの可視化** - カレンダー形式でタスクブロックを表示
- **フェーズ別色分け** - 各フェーズを異なる色で表示
- **ドラッグ&ドロップ対応** - 将来的な手動調整に対応

### 🔄 ユーザー体験の向上
- **ローディング表示** - カレンダー追加処理中の詳細な進捗表示
- **リアルタイム通知** - 処理状況を絵文字付きで分かりやすく表示
- **エラーハンドリング** - 失敗時の適切なフィードバック

## 🛠️ 技術的な実装

### 新規追加ファイル
- `src/services/googleCalendar.ts` - Google Calendar API統合
- `src/services/scheduler.ts` - スケジューリングエンジン
- `src/components/CalendarSettings.tsx` - カレンダー設定UI
- `src/components/ScheduleView.tsx` - スケジュール表示UI
- `.env.example` - 環境変数設定例

### 主要な変更
- **App.tsx**: タスク追加時の自動カレンダー連携、ローディング状態管理
- **vite.config.ts**: CORS設定の追加
- **package.json**: Google APIs Client Libraryの追加

### データ構造の拡張
```typescript
interface Task {
  // 既存フィールド...
  calendarEvents?: CalendarEvent[];
  scheduledStartDate?: Date;
  scheduledEndDate?: Date;
}

interface UserSettings {
  workingHours: WorkingHours;
  googleCalendarEnabled: boolean;
  defaultTaskDuration: number;
  bufferTime: number;
}
```

## 🚀 使用方法

### 1. 環境設定
```bash
# 依存関係のインストール
npm install

# 環境変数の設定
cp .env.example .env
# .envファイルにGoogle API認証情報を設定
```

### 2. Google Cloud Console設定
1. Google Cloud Consoleでプロジェクトを作成
2. Google Calendar APIを有効化
3. OAuth 2.0クライアントIDを作成
4. 承認済みJavaScriptオリジンに `http://localhost:3001` を追加

### 3. 基本的な使用フロー
1. **カレンダー設定** (📅) でGoogleにサインイン
2. **就業時間を設定** して保存
3. **期限付きタスクを追加**: `買い物 明日15時`
4. **自動でGoogleカレンダーにスケジュール**される

## 🧪 テスト項目

### ✅ 認証機能
- [ ] Googleサインインが正常に動作する
- [ ] ページリロード後も認証状態が維持される
- [ ] サインアウトが正常に動作する

### ✅ スケジューリング機能
- [ ] 期限付きタスクが自動でカレンダーに追加される
- [ ] 就業時間内にスケジュールされる
- [ ] フェーズ別に時間が分割される

### ✅ UI/UX
- [ ] ローディング表示が正常に動作する
- [ ] 進捗通知が適切に表示される
- [ ] エラー時の通知が表示される

## 📝 今後の拡張予定

- **リアルタイム再調整機能** (Issue #9)
- **進捗可視化ダッシュボード** (Issue #10)
- **AI分析レポート機能** (Issue #11)

## 🔗 関連Issue

Closes #8

## 📸 スクリーンショット

### カレンダー設定画面
![カレンダー設定](docs/calendar-settings.png)

### スケジュール表示
![スケジュール表示](docs/schedule-view.png)

### ローディング表示
![ローディング表示](docs/loading-states.png)

---

## 🔍 レビューポイント

1. **セキュリティ**: 認証情報の適切な管理
2. **パフォーマンス**: API呼び出しの最適化
3. **エラーハンドリング**: 各種エラーケースの対応
4. **ユーザビリティ**: 直感的な操作性

## 📋 チェックリスト

- [x] 機能要件を満たしている
- [x] TypeScriptエラーがない
- [x] ビルドが成功する
- [x] 基本的な動作確認済み
- [x] ローディング状態の実装
- [x] エラーハンドリングの実装
- [x] 認証情報の永続化
- [x] レスポンシブデザイン対応
