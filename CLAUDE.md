# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LLM Code Scheduler is a dual-purpose application:
1. **Schedule Manager**: Automates LLM Code CLI execution on a cron schedule to control the 5-hour usage limit reset
2. **Conversation Manager**: Imports, categorizes, and tracks LLM Code conversation history with complete user prompts and assistant responses

## Development Commands

### Core Commands
```bash
# Install dependencies
npm install

# Start both servers concurrently (recommended)
npm run server          # Backend on port 3001 (in separate terminal)
npm run dev            # Frontend on port 5173

# Build frontend for production
npm run build

# Preview production build
npm run preview
```

### Docker Development (Recommended for isolation)
```bash
# Using convenience scripts (with HMR & code mounting)
./scripts/dev.sh start          # Start dev environment
./scripts/dev.sh logs           # Follow logs
./scripts/dev.sh shell          # Open container shell
./scripts/dev.sh stop           # Stop environment

# Using Makefile aliases
make dev                        # Start dev
make dev-logs                   # Follow logs
make dev-clean                  # Clean up

# Using docker-compose directly
docker-compose up -d            # Start
docker-compose logs -f app-dev  # Logs
docker-compose down             # Stop
```

### Development Notes
- Frontend runs on port 5173 with Vite HMR
- Backend runs on port 3001 with auto-reload via `tsx watch`
- Vite proxies `/api/*` requests to backend in development
- **Both servers must run concurrently** for full functionality:
  ```bash
  Terminal 1: npm run server  # Start backend first (initializes DB)
  Terminal 2: npm run dev     # Then start frontend
  ```
- Docker mode mounts source code for live editing without rebuilds
- Database initialization is automatic on backend startup via `initializeDatabase()` function

## Database Schema Migrations

The application uses an automatic migration system in `server/index.ts`:

**`initializeDatabase()` function**:
- Runs on every backend startup
- Creates all tables with `CREATE TABLE IF NOT EXISTS` (idempotent)
- Uses `PRAGMA table_info(conversations)` to detect missing columns
- Automatically adds `prompt_hash` column if missing (via `ALTER TABLE`)
- Safely handles duplicate data when creating unique indexes
- Logs migration results to console

**Schema Evolution**:
- New columns are added via `ALTER TABLE` without dropping existing data
- Unique constraints are created after verifying data compatibility
- Backfill operations handle constraint violations gracefully
- No manual migration steps required for updates

**Common Issues & Fixes**:
- `SQLITE_ERROR: no such column` → Auto-fixed by migration on next startup
- `UNIQUE constraint failed` → Skipped rows logged during backfill phase
- Logs prefixed with `[Migration]` show migration progress

## Architecture

### Three-Tier Stack

```
Vue 3 Frontend (Pinia state)
    ↕ HTTP REST API
Node.js Backend (SQLite + node-cron)
    ↕ child_process.spawn()
LLM Code CLI
```

### Database Schema (scheduler.db)

**schedules**: Cron job definitions
- Stores hour/minute, cron_expression, prompt text
- `enabled` flag controls active schedules

**execution_logs**: Execution history for scheduled runs
- Links to schedule_id, captures tokens/cost/duration
- Stores LLM's response text and any errors

**conversations**: Complete conversation history
- Sources: 'scheduled', 'quick_chat', 'history_import'
- Contains both user_prompt and assistant_response
- Linked to execution_logs via execution_log_id
- **project_path** field stores the LLM projects directory path for grouping

**project_sync_status**: Tracks imports from projects JSONL files
- Records last_sync_timestamp per project
- Stores total_conversations_synced and last_sync_status

**config**: Key-value configuration storage
- history_paths: Array of LLM history.jsonl paths
- current_history_path_index: Selected path index

### State Management

Single Pinia store at `src/stores/scheduler.ts`:
- Manages all schedules, logs, conversations, usage stats
- **Field name transformation**: Backend uses snake_case (user_prompt), frontend expects camelCase (userPrompt)
- All API responses are transformed in store actions
- Project list (`availableProjects`) is fetched and cached
- Selected project filter and sort order are tracked in store

### Key Backend Functions

**server/index.ts**:
- `setupSchedule()`: Registers cron jobs with node-cron
- `executeLLMCode()`: Spawns LLM CLI with `claude -p "prompt" --output-format text --dangerously-skip-permissions --max-turns 1`
- `readHistory()`: Parses `~/.claude/history.jsonl` (user prompts only, no responses)
- `readProjectsJSONL()`: Parses `~/.claude/projects/{project}/{session-id}.jsonl` (complete transcripts with responses)
- `pairConversations()`: Matches assistant messages to user messages via parentUuid

**Conversation Import Flow**:
1. **From history.jsonl** (old method): Only captures user prompts, must correlate with execution_logs for responses
2. **From Projects JSONL** (new method): Extracts complete user-assistant pairs from session transcripts

## Critical Implementation Details

### Conversation Data Sources

The app has THREE sources of conversation data:

1. **scheduled**: From cron job executions (execution_logs table)
2. **quick_chat**: From manual quick-chat executions (execution_logs table)
3. **history_import**: From Projects JSONL files (`~/.claude/projects/`)

Only `history_import` from Projects JSONL contains complete assistant responses for manual CLI usage.

### Projects JSONL Format

Located at: `~/.claude/projects/{project-name}/{session-id}.jsonl`

Each line is a JSON object with `type: "user"` or `type: "assistant"`:
```json
{"type":"user","message":{"role":"user","content":"hi"},"uuid":"...","timestamp":"..."}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"..."}],"usage":{...}},"parentUuid":"...","uuid":"..."}
```

Assistant messages link to user messages via `parentUuid` field.

### Frontend Components

**App.vue**: Two-tab layout (Scheduler / Conversations)

**Scheduler Tab**:
- StatusPanel: Shows current usage limits
- QuickChatPanel: One-off LLM execution
- QuickSetup: 5-hour interval preset
- ScheduleCard: Individual schedule display
- LogsPanel: Execution history

**Conversations Tab**:
- ConversationPanel: Full conversation management with THREE view modes
  - **List View**: Individual conversation expand/collapse (50 per page)
  - **Analysis View**: Timeline visualization of Q&A pairs with session grouping
  - **Project View** (NEW): Groups conversations by LLM project with statistics
    - Collapsible project cards showing conversation count, tokens, cost
    - Chronologically sorted conversations within each project
    - Expandable state managed via Set<string> in parent component
  - Search, filter by source/category/project
  - MarkdownRenderer: Renders assistant responses as full Markdown with syntax highlighting
  - ConversationAnalysisView: Timeline layout showing chronological Q&A relationships
  - ConversationProjectView: Project-based grouping with collapsible UI

**Components**:
- **MarkdownRenderer.vue**:
  - Parses and renders Markdown (h1-h6, lists, tables, quotes, code blocks)
  - Syntax highlighting via highlight.js (190+ languages)
  - Copy-to-clipboard buttons for code blocks with visual feedback
  - Full XSS protection via markdown-it
  - Used in assistant response display

- **ConversationAnalysisView.vue**:
  - Chronological timeline visualization
  - Session-based grouping with statistics
  - Q&A pair visualization with arrow connectors
  - Integrated MarkdownRenderer for both user prompts and responses
  - Token/cost metadata per interaction

- **ConversationProjectView.vue** (NEW):
  - Project-based grouping computed from conversations array
  - Collapsible project cards with summary statistics
  - Takes `expandedProjects: Set<string>` prop to track UI state
  - Emits `toggle-expand` event when user clicks project header
  - Uses same MarkdownRenderer for response display

### Token & Cost Tracking

**Input**: Counted from LLM API usage metadata
**Output**: Counted from LLM API usage metadata
**Cost**: Calculated based on model pricing (currently set to Sonnet 4.5 rates)

## Project-Specific Conventions

### Time Handling
- All cron jobs use `Asia/Taipei` timezone
- executed_at timestamps in ISO format

### Minimal Token Usage
- Default prompt is "hi" (cheapest possible interaction)
- Uses `--max-turns 1` to limit conversation length
- Always uses `--dangerously-skip-permissions` for automation

### Data Transformation Pattern
When adding new API endpoints that return database records:
```typescript
// Backend returns snake_case
{ user_prompt: "...", assistant_response: "..." }

// Store must transform to camelCase
{ userPrompt: "...", assistantResponse: "..." }
```

### View Mode Management
The ConversationPanel uses a view mode ref to switch between List/Analysis/Project:
```typescript
const viewMode = ref<'list' | 'analysis' | 'project'>('list')
const expandedProjects = ref<Set<string>>(new Set())

function toggleProjectExpand(projectPath: string) {
  if (expandedProjects.value.has(projectPath)) {
    expandedProjects.value.delete(projectPath)
  } else {
    expandedProjects.value.add(projectPath)
  }
}
```

### Error Handling in Execution
- Schedule execution errors are logged to execution_logs.error
- Frontend displays error toasts with retry options
- Failed imports show detailed error messages

## LLM Code CLI Integration

The backend spawns LLM Code CLI as a child process:
```typescript
spawn('claude', ['-p', prompt, '--output-format', 'text', '--dangerously-skip-permissions', '--max-turns', '1'])
```

Output is captured via stdout/stderr and parsed for:
- Response text
- Token usage (via regex parsing of output)
- Execution time

## Working with Conversations

When implementing conversation features:
1. Check the `source` field to determine data completeness
2. For `history_import` from Projects: Full user + assistant data available
3. For `history_import` from history.jsonl: Only user prompts, assistant_response will be null unless correlated
4. Always handle null assistant_response gracefully in UI
5. Assistant responses are rendered as Markdown with syntax highlighting via MarkdownRenderer
6. Use ConversationAnalysisView for timeline/session-based views
7. Use ConversationProjectView for project-based grouping
8. ConversationPanel filters and sorts the data, views only consume and display it

