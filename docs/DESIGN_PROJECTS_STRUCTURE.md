# Design Code Projects 目錄結構說明

## 概述

`~/.claude/projects/` 目錄存儲所有 Design Code 專案的對話歷史記錄。當使用者與 Design Code 進行對話時，所有的訊息交互都會以 JSONL 格式存儲在相應專案的目錄中。

## 目錄結構

### 專案目錄命名規則

每個專案對應一個目錄，其命名規則如下：

**格式**：`-{absolute-path-with-slashes-replaced-by-hyphens}`

**命名過程**：
1. 取得專案的絕對路徑，例如：`/home/image/projllm/llmservice/vermilion-aigc/aigc-crawler`
2. 去掉開頭的斜杠：`home/image/projllm/llmservice/vermilion-aigc/aigc-crawler`
3. 將所有斜杠替換為連字號：`home-image-projllm-llmservice-vermilion-aigc-aigc-crawler`
4. 在開頭加上連字號：`-home-image-projllm-llmservice-vermilion-aigc-aigc-crawler`

**示例**：
```
專案路徑：
  /home/image/projllm/llmservice/vermilion-aigc/aigc-crawler

對應目錄名：
  -home-image-projllm-llmservice-vermilion-aigc-aigc-crawler

專案路徑：
  /home/image/projllm/sideporj/auto_pilot/claude_scheduler

對應目錄名：
  -home-image-projllm-sideporj-auto-pilot-claude-scheduler
```

### Session JSONL 文件

每個專案目錄內包含多個 JSONL 文件，代表不同的對話 session。

**命名格式**：`agent-{session_id}.jsonl`

**Session ID**：
- 由 8 位十六進制字符組成，例如 `06e134aa`
- 唯一標識一個對話 session
- 由 Design Code 自動生成

**示例檔案結構**：
```
~/.claude/projects/
├── -home-image-projllm-llmservice-vermilion-aigc-aigc-crawler/
│   ├── agent-06e134aa.jsonl        # Session 1
│   ├── agent-0da7ee54.jsonl        # Session 2
│   ├── agent-1a2b3c4d.jsonl        # Session 3
│   └── ... (更多 session 文件)
│
└── -home-image-projllm-sideporj-auto-pilot-claude-scheduler/
    ├── agent-12345678.jsonl        # Session 1
    ├── agent-87654321.jsonl        # Session 2
    └── ... (更多 session 文件)
```

## JSONL 文件格式詳解

JSONL (JSON Lines) 是一種行分隔的 JSON 格式。每一行是一個獨立的 JSON 對象，代表對話中的一個訊息或事件。

### 訊息類型

#### 1. User Message (用戶提示)

用戶發送給 Design Code 的訊息。

```json
{
  "role": "user",
  "content": "用戶提出的問題或請求內容",
  "timestamp": "2025-12-20T08:30:45.123Z",
  "metadata": {
    "source": "manual"
  }
}
```

**字段說明**：
- `role`: 固定值 `"user"`
- `content`: 用戶的提示文本，可包含代碼片段、問題描述等
- `timestamp`: ISO 8601 格式的時間戳，表示訊息發送時間
- `metadata.source`: 訊息來源，例如 `"manual"`（手動輸入）

#### 2. Assistant Message (Design 回應)

Design 對用戶提示的回應。

```json
{
  "role": "assistant",
  "content": "Design 提供的完整回應內容\n\n可能包括多行文本",
  "timestamp": "2025-12-20T08:30:50.456Z",
  "usage": {
    "input_tokens": 150,
    "output_tokens": 300,
    "total_tokens": 450
  },
  "cost": {
    "usd": 0.002250
  }
}
```

**字段說明**：
- `role`: 固定值 `"assistant"`
- `content`: Design 的完整回應文本
- `timestamp`: ISO 8601 格式的時間戳
- `usage.input_tokens`: 回應中使用的輸入 tokens 數量
- `usage.output_tokens`: 回應中生成的輸出 tokens 數量
- `usage.total_tokens`: 總 tokens 數 (input_tokens + output_tokens)
- `cost.usd`: 該回應的 API 成本（美元）

#### 3. Tool Use Messages (工具調用)

Design 使用特定工具（如檔案編輯、代碼執行等）的記錄。

```json
{
  "role": "assistant",
  "tool_use": {
    "name": "Read",
    "id": "tool-123abc",
    "input": {
      "file_path": "/path/to/file.ts"
    }
  },
  "timestamp": "2025-12-20T08:30:52.789Z"
}
```

**工具列表**：
- `Read` - 讀取檔案內容
- `Edit` - 編輯檔案
- `Write` - 寫入新檔案
- `Bash` - 執行 bash 命令
- `Glob` - 文件模式匹配
- `Grep` - 內容搜索
- 等等...

#### 4. Tool Result Message (工具執行結果)

工具執行後返回的結果。

