#!/bin/bash

# LLM Scheduler - Production Environment Deployment Script
# This script manages the production environment using Docker Compose

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${PROJECT_DIR}/docker-compose.prod.yml"
CONTAINER_NAME="llm-scheduler"
ENV_FILE="${PROJECT_DIR}/.env.production"

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
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    print_success "Docker Compose is installed"
}

check_env_file() {
    if [ ! -f "${ENV_FILE}" ]; then
        print_warning "Environment file ${ENV_FILE} not found"
        print_warning "Creating template environment file..."
        cat > "${ENV_FILE}" << 'EOF'
# Production Environment Configuration
NODE_ENV=production
API_PORT=3000
API_HOST=0.0.0.0
LOG_LEVEL=info
DB_PATH=/app/data/scheduler.db

# LLM API Configuration
# LLM_API_KEY=your-api-key-here

# Security
# ALLOWED_ORIGINS=https://yourdomain.com
EOF
        print_warning "Please update ${ENV_FILE} with your configuration"
    fi
}

build_image() {
    print_header "Building Production Docker Image"
    docker-compose -f "${COMPOSE_FILE}" build --no-cache
    print_success "Production Docker image built successfully"
}

create_data_dirs() {
    print_header "Creating Data Directories"
    mkdir -p "${PROJECT_DIR}/data"
    mkdir -p "${PROJECT_DIR}/logs"
    print_success "Data directories created"
}

start_services() {
    print_header "Starting Production Environment"
    if [ -f "${ENV_FILE}" ]; then
        docker-compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d
    else
        docker-compose -f "${COMPOSE_FILE}" up -d
    fi
    print_success "Production environment started"
}

stop_services() {
    print_header "Stopping Production Environment"
    docker-compose -f "${COMPOSE_FILE}" down
    print_success "Production environment stopped"
}

show_status() {
    print_header "Service Status"
    docker-compose -f "${COMPOSE_FILE}" ps
}

show_logs() {
    print_header "Production Logs"
    docker-compose -f "${COMPOSE_FILE}" logs -f app
}

health_check() {
    print_header "Health Check"
    local max_attempts=10
    local attempt=0

    echo "Checking service health..."
    while [ $attempt -lt $max_attempts ]; do
        if docker exec ${CONTAINER_NAME} curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
            print_success "Service is healthy!"
            return 0
        fi
        attempt=$((attempt + 1))
        echo -n "."
        sleep 1
    done

    print_warning "Service health check timed out"
    return 1
}

backup_database() {
    print_header "Backing Up Database"
    local backup_dir="${PROJECT_DIR}/backups"
    local backup_file="${backup_dir}/scheduler.db.$(date +%Y%m%d_%H%M%S).bak"

    mkdir -p "${backup_dir}"

    if [ -f "${PROJECT_DIR}/data/scheduler.db" ]; then
        cp "${PROJECT_DIR}/data/scheduler.db" "${backup_file}"
        print_success "Database backed up to ${backup_file}"
    else
        print_warning "Database file not found"
    fi
}

show_info() {
    print_header "Production Environment Info"
    echo -e "${GREEN}Services:${NC}"
    echo "  • API Server: ${BLUE}http://localhost:3000${NC}"
    echo ""
    echo -e "${GREEN}Data Directories:${NC}"
    echo "  • Database: ${PROJECT_DIR}/data/scheduler.db"
    echo "  • Logs: ${PROJECT_DIR}/logs"
    echo ""
    echo -e "${GREEN}Configuration:${NC}"
    echo "  • Environment: ${ENV_FILE}"
    echo ""
    echo -e "${GREEN}Useful Commands:${NC}"
    echo "  • View logs: docker-compose -f ${COMPOSE_FILE} logs -f"
    echo "  • Stop services: ./prod.sh stop"
    echo "  • Restart services: ./prod.sh restart"
    echo "  • Backup database: ./prod.sh backup"
    echo "  • Health check: ./prod.sh health"
    echo ""
}

# Main execution
main() {
    case "${1:-deploy}" in
        deploy)
            print_header "Claude Scheduler - Production Deployment"
            check_docker
            check_docker_compose
            check_env_file

            if [ "$2" == "--rebuild" ]; then
                build_image
            fi

            create_data_dirs
            backup_database
            start_services
            show_status
            sleep 5
            health_check
            show_info

            echo -e "${GREEN}Production environment is ready!${NC}"
            ;;

        start)
            print_header "Starting Production Environment"
            check_docker
            check_docker_compose
            start_services
            show_status
            ;;

        stop)
            print_header "Stopping Production Environment"
            stop_services
            ;;

        restart)
            print_header "Restarting Production Environment"
            docker-compose -f "${COMPOSE_FILE}" restart
            print_success "Production environment restarted"
            show_status
            ;;

        logs)
            show_logs
            ;;

        status)
            show_status
            ;;

        health)
            health_check
            ;;

        backup)
            backup_database
            ;;

        rebuild)
            build_image
            start_services
            show_status
            ;;

        update)
            print_header "Updating Production Environment"
            build_image
            docker-compose -f "${COMPOSE_FILE}" up -d
            print_success "Production environment updated"
            show_status
            ;;

        shell)
            print_header "Opening Shell in Container"
            docker exec -it ${CONTAINER_NAME} sh
            ;;

        clean)
            print_header "Cleaning Up (Keeping data)"
            docker-compose -f "${COMPOSE_FILE}" down
            print_success "Docker containers stopped and removed"
            ;;

        clean-all)
            print_header "Deep Cleaning (Removing all data)"
            read -p "⚠️  This will delete all data! Are you sure? (y/N) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                docker-compose -f "${COMPOSE_FILE}" down -v
                rm -rf "${PROJECT_DIR}/data"
                print_success "All containers, volumes, and data removed"
            else
                print_warning "Operation cancelled"
            fi
            ;;

        *)
            echo "Claude Scheduler - Production Deployment Helper"
            echo ""
            echo "Usage: $0 [COMMAND] [OPTIONS]"
            echo ""
            echo "Commands:"
            echo "  deploy [--rebuild]   Deploy production environment (with optional rebuild)"
            echo "  start                Start production environment"
            echo "  stop                 Stop production environment"
            echo "  restart              Restart production environment"
            echo "  logs                 Follow service logs"
            echo "  status               Show service status"
            echo "  health               Check service health"
            echo "  backup               Backup database"
            echo "  rebuild              Rebuild image and restart"
            echo "  update               Update and redeploy"
            echo "  shell                Open interactive shell in container"
            echo "  clean                Remove containers (keep data)"
            echo "  clean-all            Remove containers and all data"
            echo ""
            echo "Examples:"
            echo "  $0 deploy            # Deploy with existing image"
            echo "  $0 deploy --rebuild  # Rebuild and deploy"
            echo "  $0 logs              # Follow logs"
            echo "  $0 backup            # Backup database"
            echo ""
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
