# Docker 開發與部屬指南

本指南說明如何使用 Docker 進行 Claude Scheduler 的開發和生產部屬。

## 目錄
- [快速開始](#快速開始)
- [系統需求](#系統需求)
- [開發環境](#開發環境)
- [生產環境](#生產環境)
- [常見命令](#常見命令)
- [故障排除](#故障排除)
- [進階配置](#進階配置)

---

## 快速開始

### 開發環境 (3步)

```bash
# 1. 進入項目目錄
cd /path/to/claude-scheduler

# 2. 啟動開發環境
./scripts/dev.sh start

# 3. 開啟瀏覽器
# Vite Dev Server: http://localhost:5173
# API Server: http://localhost:3000
```

### 生產環境 (3步)

```bash
# 1. 進入項目目錄
cd /path/to/claude-scheduler

# 2. 部屬生產環境
./scripts/prod.sh deploy

# 3. 訪問服務
# API Server: http://localhost:3000
```

---

## 系統需求

### 必需項目
- **Docker**: v20.10 或更高版本
- **Docker Compose**: v1.29 或更高版本
- **系統資源**:
  - 最少 2GB RAM
  - 最少 5GB 磁盤空間
  - 開發環境：建議 4GB+ RAM, 2核 CPU

### 驗證安裝

```bash
# 檢查 Docker
docker --version

# 檢查 Docker Compose
docker-compose --version

# 運行測試
docker run hello-world
```

---

## 開發環境

### 功能特性
✅ 熱模塊重加載 (HMR)
✅ 代碼外部掛載 (無需重建)
✅ 自動 npm 依賴管理
✅ 實時日誌監視
✅ 健康檢查

### 啟動開發環境

#### 方式 1: 使用啟動腳本 (推薦)

```bash
# 基本啟動
./scripts/dev.sh start

# 重建並啟動 (更新依賴時)
./scripts/dev.sh start --rebuild

# 后台運行並跟踪日誌
./scripts/dev.sh start
```

#### 方式 2: 使用 docker-compose 直接

```bash
# 啟動
docker-compose up -d

# 重建
docker-compose up -d --build

# 查看日誌
docker-compose logs -f app-dev

# 停止
docker-compose down
```

### 開發環境端口

| 服務 | 端口 | 用途 |
|------|------|------|
| Vite Dev Server | 5173 | 前端開發 & HMR |
| API Server | 3000 | 後端 API |
| Database | (內部) | SQLite |

### 在容器中進行開發

#### 打開容器終端

```bash
# 使用腳本
./scripts/dev.sh shell

# 或使用 docker
docker exec -it claude-scheduler-dev sh
```

#### 常用 npm 命令

```bash
# 安裝依賴
docker exec claude-scheduler-dev npm install

# 構建生產版本
docker exec claude-scheduler-dev npm run build

# 運行測試
docker exec claude-scheduler-dev npm run test

# 查看可用的腳本
docker exec claude-scheduler-dev npm run
```

#### 查看開發環境日誌

```bash
# 實時日誌
./scripts/dev.sh logs

# 或使用 docker
docker-compose logs -f app-dev

# 查看特定服務
docker-compose logs app-dev
```

### 停止與重啟開發環境

```bash
# 停止
./scripts/dev.sh stop
# 或
docker-compose down

# 重啟
./scripts/dev.sh restart
# 或
docker-compose restart

# 清理所有數據
./scripts/dev.sh clean
# 或
docker-compose down -v
```

---

## 生產環境

### 功能特性
✅ 優化的多階段構建
✅ 最小化運行鏡像
✅ 資源限制
✅ 自動重啟策略
✅ 健康檢查
✅ 日誌管理
✅ 數據持久化

### 部屬生產環境

#### 方式 1: 使用啟動腳本 (推薦)

```bash
# 基本部屬
./scripts/prod.sh deploy

# 重建並部屬
./scripts/prod.sh deploy --rebuild
```

#### 方式 2: 使用 docker-compose 直接

```bash
# 啟動
docker-compose -f docker-compose.prod.yml up -d

# 重建
docker-compose -f docker-compose.prod.yml up -d --build

# 查看狀態
docker-compose -f docker-compose.prod.yml ps

# 查看日誌
docker-compose -f docker-compose.prod.yml logs -f app

# 停止
docker-compose -f docker-compose.prod.yml down
```

### 配置生產環境

#### 1. 創建環境文件

```bash
# 自動創建 (推薦)
./scripts/prod.sh deploy

# 或手動創建
cp .env.production.example .env.production
```

#### 2. 編輯 `.env.production`

```env
# 生產環境配置
NODE_ENV=production
API_PORT=3000
API_HOST=0.0.0.0
LOG_LEVEL=info
DB_PATH=/app/data/scheduler.db

# Claude API
CLAUDE_API_KEY=your-api-key-here

# 安全
ALLOWED_ORIGINS=https://yourdomain.com
```

#### 3. 資源限制配置

編輯 `docker-compose.prod.yml` 中的資源限制：

```yaml
deploy:
  resources:
    limits:
      cpus: '2'        # 最多 2 核 CPU
      memory: 2G       # 最多 2GB 內存
    reservations:
      cpus: '1'        # 保留 1 核 CPU
      memory: 1G       # 保留 1GB 內存
```

### 生產環境管理

#### 查看狀態

```bash
./scripts/prod.sh status
```

#### 檢查健康狀態

```bash
./scripts/prod.sh health
```

#### 備份數據庫

```bash
./scripts/prod.sh backup

# 備份文件位置: ./backups/
```

#### 查看日誌

```bash
./scripts/prod.sh logs

# 或使用 docker
docker-compose -f docker-compose.prod.yml logs -f app
```

#### 更新應用

```bash
# 方式 1: 完整重建並重啟
./scripts/prod.sh update

# 方式 2: 簡單重啟
./scripts/prod.sh restart
```

#### 停止服務

```bash
./scripts/prod.sh stop
```

#### 清理

```bash
# 刪除容器 (保留數據)
./scripts/prod.sh clean

# 刪除所有數據 (謹慎!)
./scripts/prod.sh clean-all
```

### 生產環境數據持久化

#### 數據目錄結構

```
project-root/
├── data/
│   └── scheduler.db       # SQLite 數據庫
├── logs/
│   └── app.log           # 應用日誌
└── backups/
    └── scheduler.db.*.bak # 自動備份
```

#### 備份策略

```bash
# 自動備份 (部屬時自動執行)
./scripts/prod.sh deploy

# 手動備份
./scripts/prod.sh backup

# 列出備份
ls -lh backups/
```

---

## 常見命令

### 開發環境命令

```bash
# 啟動
./scripts/dev.sh start

# 後台啟動 (不跟踪日誌)
./scripts/dev.sh start &

# 重建並啟動
./scripts/dev.sh start --rebuild

# 查看日誌
./scripts/dev.sh logs

# 打開容器終端
./scripts/dev.sh shell

# 查看狀態
./scripts/dev.sh status

# 重啟
./scripts/dev.sh restart

# 停止
./scripts/dev.sh stop

# 完全清理
./scripts/dev.sh clean
```

### 生產環境命令

```bash
# 部屬
./scripts/prod.sh deploy

# 部屬 (重建)
./scripts/prod.sh deploy --rebuild

# 啟動
./scripts/prod.sh start

# 停止
./scripts/prod.sh stop

# 重啟
./scripts/prod.sh restart

# 查看日誌
./scripts/prod.sh logs

# 檢查健康
./scripts/prod.sh health

# 備份數據
./scripts/prod.sh backup

# 更新應用
./scripts/prod.sh update

# 查看狀態
./scripts/prod.sh status
```

### Docker Compose 直接命令

```bash
# 開發環境
docker-compose up -d           # 啟動
docker-compose down            # 停止
docker-compose logs -f app-dev # 查看日誌
docker-compose ps              # 查看狀態

# 生產環境
docker-compose -f docker-compose.prod.yml up -d
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml logs -f
```

---

## 故障排除

### 常見問題

#### 1. "Docker daemon is not running"

```bash
# 啟動 Docker (Linux)
sudo systemctl start docker

# 或 (macOS)
open /Applications/Docker.app

# 驗證
docker --version
```

#### 2. "Port 5173 already in use"

```bash
# 查找占用端口的進程
lsof -i :5173

# 或更改 docker-compose.yml 中的端口
# ports:
#   - "5174:5173"  # 改為 5174
```

#### 3. 無法連接到容器

```bash
# 檢查容器狀態
docker-compose ps

# 查看容器日誌
docker-compose logs app-dev

# 重新啟動容器
docker-compose restart
```

#### 4. 構建失敗或依賴問題

```bash
# 清理並重建
./scripts/dev.sh clean
./scripts/dev.sh start --rebuild

# 或手動清理
docker-compose down -v
docker system prune -a
```

#### 5. HMR 不工作 (熱更新)

確保您在編輯代碼時 save 文件。檢查：

```bash
# 查看 vite 日誌
docker-compose logs -f app-dev

# 驗證文件更改是否被檢測
# (應該在日誌中看到 "file change detected")
```

#### 6. 數據庫錯誤

```bash
# 備份現有數據庫
./scripts/prod.sh backup

# 刪除數據庫 (會重新初始化)
rm data/scheduler.db

# 重啟
./scripts/prod.sh restart
```

### 調試技巧

#### 進入容器調試

```bash
# 開發環境
docker exec -it claude-scheduler-dev sh

# 生產環境
docker exec -it claude-scheduler sh

# 在容器中運行命令
docker exec claude-scheduler-dev npm run build
docker exec claude-scheduler-dev node --version
```

#### 檢查網絡連接

```bash
# 容器內部 ping
docker exec claude-scheduler-dev ping google.com

# 檢查端口
docker exec claude-scheduler-dev netstat -tlnp
```

#### 查看資源使用

```bash
# 實時監視
docker stats

# 或詳細統計
docker-compose stats
```

---

## 進階配置

### 自定義構建

#### 在 Dockerfile 中修改基礎鏡像

```dockerfile
# 更改 Node 版本
FROM node:18-alpine AS development
# 或
FROM node:19-alpine AS development
```

#### 添加額外的系統依賴

```dockerfile
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    your-additional-package
```

### Nginx 反向代理 (生產)

如果需要在生產環境使用 Nginx：

#### 1. 創建 nginx.conf

```nginx
upstream api {
    server app:3000;
}

server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### 2. 在 docker-compose.prod.yml 中啟用

取消註釋 nginx 服務並更新配置。

### 監控和日誌

#### 配置日誌驅動

日誌已配置為 JSON 格式：

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

#### 集中日誌管理

可以將日誌轉發到 ELK Stack、Loki 等：

```yaml
# 在 docker-compose.prod.yml 中
logging:
  driver: "awslogs"  # 或其他驅動
  options:
    awslogs-group: "claude-scheduler"
```

### 多環境支持

#### 創建環境特定配置

```bash
# 用於不同環境
docker-compose -f docker-compose.yml -f docker-compose.override.yml up

# 或指定環境文件
docker-compose --env-file .env.staging up
```

---

## 性能優化

### 開發環境優化

```bash
# 增加文件監視限制 (Linux)
echo fs.inotify.max_user_watches=524288 | \
  sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### 生產環境優化

1. **調整資源限制**

編輯 `docker-compose.prod.yml`:

```yaml
deploy:
  resources:
    limits:
      cpus: '4'        # 根據您的服務器調整
      memory: 4G
```

2. **啟用緩存**

```bash
# 構建時使用緩存
docker-compose build --no-cache

# 或保留緩存
docker-compose build
```

---

## 安全最佳實踐

### 1. 環境變量

- ✅ 使用 `.env` 文件存儲敏感信息
- ✅ 不要將 `.env` 提交到 Git
- ❌ 不要在 docker-compose.yml 中硬編碼密鑰

### 2. 镜像安全

```bash
# 定期更新基礎鏡像
docker pull node:20-alpine

# 掃描安全漏洞
docker scan your-image-name
```

### 3. 網絡安全

- 在生產環境中使用 HTTPS
- 限制容器間的網絡通信
- 使用 firewall 規則

### 4. 數據安全

- 定期備份數據庫
- 使用加密的卷
- 限制文件權限

---

## 更新日誌

### v1.0 (2024-12-21)
- ✨ 初始 Docker 支持
- ✨ 開發和生產環境
- ✨ 自動化啟動腳本
- ✨ 健康檢查和監控
- ✨ 完整文檔

---

## 獲取幫助

### 常見資源

- [Docker 官方文檔](https://docs.docker.com/)
- [Docker Compose 官方文檔](https://docs.docker.com/compose/)
- [Vite 文檔](https://vitejs.dev/)

### 報告問題

如有問題，請：

1. 檢查日誌: `./scripts/dev.sh logs`
2. 驗證配置: 檢查 `.env` 文件
3. 重新構建: `./scripts/dev.sh start --rebuild`
4. 清理並重試: `./scripts/dev.sh clean && ./scripts/dev.sh start`

---

**祝您使用愉快！** 🚀