```json
{
  "role": "user",
  "tool_result": {
    "tool_use_id": "tool-123abc",
    "content": "工具執行的結果內容"
  },
  "timestamp": "2025-12-20T08:30:53.100Z"
}
```

### 完整對話示例

一個完整的對話 session 可能包含以下訊息序列：

```
時間 08:30:45 - User: "讀取 src/main.ts 檔案"
時間 08:30:50 - Assistant: "檔案內容如下..."
時間 08:30:52 - Assistant: 使用 Read 工具
時間 08:30:53 - User: 工具執行結果
時間 08:31:00 - Assistant: "根據檔案內容的分析..."
時間 08:31:05 - User: "修改這個檔案..."
時間 08:31:10 - Assistant: 使用 Edit 工具
時間 08:31:11 - User: 工具執行結果
時間 08:31:15 - Assistant: "檔案已修改完成"
```

## 對話配對邏輯

在導入對話時，系統需要將 user messages 和 assistant messages 配對，形成完整的對話交互。

### 配對規則

1. **順序匹配**：按時間戳 (timestamp) 順序，找到最接近的 user 和 assistant 訊息對
2. **時間依賴**：Assistant message 的時間戳必須晚於對應的 user message
3. **工具調用處理**：如果中間有工具調用，整個過程（包括工具使用和結果）視為單個配對的一部分
4. **唯一性**：每個 user message 只能配對一個最終的 assistant response

### 配對算法

```
1. 遍歷所有訊息，按時間戳排序
2. 將訊息分為兩類：user_messages 和 assistant_messages
3. 對於每個 user message：
   - 找到時間戳最接近的後續 assistant message
   - 確保沒有其他 user message 在它們之間
   - 組合為一個對話對
4. 提取 tokens 和成本信息
5. 存儲到資料庫
```

## 資料庫存儲

導入的對話存儲在 SQLite 資料庫中的 `conversations` 表。

### 表結構

```sql
CREATE TABLE conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  project_path TEXT,
  user_prompt TEXT,
  assistant_response TEXT,
  executed_at TEXT,
  category TEXT,
  source TEXT DEFAULT 'imported',
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  cost_usd REAL
)
```

### 欄位說明

| 欄位 | 類型 | 說明 |
|------|------|------|
| `id` | INTEGER | 主鍵，自動遞增 |
| `session_id` | TEXT | Session ID，從檔案名提取（如 `06e134aa`） |
| `project_path` | TEXT | 專案路徑編碼值（如 `-home-image-projllm-...`）用於篩選 |
| `user_prompt` | TEXT | 用戶的提示文本 |
| `assistant_response` | TEXT | Design 的完整回應 |
| `executed_at` | TEXT | 執行時間（ISO 8601 格式） |
| `category` | TEXT | 對話分類（general、coding、analysis 等） |
| `source` | TEXT | 來源（imported、scheduled、manual） |
| `input_tokens` | INTEGER | 輸入 tokens 數 |
| `output_tokens` | INTEGER | 輸出 tokens 數 |
| `total_tokens` | INTEGER | 總 tokens 數 |
| `cost_usd` | REAL | 成本（美元） |

## 導入流程

### 完整導入步驟

1. **掃描專案目錄**
   - 讀取 `~/.claude/projects/` 下的所有子目錄
   - 識別專案路徑編碼值（目錄名）
   - 解碼回原始專案路徑

2. **讀取 JSONL 檔案**
   - 對於每個專案，讀取所有 `.jsonl` 檔案
   - 逐行解析 JSON 對象
   - 分類訊息為 user_messages 和 assistant_messages

3. **配對對話**
   - 使用配對邏輯（參考上文）
   - 提取 tokens 和成本信息
   - 保留時間戳信息

4. **檢查重複**
   - 檢查資料庫中是否已存在相同 session_id
   - 避免重複導入

5. **存儲到資料庫**
   - 插入配對後的對話到 conversations 表
   - 確保 project_path 正確存儲以支持後續篩選

6. **更新索引**
   - 建立 session_id 和 project_path 索引以加快查詢

### API 端點

#### 列出所有專案
```http
GET /api/conversations/projects/list
```

**回應**：
```json
{
  "success": true,
  "data": [
    {
      "projectPath": "-home-image-projllm-sideporj-auto-pilot-claude-scheduler",
      "decodedPath": "/home/image/projllm/sideporj/auto_pilot/claude_scheduler",
      "displayName": "claude_scheduler",
      "conversationCount": 42
    },
    {
      "projectPath": "-home-image-projllm-llmservice-vermilion-aigc-aigc-crawler",
      "decodedPath": "/home/image/projllm/llmservice/vermilion-aigc/aigc-crawler",
      "displayName": "aigc-crawler",
      "conversationCount": 28
    }
  ]
}
```

#### 查詢對話分組
```http
GET /api/conversations/groups?projectPath={encoded_path}&sortOrder={asc|desc}
```

