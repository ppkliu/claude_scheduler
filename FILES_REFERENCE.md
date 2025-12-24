# Files Reference Guide

Complete listing of all files created/modified in Claude Scheduler v1.2

---

## 📋 Quick Navigation

- **[Docker Configuration](#docker-configuration)** - Container setup files
- **[Management Scripts](#management-scripts)** - Automation and control
- **[Documentation](#documentation)** - Guides and references
- **[Application Code](#application-code)** - Vue components and features

---

## Docker Configuration

### 1. Dockerfile
**Location**: `/Dockerfile`
**Size**: 2.2 KB
**Type**: Docker build configuration

**Purpose**: Multi-stage Docker build configuration supporting:
- **Development Stage**: Node 20 Alpine with Vite dev server
- **Builder Stage**: Creates optimized production assets
- **Production Stage**: Minimal runtime environment with non-root user

**Key Features**:
- Exposes ports 5173 (Vite) and 3000 (API)
- Uses dumb-init for proper signal handling
- Non-root user execution (node)
- Health check configuration
- Multi-stage optimization for production

**Used By**:
- `docker-compose.yml` (development)
- `docker-compose.prod.yml` (production)

---

### 2. docker-compose.yml
**Location**: `/docker-compose.yml`
**Size**: 1.6 KB
**Type**: Docker Compose configuration (Development)

**Purpose**: Development environment orchestration with:
- Live code mounting (external directory)
- Vite dev server with HMR
- Backend API server
- Health checks
- Network configuration

**Services**:
- `app-dev`: Development application container

**Volumes**:
- `.:/app` - External code mounting
- `node_modules:/app/node_modules` - Dependency isolation

**Ports**:
- 5173 → Vite dev server (frontend)
- 3000 → API server (backend)

**Environment**:
- NODE_ENV=development
- API_PORT=3000
- DB_PATH=/app/scheduler.db

**Key Feature**: External code mounting allows editing on host with instant container sync

---

### 3. docker-compose.prod.yml
**Location**: `/docker-compose.prod.yml`
**Size**: 2.1 KB
**Type**: Docker Compose configuration (Production)

**Purpose**: Production environment with:
- Data persistence
- Health monitoring
- Resource limitations
- Automated restart
- Structured logging

**Services**:
- `app`: Production application container

**Volumes**:
- `./data:/app/data` - Database persistence
- `./logs:/app/logs` - Log file storage

**Ports**:
- 3000 → API server

**Resource Limits**:
- CPU: 2 cores (configurable)
- Memory: 2GB (configurable)

**Features**:
- Restart policy: unless-stopped
- Health check: Every 10 seconds
- JSON logging with 10MB rotation
- Environment variables from .env.production

**Key Feature**: Production-grade configuration with monitoring and backups

---

### 4. .dockerignore
**Location**: `/.dockerignore`
**Size**: 838 bytes
**Type**: Build context optimization

**Purpose**: Excludes unnecessary files from Docker build context to:
- Reduce image build time
- Improve build cache efficiency
- Keep images smaller

**Excludes**:
- node_modules/
- dist/ (build output)
- .git/ (version control)
- .env files (sensitive data)
- Log files
- Database files
- IDE configurations

---

## Management Scripts

### 5. scripts/dev.sh
**Location**: `/scripts/dev.sh`
**Size**: 5.6 KB
**Lines**: 196
**Type**: Bash shell script (executable)

**Purpose**: Development environment management with commands:

**Commands**:
- `start` - Start development environment with live code mounting and HMR
- `start --rebuild` - Rebuild Docker image before starting
- `logs` - Follow real-time logs from development container
- `shell` - Open interactive shell in development container
- `stop` - Stop development environment
- `restart` - Restart development containers
- `clean` - Remove containers and volumes (preserves data)
- `status` - Display current service status
- `--help` - Show detailed help and examples

**Features**:
- Color-coded output for readability
- Docker/Docker Compose existence checks
- Service health monitoring with polling
- Automatic log following on startup
- User-friendly error messages
- Confirmation prompts for destructive operations

**Usage Example**:
```bash
./scripts/dev.sh start
./scripts/dev.sh logs
./scripts/dev.sh shell
./scripts/dev.sh stop
```

---

### 6. scripts/prod.sh
**Location**: `/scripts/prod.sh`
**Size**: 8.5 KB
**Lines**: 303
**Type**: Bash shell script (executable)

**Purpose**: Production deployment management with commands:

**Commands**:
- `deploy` - Deploy production environment
- `deploy --rebuild` - Rebuild before deploying
- `start` - Start production container
- `stop` - Stop production container
- `restart` - Restart production container
- `logs` - Follow production logs
- `status` - Display service status
- `health` - Run health checks (with retry logic)
- `backup` - Backup database (creates ./backups/)
- `update` - Update and redeploy application
- `shell` - Open container shell
- `clean` - Remove containers (keep data)
- `clean-all` - Complete cleanup (DELETE DATA - careful!)
- `--help` - Show detailed help and examples

**Features**:
- .env.production validation
- Auto-generation from .env.production.example
- Pre-deployment database backup
- Health check with 10 retry attempts
- Directory creation (data/, logs/, backups/)
- Confirmation prompts for destructive operations
- Detailed error messages and troubleshooting
- JSON logging configuration

**Usage Example**:
```bash
./scripts/prod.sh deploy
./scripts/prod.sh health
./scripts/prod.sh logs
./scripts/prod.sh backup
```

---

### 7. Makefile
**Location**: `/Makefile`
**Size**: 4.8 KB
**Lines**: 170
**Type**: GNU Make configuration

**Purpose**: Convenient command aliases delegating to scripts

**Development Targets**:
- `make dev` - Start development environment
- `make dev-build` - Rebuild and start
- `make dev-logs` - View development logs
- `make dev-shell` - Open development shell
- `make dev-status` - Show development status
- `make dev-stop` - Stop development
- `make dev-restart` - Restart development
- `make dev-clean` - Clean development environment

**Production Targets**:
- `make prod` - Deploy production
- `make prod-build` - Rebuild and deploy
- `make prod-logs` - View production logs
- `make prod-health` - Check health
- `make prod-backup` - Backup database
- `make prod-status` - Show production status
- `make prod-stop` - Stop production
- `make prod-restart` - Restart production
- `make prod-update` - Update and redeploy
- `make prod-clean` - Clean (keep data)
- `make prod-clean-all` - Complete cleanup

**Utility Targets**:
- `make install` - Install npm dependencies
- `make build` - Build production bundle
- `make lint` - Run code linter
- `make format` - Format code
- `make type-check` - TypeScript type checking

**Docker Targets**:
- `make docker-ps` - Show running containers
- `make docker-images` - Show Docker images
- `make docker-clean` - Clean dangling images

**Combined Targets**:
- `make setup-dev` - Install deps + start dev
- `make setup-prod` - Install deps + deploy prod
- `make all` - Build + deploy prod
- `make help` - Show all commands with descriptions

**Features**:
- Color-coded help output
- Full documentation on each target
- Easy command discovery with `make help`

---

## Configuration

### 8. .env.production.example
**Location**: `/.env.production.example`
**Size**: 3.1 KB
**Lines**: 132
**Type**: Environment configuration template

**Purpose**: Template for production environment variables

**Sections**:
1. **Node Environment**
   - NODE_ENV=production

2. **Server Configuration**
   - API_PORT (default: 3000)
   - API_HOST (default: 0.0.0.0)

3. **Database Configuration**
   - DB_PATH (default: /app/data/scheduler.db)

4. **Claude API**
   - CLAUDE_API_KEY (required - get from console.anthropic.com)

5. **Logging**
   - LOG_LEVEL (debug, info, warn, error)
   - LOG_FORMAT (json, text)

6. **Security**
   - ALLOWED_ORIGINS (CORS configuration)
   - JWT_SECRET (optional)

7. **Feature Flags**
   - ENABLE_MARKDOWN
   - ENABLE_ANALYSIS
   - ENABLE_AUTO_REFRESH

8. **Performance**
   - DB_POOL_SIZE
   - REQUEST_TIMEOUT

9. **Email** (optional)
   - SMTP_HOST, SMTP_PORT, etc.

10. **Backup**
    - ENABLE_AUTO_BACKUP
    - BACKUP_FREQUENCY (hours)
    - BACKUP_RETENTION (number of backups)

11. **Monitoring** (optional)
    - SENTRY_DSN
    - DataDog configuration

12. **Docker**
    - DOCKER_LOG_LEVEL
    - CONTAINER_MEMORY
    - CONTAINER_CPUS

**Usage**:
```bash
# Copy template to actual config
cp .env.production.example .env.production

# Edit with your settings
vi .env.production
```

---

## Documentation

### 9. START_HERE.md
**Location**: `/START_HERE.md`
**Size**: 8 KB
**Lines**: 350+
**Type**: Quick start and navigation guide

**Sections**:
- 30-second quick start (3 options)
- Path selection (developer, deployer, learner)
- Common tasks with commands
- Documentation guide
- Troubleshooting
- Key concepts explained
- Getting help
- Next actions

**Best For**: First-time users, quick reference

---

### 10. DOCKER_QUICK_START.md
**Location**: `/DOCKER_QUICK_START.md`
**Size**: 4.5 KB
**Lines**: 228
**Type**: Quick reference guide

**Sections**:
- 30-second quick start
- Quick command list (all 3 methods)
- Access URLs
- Common operations
- Troubleshooting quick fixes
- Environment variables
- File locations
- Performance and security tips

**Best For**: Experienced users needing quick reference

---

### 11. DOCKER.md
**Location**: `/DOCKER.md`
**Size**: 12 KB
**Lines**: 746
**Type**: Complete Docker reference guide

**Sections**:
- Quick start (3 steps each)
- System requirements
- Development environment (detailed setup)
- Production environment (detailed setup)
- Common commands (all methods)
- Troubleshooting (6+ issues with solutions)
- Debugging techniques
- Advanced configuration
- Performance optimization
- Security best practices
- Update history

**Best For**: Complete Docker understanding

---

### 12. DOCKER_SETUP_SUMMARY.md
**Location**: `/DOCKER_SETUP_SUMMARY.md`
**Size**: 7.2 KB
**Lines**: 363
**Type**: Setup verification and summary

**Sections**:
- Overview
- Installed files listing
- Quick start
- Core features
- Documentation structure
- Checklist for verification
- Security tips
- FAQ
- Resource usage
- Next steps

**Best For**: Verifying installation and setup

---

### 13. PROJECT_STATUS.md
**Location**: `/PROJECT_STATUS.md`
**Size**: 13 KB
**Lines**: 516
**Type**: Comprehensive project overview

**Sections**:
- Project overview
- Completed features (all phases)
- Project structure (detailed tree)
- Quick start (all methods)
- Technology stack
- Feature comparison table
- Workflow guides (dev/test/prod)
- Documentation guide
- Security checklist
- Performance considerations
- Common tasks
- Troubleshooting
- Environment configuration
- Version history

**Best For**: Understanding complete project

---

### 14. IMPLEMENTATION_SUMMARY.md
**Location**: `/IMPLEMENTATION_SUMMARY.md`
**Size**: 15 KB
**Lines**: 700+
**Type**: Detailed implementation report

**Sections**:
- What was implemented
- Key features of implementation
- Metrics and statistics
- Quality assurance
- Security review
- Documentation verification
- Ready for use checklist
- Technology stack
- What was learned
- Deliverables checklist

**Best For**: Understanding implementation details

---

### 15. CLAUDE.md
**Location**: `/CLAUDE.md`
**Size**: 10 KB
**Lines**: 285
**Type**: Architecture guide for LLM Code instances

**Updates in v1.2**:
- Added Docker Development subsection (3 methods)
- Added Rendering Markdown & Code Highlighting section
- Added Docker Deployment section
- Updated component documentation

**Content**:
- Project overview
- Development commands (with Docker section)
- Project structure
- API endpoints
- Frontend components
- Backend implementation
- Database schema
- State management
- Rendering markdown & code highlighting
- Docker deployment

**Best For**: Future LLM Code instances, developers new to project

---

### 16. README.md (Original)
**Location**: `/README.md`
**Size**: 5.6 KB
**Type**: Original project documentation

**Content**:
- Project overview
- Features
- Installation
- Development
- Usage
- Architecture

**Status**: Preserved from original project

---

### 17. FILES_REFERENCE.md
**Location**: `/FILES_REFERENCE.md`
**Size**: This file
**Type**: Complete files inventory and guide

**Content**:
- This reference guide
- All files documented with purpose, size, content

---

## Application Code

### 18. src/components/ConversationPanel.vue
**Location**: `/src/components/ConversationPanel.vue`
**Size**: ~50 KB
**Lines**: 1184
**Type**: Vue 3 component

**New/Modified Features in v1.2**:
- **Refresh Button**: New button to refresh conversations from latest timestamp
- **isRefreshing State**: Tracks refresh operation status
- **latestMessageTimestamp Computed**: Calculates most recent message time
- **refreshConversations() Method**: Fetches new conversations while preserving filters
- **Visual Feedback**: Loading state, disabled button, tooltip with timestamp

**Existing Features**:
- Conversation list display
- Search and filtering
- Category and source management
- Conversation grouping
- Sort functionality

**Purpose**: Main component for displaying and managing conversation list

---

### 19. src/components/MarkdownRenderer.vue
**Location**: `/src/components/MarkdownRenderer.vue`
**Size**: ~12 KB
**Lines**: 306
**Type**: Vue 3 component (NEW in v1.1)

**Features**:
- Markdown parsing with markdown-it
- Syntax highlighting with highlight.js (190+ languages)
- Copy-to-clipboard buttons on code blocks
- Responsive design with full HTML support
- Tables and list rendering

**Used For**: Rendering assistant responses with formatted code

---

### 20. src/components/ConversationAnalysisView.vue
**Location**: `/src/components/ConversationAnalysisView.vue`
**Size**: ~8 KB
**Lines**: 158
**Type**: Vue 3 component (NEW in v1.1)

**Features**:
- Timeline-based visualization of conversations
- Session grouping by date
- Chronological Q&A pair display
- Interactive session collapse/expand
- Statistics and summaries

**Used For**: Analyzing conversation patterns and history

---

## Summary Statistics

| Category | Files | Total Size | Total Lines |
|----------|-------|-----------|-------------|
| **Docker Config** | 4 | 6.8 KB | ~100 |
| **Scripts** | 3 | 18.9 KB | 669 |
| **Config Files** | 1 | 3.1 KB | 132 |
| **Documentation** | 8 | 52 KB | 2,500+ |
| **Application Code** | 3 | 70 KB | 1,648 |
| **TOTAL** | 19 | 150+ KB | 5,000+ |

---

## File Organization

```
claude-scheduler/
├── 📄 Configuration
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── docker-compose.prod.yml
│   ├── .dockerignore
│   └── .env.production.example
│
├── 📂 scripts/ (Automation)
│   ├── dev.sh
│   └── prod.sh
│
├── 📄 Makefile
│
├── 📂 Documentation
│   ├── START_HERE.md
│   ├── DOCKER_QUICK_START.md
│   ├── DOCKER.md
│   ├── DOCKER_SETUP_SUMMARY.md
│   ├── PROJECT_STATUS.md
│   ├── IMPLEMENTATION_SUMMARY.md
│   ├── FILES_REFERENCE.md
│   ├── CLAUDE.md
│   └── README.md
│
├── 📂 src/components/ (Vue)
│   ├── ConversationPanel.vue
│   ├── MarkdownRenderer.vue
│   └── ConversationAnalysisView.vue
│
└── 📂 Other/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    └── ... (existing project files)
```

---

## Quick Reference by Use Case

### 👨‍💻 For Developers
- **Start Here**: `START_HERE.md`
- **Reference**: `DOCKER_QUICK_START.md`
- **Deep Dive**: `DOCKER.md`
- **Architecture**: `CLAUDE.md`
- **Commands**: `Makefile` (`make help`)

### 🚀 For Deployment
- **Start Here**: `DOCKER_QUICK_START.md`
- **Reference**: `DOCKER.md` (Production section)
- **Management**: `scripts/prod.sh --help`
- **Configuration**: `.env.production.example`

### 📚 For Learning
- **Overview**: `PROJECT_STATUS.md`
- **Details**: `IMPLEMENTATION_SUMMARY.md`
- **Architecture**: `CLAUDE.md`
- **Docker**: `DOCKER.md`

### 🔧 For Troubleshooting
- **Quick Fixes**: `DOCKER_QUICK_START.md`
- **Detailed Solutions**: `DOCKER.md` (Troubleshooting)
- **Health Check**: `scripts/prod.sh health`
- **Logs**: `scripts/dev.sh logs` or `scripts/prod.sh logs`

---

**All files created on 2025-12-22**
**Version: Claude Scheduler v1.2**
**Status: ✅ Complete and Production Ready**
