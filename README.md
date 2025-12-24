# LLM Code Scheduler

定時與 LLM Code 對話，控制 5 小時限制重置時間，讓你在工作時間內有充足的使用額度。

## 功能特點

- 🕐 **5 小時間隔快速設定** - 一鍵建立 5 個排程，確保全天候覆蓋
- 💬 **最小 Token 對話** - 使用 "hi" 作為預設 prompt，花費最少 token
- 📊 **Token 使用追蹤** - 查看每日/每週的 token 消耗和成本
- 🎯 **立即執行** - 可以手動觸發任何排程立即執行
- 📝 **執行記錄** - 查看所有排程執行的歷史記錄

## 系統架構

```
┌─────────────────────────────────────────────────┐
│                  Vue 3 Frontend                 │
│  (shadcn-vue + Tailwind CSS + Pinia)           │
└─────────────────┬───────────────────────────────┘
                  │ HTTP API
┌─────────────────▼───────────────────────────────┐
│               Node.js Server                    │
│  (node-cron + better-sqlite3)                  │
└─────────────────┬───────────────────────────────┘
                  │ CLI spawn
┌─────────────────▼───────────────────────────────┐
│              LLM Code CLI                    │
│  (claude -p "hi")                              │
└─────────────────────────────────────────────────┘
```

## 安裝與啟動

### 1. 安裝依賴

```bash
npm install
```

### 2. 啟動後端伺服器

```bash
npm run server
```

伺服器會在 `http://localhost:3001` 啟動，並：
- 初始化 SQLite 資料庫 (`scheduler.db`)
- 載入已有的排程
- 開始執行定時任務

### 3. 啟動前端開發伺服器

```bash
npm run dev
```

前端會在 `http://localhost:5173` 啟動。

## 使用方式

### 快速設定 5 小時間隔

1. 在「快速設定」區塊選擇起始時間（例如 4:00）
2. 點擊「套用」
3. 系統會自動建立 5 個排程：04:00、09:00、14:00、19:00、00:00

### 自訂排程

1. 點擊「新增排程」
2. 輸入排程名稱
3. 選擇執行時間
4. 設定 prompt（預設 "hi" 最省 token）
5. 點擊「建立排程」

### 建議的排程設定

如果你的上班時間是 9:00，建議設定：

| 時間 | 說明 |
|------|------|
| 04:00 | 上班前 5 小時重置，確保 9:00 有滿額度 |
| 09:00 | 上班時重置 |
| 14:00 | 下午重置 |
| 19:00 | 下班後重置 |
| 00:00 | 午夜重置 |

## API 端點

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/schedules` | 取得所有排程 |
| POST | `/api/schedules` | 建立新排程 |
| PUT | `/api/schedules/:id` | 更新排程 |
| DELETE | `/api/schedules/:id` | 刪除排程 |
| POST | `/api/schedules/:id/execute` | 立即執行排程 |
| GET | `/api/logs` | 取得執行記錄 |
| GET | `/api/stats` | 取得統計資料 |
| GET | `/api/usage` | 取得 Token 使用量 |
| POST | `/api/presets/5hour` | 快速設定 5 小時間隔 |

## 注意事項

1. **確保 LLM Code CLI 已安裝並登入**
   ```bash
   npm install -g @anthropic-ai/claude-code
   claude login
   ```

2. **時區設定**
   - 伺服器使用 `Asia/Taipei` 時區
   - 可在 `server/index.ts` 中修改 `timezone` 設定

3. **後台運行**
   - 建議使用 `pm2` 或 `systemd` 保持伺服器在背景運行
   ```bash
   npm install -g pm2
   pm2 start "npm run server" --name claude-scheduler
   ```

4. **Token 估算**
   - Token 使用量為估算值（基於字元數）
   - 實際消耗以 Anthropic 帳單為準

## 技術棧

- **前端**: Vue 3 + TypeScript + Vite + Tailwind CSS + Pinia
- **後端**: Node.js + TypeScript + better-sqlite3 + node-cron
- **CLI**: @anthropic-ai/claude-code

## License

MIT

---

## Pro 訂閱使用限制與控制

### 使用量限制 (Pro $20/月)

| 限制類型 | 數值 |
|---------|------|
| 每 5 小時 | 約 10-40 prompts |
| 每週 | 約 40-80 小時 Sonnet 4 |
| 模型 | 僅 Sonnet 4 (Pro 無法用 Opus) |

### LLM Code CLI 控制參數

```bash
# 最省 token 的執行方式
claude -p "hi" --max-turns 1 --dangerously-skip-permissions

# 只讀分析模式
claude -p "分析 codebase" --permission-mode plan

# 指定允許的工具
claude --allowedTools "Edit,Bash(npm run *)"
```

### 權限模式切換

在 LLM Code 互動模式中按 `Shift+Tab` 循環：
- `normal-mode` - 標準模式，會詢問權限
- `auto-accept edit on` - 自動接受編輯
- `plan mode on` - 只讀計劃模式

### settings.json 設定範例

```json
// ~/.claude/settings.json
{
  "permissions": {
    "allow": [
      "Edit",
      "Bash(npm run *)",
      "Bash(git *)"
    ],
    "deny": [
      "Bash(rm -rf *)",
      "WebFetch(*)"
    ]
  },
  "defaultMode": "default"
}
```

### 省 Token 技巧

1. **使用最短 prompt** - 本工具預設用 "hi"
2. **限制對話輪數** - 使用 `--max-turns 1`
3. **使用 Projects** - 文件會被快取
4. **批次提問** - 一次問多個問題比分開問省

### 監控使用量

```bash
# 即時監控
npx ccusage@latest blocks --live

# 月報表
npx ccusage@latest monthly
```

或在 https://claude.ai/settings/usage 查看
