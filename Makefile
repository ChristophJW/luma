.DEFAULT_GOAL := help
SHELL := /bin/bash

# Load .env so DATABASE_URL etc. are available to recipes.
ifneq (,$(wildcard .env))
include .env
export
endif

.PHONY: help setup dev up down reset logs api guest host host-web worker \
        migrate makemigrations seed shell superuser test lint format check ps urls \
        reset-db mail-test host-clear android android-release devices

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

reset-db: ## Drop and recreate the database, then migrate and seed
	@docker compose up -d >/dev/null
	@until docker compose exec -T postgres pg_isready -U $${POSTGRES_USER:-luma} >/dev/null 2>&1; do sleep 1; done
	docker compose exec -T postgres psql -U $${POSTGRES_USER:-luma} -d postgres \
		-c "DROP DATABASE IF EXISTS $${POSTGRES_DB:-luma} WITH (FORCE);" \
		-c "CREATE DATABASE $${POSTGRES_DB:-luma} OWNER $${POSTGRES_USER:-luma};"
	@$(MAKE) migrate
	@$(MAKE) seed

reset: ## Destroy ALL local data (db, storage, mail) and start clean
	# Named volumes, so -v removes everything and nothing root-owned is left
	# lying around inside the repo.
	docker compose down -v
	@$(MAKE) up
	@until docker compose exec -T postgres pg_isready -U $${POSTGRES_USER:-luma} >/dev/null 2>&1; do sleep 1; done
	@$(MAKE) migrate
	@$(MAKE) seed

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

android: ## Build and install a dev build on a USB-connected Android device
	# Expo Go cannot load a project once it needs native modules it does not
	# bundle. A development build is your own binary with exactly this
	# project's native code, and it still connects to Metro for fast reload —
	# so the workflow is unchanged, only the container differs.
	#
	# React Native 0.81 expects JDK 17; the machine default is 21, which
	# Gradle rejects, so the version is pinned here rather than globally.
	@if adb devices | grep -q unauthorized; then \
		echo "Device attached but UNAUTHORIZED."; \
		echo "Unlock the phone and tap 'Allow' on the 'Allow USB debugging?' prompt."; \
		echo "If no prompt appears: Developer options -> Revoke USB debugging authorisations, then replug."; \
		exit 1; \
	fi
	@adb devices | grep -qw device || (echo "No device. Plug it in, enable USB debugging, and accept the RSA prompt." && exit 1)
	# Gradle's build cache derives entries from node_modules, which npm
	# rewrites underneath it — that makes packing an entry fail mid-build
	# even though compilation succeeded. gradle.properties is regenerated
	# by prebuild, so the setting is reapplied here rather than once.
	@test -f host/android/gradle.properties && \
		(grep -q 'org.gradle.caching=false' host/android/gradle.properties || \
		 echo 'org.gradle.caching=false' >> host/android/gradle.properties) || true
	# No --device flag: with one phone attached Expo picks it. Passing the
	# flag bare opens an interactive picker, and passing the adb serial is
	# rejected — Expo matches on device name, not serial.
	cd host && JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 npx expo run:android

android-release: ## Build a release APK on a USB-connected device
	cd host && JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 npx expo run:android --variant release

devices: ## List attached Android devices
	@adb devices -l

host-clear: ## Run the Expo host app, wiping every Metro cache first
	# `expo start --clear` alone leaves the transform cache under .expo and
	# node_modules/.cache, which is why a freshly installed package can still
	# resolve as "file does not exist" after a supposedly clean restart.
	@pkill -f "expo start" 2>/dev/null || true
	rm -rf host/.expo node_modules/.cache host/node_modules/.cache
	@find /tmp -maxdepth 1 -name 'metro-*' -exec rm -rf {} + 2>/dev/null || true
	cd host && npx expo start --clear

host-web: ## Run the Expo host app directly in the browser
	npm run web --workspace host

migrate: ## Apply database migrations
	cd api && uv run python manage.py migrate

mail-test: ## Send a test email through the configured backend (EMAIL=you@domain.de)
	@test -n "$(EMAIL)" || (echo "usage: make mail-test EMAIL=you@domain.de" && exit 1)
	@cd api && uv run --extra azure python manage.py send_test_email --to $(EMAIL)

seed: ## Create the test account and sample events (DEBUG only)
	@cd api && uv run python manage.py seed_dev

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
