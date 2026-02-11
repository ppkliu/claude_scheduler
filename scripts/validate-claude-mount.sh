#!/bin/bash
set -e

echo "==================================="
echo "Claude CLI Mount Validation Script"
echo "==================================="
echo ""

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Auto-detect latest Claude CLI version
CLAUDE_VERSIONS_DIR="${HOME}/.local/share/claude/versions"
CLAUDE_CLI_BINARY=""
if [ -d "$CLAUDE_VERSIONS_DIR" ]; then
  CLAUDE_CLI_BINARY=$(ls -v "$CLAUDE_VERSIONS_DIR" 2>/dev/null | tail -1)
fi

if [ -n "$CLAUDE_CLI_BINARY" ]; then
  CLAUDE_CLI_PATH="${CLAUDE_VERSIONS_DIR}/${CLAUDE_CLI_BINARY}"
  echo -e "Detected Claude CLI version: ${GREEN}${CLAUDE_CLI_BINARY}${NC}"
else
  CLAUDE_CLI_PATH="${CLAUDE_VERSIONS_DIR}/unknown"
  echo -e "${YELLOW}⚠️  Could not detect Claude CLI version${NC}"
fi
echo ""

# Check functions
check_file() {
  local file=$1
  local name=$2

  if [ -f "$file" ]; then
    echo -e "${GREEN}✅ Found${NC}: $name at $file"
    return 0
  else
    echo -e "${RED}❌ Missing${NC}: $name at $file"
    return 1
  fi
}

check_dir() {
  local dir=$1
  local name=$2

  if [ -d "$dir" ]; then
    echo -e "${GREEN}✅ Found${NC}: $name at $dir"
    return 0
  else
    echo -e "${RED}❌ Missing${NC}: $name at $dir"
    return 1
  fi
}

ERRORS=0

# Check required files
echo "Checking required files..."
echo ""

check_file "$CLAUDE_CLI_PATH" "Claude CLI binary" || ERRORS=$((ERRORS+1))
check_file "${HOME}/.claude/.credentials.json" "Claude credentials" || ERRORS=$((ERRORS+1))
check_file "${HOME}/.claude/config.json" "Claude config" || ERRORS=$((ERRORS+1))
check_file "${HOME}/.claude/history.jsonl" "Claude history" || ERRORS=$((ERRORS+1))

echo ""
echo "Checking required directories..."
echo ""

check_dir "${HOME}/.claude/plans" "Plans directory" || ERRORS=$((ERRORS+1))
check_dir "${HOME}/.claude/projects" "Projects directory" || ERRORS=$((ERRORS+1))
check_dir "${HOME}/.local/share/claude" "Claude plugins directory" || ERRORS=$((ERRORS+1))

echo ""
echo "Checking binary permissions..."
echo ""

if [ -x "$CLAUDE_CLI_PATH" ]; then
  echo -e "${GREEN}✅${NC} Binary is executable"
else
  echo -e "${RED}❌${NC} Binary is not executable"
  echo "   Fix: chmod +x $CLAUDE_CLI_PATH"
  ERRORS=$((ERRORS+1))
fi

echo ""
echo "Checking credentials permissions..."
echo ""

CRED_PERMS=$(stat -c "%a" "${HOME}/.claude/.credentials.json" 2>/dev/null || echo "000")
if [ "$CRED_PERMS" = "600" ] || [ "$CRED_PERMS" = "400" ]; then
  echo -e "${GREEN}✅${NC} Credentials have secure permissions ($CRED_PERMS)"
else
  echo -e "${YELLOW}⚠️${NC}  Credentials have loose permissions ($CRED_PERMS)"
  echo "   Recommended: chmod 600 ${HOME}/.claude/.credentials.json"
fi

echo ""
echo "==================================="

if [ $ERRORS -eq 0 ]; then
  echo -e "${GREEN}✅ All validation checks passed!${NC}"
  echo ""
  echo "You can now start the Docker container:"
  echo "  export USER_ID=\$(id -u)"
  echo "  export GROUP_ID=\$(id -g)"
  echo "  docker compose up -d"
  exit 0
else
  echo -e "${RED}❌ Found $ERRORS error(s)${NC}"
  echo ""
  echo "Please fix the errors before starting Docker."
  exit 1
fi
