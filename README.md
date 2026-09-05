# 資產視界｜資產儀表板

以 Google 試算表作為資料來源，提供繁體中文資產走勢儀表板，以及 9:16 資產成長 MP4 影片製作功能。

## Google 試算表格式

試算表必須發布為 CSV，並包含以下欄位：

| 日期 | 總價值 |
| --- | ---: |
| 2026-01-01 | 12345.67 |

## 本機執行

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
```

開啟 `http://localhost:8080`。

## Zeabur 部署

Repository 已包含 `Dockerfile`，在 Zeabur 連接 GitHub Repository 後即可使用 Dockerfile 部署。

建議設定：

- `GOOGLE_SHEET_CSV_URL`：已發布的 Google 試算表 CSV 網址。
- `PORTFOLIO_CACHE_SECONDS`：資料快取秒數，預設為 `300`。

影片會暫存在容器的 `/tmp`，服務重新啟動後會自動清除。
