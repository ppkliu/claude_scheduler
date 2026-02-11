.PHONY: help dev dev-build dev-logs dev-shell dev-stop dev-clean prod prod-build prod-logs prod-health prod-backup prod-stop

# Default target
.DEFAULT_GOAL := help

# Variables
DOCKER_COMPOSE_DEV := docker compose
DOCKER_COMPOSE_PROD := docker compose -f docker-compose.prod.yml
SCRIPT_DEV := ./scripts/dev.sh
SCRIPT_PROD := ./scripts/prod.sh

# Colors
BLUE := \033[0;34m
GREEN := \033[0;32m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "$(BLUE)LLM Scheduler - Docker Commands$(NC)"
	@echo "======================================"
	@echo ""
	@echo "$(GREEN)Development Commands:$(NC)"
	@echo "  make dev              - Start development environment"
	@echo "  make dev-build        - Rebuild and start development environment"
	@echo "  make dev-logs         - Follow development logs"
	@echo "  make dev-shell        - Open shell in development container"
	@echo "  make dev-stop         - Stop development environment"
	@echo "  make dev-clean        - Clean up development containers and volumes"
	@echo ""
	@echo "$(GREEN)Production Commands:$(NC)"
	@echo "  make prod             - Deploy production environment"
	@echo "  make prod-build       - Rebuild and deploy production environment"
	@echo "  make prod-logs        - Follow production logs"
	@echo "  make prod-health      - Check production service health"
	@echo "  make prod-backup      - Backup production database"
	@echo "  make prod-stop        - Stop production environment"
	@echo "  make prod-clean       - Clean production containers (keep data)"
	@echo ""
	@echo "$(GREEN)Utility Commands:$(NC)"
	@echo "  make install          - Install dependencies"
	@echo "  make build            - Build production bundle"
	@echo "  make lint             - Run linter"
	@echo "  make format           - Format code"
	@echo "  make help             - Show this help message"
	@echo ""

# ====================================
# Development Commands
# ====================================

dev: ## Start development environment
	@$(SCRIPT_DEV) start

dev-build: ## Rebuild and start development environment
	@$(SCRIPT_DEV) start --rebuild

dev-logs: ## Follow development logs
	@$(SCRIPT_DEV) logs

dev-shell: ## Open shell in development container
	@$(SCRIPT_DEV) shell

dev-status: ## Show development status
	@$(SCRIPT_DEV) status

dev-stop: ## Stop development environment
	@$(SCRIPT_DEV) stop

dev-restart: ## Restart development environment
	@$(SCRIPT_DEV) restart

dev-clean: ## Clean development containers and volumes
	@$(SCRIPT_DEV) clean

# ====================================
# Production Commands
# ====================================

prod: ## Deploy production environment
	@$(SCRIPT_PROD) deploy

prod-build: ## Rebuild and deploy production environment
	@$(SCRIPT_PROD) deploy --rebuild

prod-logs: ## Follow production logs
	@$(SCRIPT_PROD) logs

prod-health: ## Check production service health
	@$(SCRIPT_PROD) health

prod-backup: ## Backup production database
	@$(SCRIPT_PROD) backup

prod-status: ## Show production status
	@$(SCRIPT_PROD) status

prod-stop: ## Stop production environment
	@$(SCRIPT_PROD) stop

prod-restart: ## Restart production environment
	@$(SCRIPT_PROD) restart

prod-update: ## Update and redeploy production
	@$(SCRIPT_PROD) update

prod-clean: ## Clean production containers (keep data)
	@$(SCRIPT_PROD) clean

prod-clean-all: ## Clean production containers and all data (careful!)
	@$(SCRIPT_PROD) clean-all

# ====================================
# Utility Commands
# ====================================

install: ## Install dependencies
	npm install

build: ## Build production bundle
	npm run build

lint: ## Run linter
	npm run lint

format: ## Format code
	npm run format

type-check: ## Check TypeScript types
	npx tsc --noEmit

# ====================================
# Docker System Commands
# ====================================

docker-ps: ## Show running Docker containers
	docker ps

docker-images: ## Show Docker images
	docker images

docker-clean: ## Remove dangling Docker images
	docker image prune -f

docker-system-clean: ## Clean up Docker system
	docker system prune -f

# ====================================
# Combined Commands
# ====================================

setup-dev: install dev ## Install dependencies and start dev environment

setup-prod: install prod ## Install dependencies and deploy production

all: build prod ## Build and deploy production

# ====================================
# Documentation
# ====================================

docs: ## Open Docker documentation
	@echo "Opening Docker documentation..."
	@cat DOCKER.md

# ====================================
# Health Check
# ====================================

health: ## Check both dev and prod health
	@echo "Development environment:" && $(SCRIPT_DEV) status || true
	@echo "Production environment:" && $(SCRIPT_PROD) status || true
