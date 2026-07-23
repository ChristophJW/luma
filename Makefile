.DEFAULT_GOAL := help
SHELL := /bin/bash

# Load .env so DATABASE_URL etc. are available to recipes.
ifneq (,$(wildcard .env))
include .env
export
endif

.PHONY: help setup dev up down reset logs api guest host host-web worker \
        migrate makemigrations shell superuser test lint format check ps urls

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*?## "}{printf "  \033[1m%-16s\033[0m %s\n", $$1, $$2}'

setup: ## First-time setup: .env, python deps, node deps, migrations
	@test -f .env || (cp .env.example .env && echo "→ created .env")
	@$(MAKE) up
	@cd api && uv sync
	@npm install
	@echo "→ waiting for postgres…"
	@until docker compose exec -T postgres pg_isready -U $${POSTGRES_USER:-luma} >/dev/null 2>&1; do sleep 1; done
	@$(MAKE) migrate
	@echo ""
	@echo "Setup complete. Run 'make dev' to start everything."

dev: ## Run api + guest + host together (Ctrl-C stops all)
	@./scripts/dev.sh

up: ## Start infrastructure (postgres, redis, minio, mailpit)
	docker compose up -d
	@echo "→ postgres :5442  redis :6390  minio :9010 (console :9011)  mailpit :8035"

down: ## Stop infrastructure
	docker compose down

reset: ## Destroy all local data and start clean
	docker compose down -v
	rm -rf .data
	@$(MAKE) up
	@until docker compose exec -T postgres pg_isready -U $${POSTGRES_USER:-luma} >/dev/null 2>&1; do sleep 1; done
	@$(MAKE) migrate

ps: ## Show infrastructure status
	docker compose ps

logs: ## Tail infrastructure logs
	docker compose logs -f

api: ## Run the Django dev server (0.0.0.0 so a phone on the LAN can reach it)
	cd api && uv run python manage.py runserver 0.0.0.0:8000

worker: ## Run the Celery worker
	cd api && uv run celery -A config worker -l info -Q default

guest: ## Run the guest camera dev server
	npm run dev --workspace guest

host: ## Run the Expo host app (press w for web, i/a for simulators)
	npm run dev --workspace host

host-web: ## Run the Expo host app directly in the browser
	npm run web --workspace host

migrate: ## Apply database migrations
	cd api && uv run python manage.py migrate

makemigrations: ## Generate migrations
	cd api && uv run python manage.py makemigrations

shell: ## Django shell
	cd api && uv run python manage.py shell

superuser: ## Create a Django admin user
	cd api && uv run python manage.py createsuperuser

test: ## Run the test suite
	cd api && uv run pytest

lint: ## Lint python
	cd api && uv run ruff check .

format: ## Format python
	cd api && uv run ruff format .

check: ## Django system checks
	cd api && uv run python manage.py check

urls: ## Print the local URLs
	@echo "API        http://127.0.0.1:8000"
	@echo "API docs   http://127.0.0.1:8000/api/docs"
	@echo "Admin      http://127.0.0.1:8000/admin"
	@echo "Guest      http://127.0.0.1:5173"
	@echo "MinIO      http://127.0.0.1:9011"
	@echo "Mailpit    http://127.0.0.1:8035"
