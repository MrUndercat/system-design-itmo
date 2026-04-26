COMPOSE_DIR  := backend/microservices
COMPOSE_FILE := $(COMPOSE_DIR)/docker-compose.yml
COMPOSE      := docker compose -f $(COMPOSE_FILE) --env-file $(COMPOSE_DIR)/.env
FRONTEND_DIR := frontend
FRONTEND_PORT ?= 8080

.DEFAULT_GOAL := dev

.PHONY: dev up down clean restart logs help frontend _ensure_env

_ensure_env:
	@test -f $(COMPOSE_DIR)/.env || cp $(COMPOSE_DIR)/.env.example $(COMPOSE_DIR)/.env

dev: up
	@echo ""
	@echo "UI:      http://localhost:$(FRONTEND_PORT)  (nginx: статика + /graphql -> gateway)"
	@echo "Gateway: http://localhost:3000/graphql"
	@echo "MinIO:   http://localhost:9001"
	@echo ""

help:
	@echo "Команды:"
	@echo "  make / make dev  — make up (то же, что и docker compose up)"
	@echo "  make up          — БД, MinIO, микросервисы, фронт в nginx; настройки: $(COMPOSE_DIR)/.env"
	@echo "  make frontend    — только npx serve :$(FRONTEND_PORT) (без прокси /graphql, нужен CORS/порт 3000 в api.js)"
	@echo "  make down        — остановить контейнеры"
	@echo "  make clean       — down и удалить volumes"
	@echo "  make logs        — логи (follow)"

frontend:
	cd $(FRONTEND_DIR) && npx --yes serve -l $(FRONTEND_PORT)

up: _ensure_env
	$(COMPOSE) up -d --build

down: _ensure_env
	$(COMPOSE) down

clean: _ensure_env
	$(COMPOSE) down -v

restart: down up

logs: _ensure_env
	$(COMPOSE) logs -f
