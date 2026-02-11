#!/bin/bash
set -e

echo "Starting LLM Scheduler with Claude CLI support..."

# 1. Validate host Claude installation
echo ""
echo "Step 1: Validating host Claude installation..."
./scripts/validate-claude-mount.sh

if [ $? -ne 0 ]; then
  echo "Validation failed. Exiting."
  exit 1
fi

# 2. Set environment variables
echo ""
echo "Step 2: Setting environment variables..."
export USER_ID=$(id -u)
export GROUP_ID=$(id -g)

# Auto-detect Claude CLI version
CLAUDE_VERSIONS_DIR="${HOME}/.local/share/claude/versions"
if [ -d "$CLAUDE_VERSIONS_DIR" ]; then
  CLAUDE_CLI_VERSION=$(ls -v "$CLAUDE_VERSIONS_DIR" 2>/dev/null | tail -1)
  if [ -n "$CLAUDE_CLI_VERSION" ]; then
    export CLAUDE_CLI_VERSION
  fi
fi

echo "USER_ID=$USER_ID"
echo "GROUP_ID=$GROUP_ID"
echo "CLAUDE_CLI_VERSION=${CLAUDE_CLI_VERSION:-not detected}"

# 3. Start Docker Compose
echo ""
echo "Step 3: Starting Docker Compose..."
docker compose up -d

# 4. Wait for services to start
echo ""
echo "Step 4: Waiting for services to start..."
sleep 5

# 5. Check container health
echo ""
echo "Step 5: Checking container health..."
docker compose ps

# 6. Verify Claude CLI inside container
echo ""
echo "Step 6: Verifying Claude CLI inside container..."
docker compose exec app-dev /usr/local/bin/claude --version || {
  echo "Error: Claude CLI not accessible inside container"
  exit 1
}

echo ""
echo "All checks passed!"
echo ""
echo "Services are running at:"
echo "  - Frontend: http://localhost:5173"
echo "  - Backend API: http://localhost:3000"
echo ""
echo "View logs:"
echo "  docker compose logs -f app-dev"
echo ""
echo "Stop services:"
echo "  docker compose down"
