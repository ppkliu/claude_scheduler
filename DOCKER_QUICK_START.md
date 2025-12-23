# Docker 快速開始指南

## 30秒快速啟動

### 開發環境
```bash
cd /path/to/claude-scheduler
./scripts/dev.sh start
# 訪問: http://localhost:5173
```

### 生產環境
```bash
cd /path/to/claude-scheduler
./scripts/prod.sh deploy
# 訪問: http://localhost:3000
```

---

## 快速命令列表

### 使用腳本 (推薦)

#### 開發
```bash
./scripts/dev.sh start          # 啟動
./scripts/dev.sh start --rebuild # 重建啟動
./scripts/dev.sh logs           # 查看日誌
./scripts/dev.sh shell          # 打開終端
./scripts/dev.sh stop           # 停止
./scripts/dev.sh clean          # 清理
```

#### 生產
```bash
./scripts/prod.sh deploy        # 部屬
./scripts/prod.sh deploy --rebuild # 重建部屬
./scripts/prod.sh logs          # 查看日誌
./scripts/prod.sh health        # 檢查健康
./scripts/prod.sh backup        # 備份數據
./scripts/prod.sh update        # 更新應用
./scripts/prod.sh stop          # 停止
```

### 使用 Makefile

```bash
make help          # 查看所有命令
make dev           # 開發環境
make dev-logs      # 開發日誌
make prod          # 生產環境
make prod-logs     # 生產日誌
make prod-health   # 檢查健康
```

### 使用 Docker Compose

```bash
# 開發
docker-compose up -d
docker-compose down
docker-compose logs -f app-dev

# 生產
docker-compose -f docker-compose.prod.yml up -d
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml logs -f app
```

---

## 訪問地址

| 環境 | 地址 | 端口 | 用途 |
|------|------|------|------|
| 開發 | http://localhost:5173 | 5173 | Vite Dev Server (前端) |
| 開發 | http://localhost:3000 | 3000 | API Server |
| 生產 | http://localhost:3000 | 3000 | API Server |

---

## 常見操作

### 開發中修改代碼
1. 編輯 `src/` 目錄中的文件
2. 保存文件
3. 瀏覽器自動刷新 (HMR)
4. ✨ 完成！

### 安裝新的 npm 包
```bash
# 編輯 package.json 或運行
docker exec claude-scheduler-dev npm install package-name

# 重建以應用更改
./scripts/dev.sh start --rebuild
```

### 在生產環境中查看日誌
```bash
./scripts/prod.sh logs
# 或
docker logs claude-scheduler -f
```

### 備份生產數據庫
```bash
./scripts/prod.sh backup
# 備份保存在: ./backups/
```

### 停止一切
```bash
# 開發
./scripts/dev.sh stop

# 生產
./scripts/prod.sh stop
```

---

## 故障排除

### Docker 未運行
```bash
# 啟動 Docker
docker --version
```

### 端口已被占用
```bash
# 更改 docker-compose.yml 中的端口
ports:
  - "5174:5173"  # 改為 5174
```

### 無法連接
```bash
# 檢查容器狀態
docker ps

# 重啟
./scripts/dev.sh restart
```

### 清除一切並重新開始
```bash
# 開發
./scripts/dev.sh clean
./scripts/dev.sh start

# 生產
./scripts/prod.sh clean
./scripts/prod.sh deploy
```

---

## 環境變量

### 開發環境 (docker-compose.yml)
```env
NODE_ENV=development
API_PORT=3000
DB_PATH=/app/scheduler.db
```

### 生產環境 (.env.production)
```env
NODE_ENV=production
API_PORT=3000
CLAUDE_API_KEY=your-key-here
```

---

## 文件位置

```
project-root/
├── Dockerfile                    # Docker 構建配置
├── docker-compose.yml            # 開發環境
├── docker-compose.prod.yml       # 生產環境
├── .dockerignore                 # Docker 忽略文件
├── .env.production.example       # 生產環境示例
├── Makefile                      # 便捷命令
├── DOCKER.md                     # 完整文檔
├── DOCKER_QUICK_START.md         # 本文件
├── scripts/
│   ├── dev.sh                    # 開發啟動腳本
│   └── prod.sh                   # 生產啟動腳本
├── src/                          # 源代碼
├── server/                       # 後端代碼
├── dist/                         # 生產構建輸出
├── data/                         # 數據文件 (生產)
├── logs/                         # 日誌文件 (生產)
└── backups/                      # 備份文件 (生產)
```

---

## 性能提示

- 💾 開發時，代碼外部掛載 (無需重建)
- 🔄 更新依賴時，使用 `--rebuild` 標籤
- 📊 監視資源使用: `docker stats`
- 🔍 檢查日誌: 快速找出問題

---

## 安全提示

- 🔐 不要提交 `.env.production` 文件
- 🔑 保護 API 密鑰
- 📦 定期備份數據庫
- 🛡️ 使用強密碼和密鑰

---

## 更多幫助

查看完整文檔: [DOCKER.md](DOCKER.md)

---

**祝您編碼愉快！** 🚀
