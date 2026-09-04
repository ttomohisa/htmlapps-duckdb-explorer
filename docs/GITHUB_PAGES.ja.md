# GitHub Pages公開ガイド

DuckDB Explorerには `.github/workflows/deploy-pages.yml` が含まれており、固定依存から単一HTMLを再ビルドして `dist/` をGitHub Pagesへ公開します。

## 初回設定

1. `ttomohisa/htmlapps-duckdb-explorer` としてGitHubへpushします。
2. **Settings → Pages** を開きます。
3. **Build and deployment** の **Source** を **GitHub Actions** にします。
4. `main` へpushするか、Actionsから **Deploy standalone app to GitHub Pages** を手動実行します。

workflowは最初に `scripts/check-repository.ps1` を実行します。repository contractと単一HTMLビルドが成功した場合だけ公開処理へ進みます。

## 公開URL

`https://ttomohisa.github.io/htmlapps-duckdb-explorer/`

## 完全ローカル処理について

GitHub Pages版を開くときは最初のHTML取得が発生します。読み込み後、ユーザーが選択したDuckDBファイルはブラウザ内で処理され、アプリから外部へアップロードされません。生成HTMLは `connect-src 'none'` を使用し、アプリの実行時処理で外部HTTP / HTTPS / WebSocket接続を行いません。

ネットワークを完全に切って使う場合は、生成済みの `dist/index.html` を直接開いてください。

## トラブルシューティング

workflowでPages未設定と表示された場合は初回設定を確認し、workflowを再実行してください。ビルドに失敗した場合はWindowsで `build-standalone.bat` を実行し、最初に報告されたrelease / build checkを修正してから再度公開します。