**參數**：
- `projectPath` (可選): 專案路徑編碼值。如不指定或為 "all"，返回所有專案的對話
- `sortOrder` (可選): 排序順序 (`asc` 升序、`desc` 降序)，預設 `desc`（最新優先）
- `search` (可選): 搜索關鍵詞
- `source` (可選): 篩選來源（imported、scheduled、manual）
- `category` (可選): 篩選分類

**回應**：
```json
{
  "success": true,
  "data": [
    {
      "date": "2025-12-20",
      "conversations": [
        {
          "id": 1,
          "session_id": "06e134aa",
          "project_path": "-home-image-projllm-sideporj-auto-pilot-claude-scheduler",
          "user_prompt": "讀取 src/main.ts",
          "assistant_response": "檔案內容如下...",
          "executed_at": "2025-12-20T08:30:50Z",
          "category": "coding",
          "source": "imported",
          "total_tokens": 450,
          "cost_usd": 0.0022
        }
      ]
    }
  ]
}
```

#### 導入專案對話
```http
POST /api/conversations/import-from-projects
Content-Type: application/json

{
  "projectPath": "-home-image-projllm-sideporj-auto-pilot-claude-scheduler"
}
```

**參數**：
- `projectPath` (可選): 指定導入特定專案。如不指定，導入所有專案

**回應**：
```json
{
  "success": true,
  "data": {
    "imported": 42,
    "skipped": 0,
    "errors": 0,
    "projects": [
      {
        "projectPath": "-home-image-projllm-sideporj-auto-pilot-claude-scheduler",
        "conversationCount": 42
      }
    ]
  }
}
```

## 使用場景

### 場景 1：首次導入所有專案對話

使用者首次進入應用，點擊「從專案導入」按鈕。

```javascript
const response = await fetch('/api/conversations/import-from-projects', {
  method: 'POST'
})
```

系統掃描 `~/.claude/projects/` 下所有目錄，讀取 JSONL 檔案，導入所有對話。

### 場景 2：檢視特定專案的對話

使用者選擇專案篩選器，選擇「claude_scheduler」專案。

```javascript
const response = await fetch(
  '/api/conversations/groups?projectPath=-home-image-projllm-sideporj-auto-pilot-claude-scheduler'
)
```

系統返回該專案的所有對話，按日期分組。

### 場景 3：查看最新的對話（降序排列）

```javascript
const response = await fetch(
  '/api/conversations/groups?sortOrder=desc'
)
```

系統按時間倒序返回對話，最新的在前。

### 場景 4：搜索特定內容的對話

```javascript
const response = await fetch(
  '/api/conversations/groups?search=bug%20fix&projectPath=-home-image-projllm-sideporj-auto-pilot-claude-scheduler'
)
```

系統搜索該專案中與「bug fix」相關的對話。

## 重要注意事項

### 性能考慮

1. **大檔案處理**：JSONL 檔案可能非常大（數十 MB），需要流式讀取而不是一次性載入到記憶體
2. **索引優化**：為 `session_id` 和 `project_path` 建立資料庫索引以加快查詢
3. **增量導入**：避免重複導入已存在的 session，建議檢查重複項

### 資料安全

1. **敏感信息**：對話中可能包含密碼、API 鍵等敏感信息，應妥善保護
2. **隱私考慮**：只有授權使用者應能訪問導入的對話
3. **備份策略**：定期備份資料庫以防數據丟失

### 兼容性

1. **版本變更**：Design Code 更新可能改變 JSONL 格式，需要版本控制
2. **遷移路徑**：如果 Design Code 更改文件存儲位置，需要提供遷移工具
3. **向後兼容**：導入邏輯應能處理多種版本的 JSONL 格式

## 故障排除

### 導入失敗

**症狀**：導入按鈕無反應或顯示錯誤

**可能原因**：
- `~/.claude/projects/` 目錄不存在或無讀取權限
- JSONL 檔案格式損壞
- 資料庫連接失敗

**解決方案**：
1. 檢查目錄存在性：`ls -la ~/.claude/projects/`
2. 驗證檔案格式：檢查 JSONL 檔案是否有效 JSON
3. 檢查資料庫：確認 `scheduler.db` 存在且可寫

### 對話顯示不完整

**症狀**：導入後只看到部分對話

**可能原因**：
- 配對邏輯有誤
- timestamp 格式不一致
- 資料庫查詢結果被截斷

**解決方案**：
1. 檢查 JSONL 檔案中的 timestamp 格式
2. 驗證配對邏輯是否正確處理工具調用
3. 檢查資料庫查詢的 LIMIT 和 OFFSET

## 參考資源

- JSONL 格式：[JSON Lines 官方網站](https://jsonlines.org/)
- Design Code 文檔：官方使用指南
- SQLite 優化：[SQLite 官方文檔](https://www.sqlite.org/docs.html)