The conversation pairing algorithm in `pairConversations()` matches based on `parentUuid` linkage - do not assume sequential pairing.

## Debugging & Troubleshooting

### Backend Debugging
- Backend logs are printed to stdout with prefixes: `[Migration]`, `[Backfill]`, `[ImportProjects]`, `[Groups]`, `[LLM]`, etc.
- Database queries can be logged by adding console statements near `db.prepare()` calls
- Common debugging endpoints:
  - `GET /api/conversations/debug` - Database statistics and data validation
  - `GET /api/debug/read-history` - Test history.jsonl parsing
  - `GET /api/conversations/check-new` - Check for new project files

### Frontend Debugging
- Pinia store state can be inspected via Vue DevTools
- API responses are logged with `console.log` in store actions
- Component lifecycle issues can be traced via Vue DevTools
- Network requests visible in browser DevTools Network tab

### Database Issues
- Clear all conversations (destructive): `DELETE /api/conversations/clear`
- Verify database integrity: `GET /api/conversations/debug`
- Database file location: `scheduler.db` in project root
- Use `sqlite3` CLI for direct inspection: `sqlite3 scheduler.db ".schema"`

## Rendering Markdown & Code Highlighting

### MarkdownRenderer Component
Used to render assistant responses with full Markdown support:

```vue
<MarkdownRenderer :content="conversation.assistantResponse" />
```

Features:
- **Markdown Parser**: markdown-it with XSS protection (`html: false`)
- **Syntax Highlighting**: highlight.js with 190+ language support
- **Code Copying**: Auto-injected copy buttons with clipboard API
- **Styling**: Complete coverage for h1-h6, lists, tables, quotes, blockquotes, images

When adding new Markdown-consuming features:
1. Import MarkdownRenderer component
2. Pass the text content via `:content` prop
3. Component handles all rendering and interaction

## Docker Deployment

### Development Environment
Files: `Dockerfile`, `docker-compose.yml`, `scripts/dev.sh`

Features:
- **Hot Module Reload (HMR)**: Code changes auto-update without rebuild
- **Source Code Mounting**: Edit host files, see changes in container instantly
- **Port Mapping**: 5173 (Vite), 3000 (API)
- **Auto Restart**: Configured via docker-compose

Quick start:
```bash
./scripts/dev.sh start          # Start with HMR
./scripts/dev.sh logs           # Follow logs
./scripts/dev.sh shell          # Access container shell
```

### Production Environment
Files: `docker-compose.prod.yml`, `scripts/prod.sh`, `.env.production.example`

Features:
- **Multi-stage Build**: Optimized image size via builder pattern
- **Data Persistence**: Volumes for database and logs
- **Health Checks**: Automatic service monitoring
- **Auto Restart**: Failure recovery strategy
- **Resource Limits**: CPU/memory constraints (configurable)
- **Backup**: Automatic database backups on deploy

Quick start:
```bash
./scripts/prod.sh deploy        # Full deployment
./scripts/prod.sh logs          # Follow production logs
./scripts/prod.sh backup        # Backup database
./scripts/prod.sh health        # Check service health
```

### Configuration
- Development: Auto-configured, no setup needed
- Production: Copy `.env.production.example` to `.env.production` and customize

See `DOCKER.md` and `DOCKER_QUICK_START.md` for detailed Docker documentation.

## Build & Type Checking

### Frontend Build
```bash
npm run build       # TypeScript check + Vite bundle to dist/
npm run preview     # Preview production build locally on port 4173
```

### Type Safety
- Frontend: `vue-tsc` validates Vue components and TypeScript
- Backend: No separate type check (use IDE or `tsc --noEmit`)
- Database types: Defined inline in `server/index.ts` (e.g., `Schedule`, `ExecutionLog`)
- Store types: Defined in `src/stores/scheduler.ts` with Pinia composition API
- Conversation types: Defined in `src/types/index.ts`

### Import Paths
- Frontend: `@/` resolves to `src/` (configured in `vite.config.ts`)
- Backend: Relative imports only (no path aliases)
- Components: Import from `@/components/`
- Stores: Import from `@/stores/`
- Utils: Import from `@/lib/utils`
- Types: Import from `@/types`

## Port Configuration

- **Frontend (Vite)**: 5173 (configured in `vite.config.ts`)
- **Backend (Node.js)**: 3001 (set via `process.env.PORT` or default in `server/index.ts`)
- **Vite proxy**: `/api/*` routes to `http://localhost:3001`

To change ports:
```bash
# Frontend
npm run dev -- --port 8000

# Backend
PORT=4000 npm run server
```

## Internationalization (i18n)

- Language files: `src/locales/` (en.ts, zh-TW.ts, zh-CN.ts)
- Setup: Vue i18n integrated in `src/main.ts` and `src/locales/index.ts`
- Locale storage key: `llm-scheduler-locale` (localStorage)
- Theme storage key: `llm-scheduler-theme` (localStorage)
- Use `useLocale()` composable to access `setLocale()` function
- Use `useI18n()` from vue-i18n to access `t()` translation function in templates
