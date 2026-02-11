#!/bin/bash

# LLM Scheduler - Development Environment Startup Script
# This script starts the development environment using Docker Compose

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${PROJECT_DIR}/docker-compose.yml"
CONTAINER_NAME="llm-scheduler-dev"

# Functions
print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    print_success "Docker is installed"
}

check_docker_compose() {
    if ! docker compose version &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    print_success "Docker Compose is installed"
}

build_image() {
    print_header "Building Docker Image"
    docker compose -f "${COMPOSE_FILE}" build --no-cache
    print_success "Docker image built successfully"
}

detect_claude_version() {
    local versions_dir="${HOME}/.local/share/claude/versions"
    if [ -d "$versions_dir" ]; then
        CLAUDE_CLI_VERSION=$(ls -v "$versions_dir" 2>/dev/null | tail -1)
        if [ -n "$CLAUDE_CLI_VERSION" ]; then
            export CLAUDE_CLI_VERSION
            print_success "Detected Claude CLI version: ${CLAUDE_CLI_VERSION}"
        fi
    fi
    export USER_ID=$(id -u)
    export GROUP_ID=$(id -g)
}

start_services() {
    print_header "Starting Development Environment"
    detect_claude_version
    docker compose -f "${COMPOSE_FILE}" up -d
    print_success "Development environment started"
}

show_status() {
    print_header "Service Status"
    docker compose -f "${COMPOSE_FILE}" ps
}

wait_for_services() {
    print_header "Waiting for Services to be Ready"

    local max_attempts=30
    local attempt=0

    echo "Waiting for Vite dev server to be ready..."
    while [ $attempt -lt $max_attempts ]; do
        if docker exec ${CONTAINER_NAME} curl -s http://localhost:5173 > /dev/null 2>&1; then
            print_success "Vite dev server is ready!"
            break
        fi
        attempt=$((attempt + 1))
        echo -n "."
        sleep 1
    done

    if [ $attempt -eq $max_attempts ]; then
        print_warning "Vite dev server took longer than expected to start"
    fi
}

show_info() {
    print_header "Development Environment Info"
    echo -e "${GREEN}Services:${NC}"
    echo "  • Vite Dev Server: ${BLUE}http://localhost:5173${NC}"
    echo "  • API Server: ${BLUE}http://localhost:3000${NC}"
    echo ""
    echo -e "${GREEN}Useful Commands:${NC}"
    echo "  • View logs: docker compose logs -f app-dev"
    echo "  • Stop services: docker compose down"
    echo "  • Restart services: docker compose restart"
    echo "  • Access shell: docker exec -it ${CONTAINER_NAME} sh"
    echo ""
}

# Main execution
main() {
    case "${1:-start}" in
        start)
            print_header "Claude Scheduler - Development Environment"
            check_docker
            check_docker_compose

            if [ "$2" == "--rebuild" ]; then
                build_image
            fi

            start_services
            show_status
            wait_for_services
            show_info

            echo -e "${GREEN}Development environment is ready!${NC}"
            echo "Starting to follow logs (Press Ctrl+C to stop)..."
            docker compose -f "${COMPOSE_FILE}" logs -f app-dev
            ;;

        stop)
            print_header "Stopping Development Environment"
            docker compose -f "${COMPOSE_FILE}" down
            print_success "Development environment stopped"
            ;;

        restart)
            print_header "Restarting Development Environment"
            docker compose -f "${COMPOSE_FILE}" restart
            print_success "Development environment restarted"
            show_status
            ;;

        logs)
            print_header "Following Logs"
            docker compose -f "${COMPOSE_FILE}" logs -f app-dev
            ;;

        shell)
            print_header "Opening Shell in Container"
            docker exec -it ${CONTAINER_NAME} sh
            ;;

        status)
            show_status
            ;;

        rebuild)
            build_image
            start_services
            show_status
            ;;

        clean)
            print_header "Cleaning Up"
            docker compose -f "${COMPOSE_FILE}" down -v
            print_success "Docker containers and volumes cleaned"
            ;;

        *)
            echo "Claude Scheduler - Development Environment Helper"
            echo ""
            echo "Usage: $0 [COMMAND] [OPTIONS]"
            echo ""
            echo "Commands:"
            echo "  start [--rebuild]    Start development environment (with optional rebuild)"
            echo "  stop                 Stop development environment"
            echo "  restart              Restart development environment"
            echo "  logs                 Follow service logs"
            echo "  shell                Open interactive shell in container"
            echo "  status               Show service status"
            echo "  rebuild              Rebuild image and start services"
            echo "  clean                Remove containers and volumes"
            echo ""
            echo "Examples:"
            echo "  $0 start              # Start with existing image"
            echo "  $0 start --rebuild    # Rebuild and start"
            echo "  $0 logs               # Follow logs"
            echo "  $0 shell              # Open shell in container"
            echo ""
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
