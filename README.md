# freelyピアノ教室 生徒管理アプリ

スマホで使うための構成:

- 画面の公開: GitHub Pages
- データ保存: Supabase
- ログイン: Supabase Auth
- スマホ利用: Safari / Chromeで開いてホーム画面に追加

## いまの状態

Supabase未設定の間は、このパソコン内だけのデモ保存で動きます。

ローカル確認:

http://localhost:4173

デモログイン:

- ID: `teacher`
- パスワード: `admin123`

## Supabaseでやること

1. Supabaseで新しいプロジェクトを作ります。
2. SQL Editorを開きます。
3. `supabase-schema.sql` の中身を貼り付けて実行します。
4. Authentication > Users から講師用ユーザーを追加します。
5. Project Settings > API Keys から次の2つを控えます。
   - Project URL
   - Publishable key
6. `config.js` に貼り付けます。

```js
window.PIANO_APP_CONFIG = {
  supabaseUrl: "Project URLをここに貼ります",
  supabaseAnonKey: "Publishable keyをここに貼ります",
};
```

## GitHub Pagesでやること

1. GitHubで新しいリポジトリを作ります。
2. このフォルダのファイルをアップロードします。
3. GitHubの Settings > Pages を開きます。
4. Sourceを `Deploy from a branch` にします。
5. Branchを `main`、フォルダを `/root` にします。
6. 表示されたURLをスマホで開きます。
7. スマホの共有メニューから「ホーム画面に追加」を選びます。

## できること

- 生徒カードの追加、編集、削除
- 名前、学年、コース、曜日、開始時間、レッスン費の管理
- 今月月謝のワンタップ領収
- 月謝、施設費、ライブ参加費、発表会費、その他の入金履歴管理
- 入金履歴の各行から、領収、保存、取消、休会中、削除を操作
- 休会中の登録（3か月分を月謝不要として管理）
- 2026年4月以降、直近1年分の領収日、金額、メモの確認
- 対面月謝とチケット制レッスン費の合計を別々に確認
- お教室からの案内事項の管理
- 講師メモの管理
- レッスンコースと料金の編集
- お教室名の変更
- 管理画面ログインパスワードの変更

## 既存Supabaseに今回の入金履歴機能を追加する場合

Supabaseの SQL Editor で `supabase-migration-receipts.sql` を実行します。
