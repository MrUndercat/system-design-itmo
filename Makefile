COMPOSE_DIR  := backend/microservices
COMPOSE_FILE := $(COMPOSE_DIR)/docker-compose.yml
COMPOSE      := docker compose -f $(COMPOSE_FILE) --env-file $(COMPOSE_DIR)/.env
FRONTEND_DIR := frontend
# Порт для `make frontend` (статика); GraphQL клиент ходит на Gateway (по умолчанию порт 3000 см. GATEWAY_PORT в .env).
FRONTEND_PORT ?= 8080
GATEWAY_UI_PORT := $(shell test -f $(COMPOSE_DIR)/.env && sed -n 's/^GATEWAY_PORT=//p' $(COMPOSE_DIR)/.env | tr -d '\r')
ifeq ($(strip $(GATEWAY_UI_PORT)),)
GATEWAY_UI_PORT := 3000
endif
FRONTEND_UI_PORT := $(shell test -f $(COMPOSE_DIR)/.env && sed -n 's/^FRONTEND_PORT=//p' $(COMPOSE_DIR)/.env | tr -d '\r')
ifeq ($(strip $(FRONTEND_UI_PORT)),)
FRONTEND_UI_PORT := 8080
endif

.DEFAULT_GOAL := dev

.PHONY: dev up down clean restart logs help frontend _ensure_env

_ensure_env:
	@test -f $(COMPOSE_DIR)/.env || cp $(COMPOSE_DIR)/.env.example $(COMPOSE_DIR)/.env

dev: up
	@echo ""
	@echo "Gateway (GraphQL):  http://localhost:$(GATEWAY_UI_PORT)/graphql"
	@echo "Фронт (Docker):      http://localhost:$(FRONTEND_UI_PORT)/  — Node «serve», без nginx"
	@echo "Фронт (локально):   make frontend → http://localhost:$(FRONTEND_PORT)"
	@echo "MinIO консоль:      http://localhost:9001"
	@echo "В CORS gateway добавьте origin UI (:$(FRONTEND_UI_PORT)), если измените FRONTEND_PORT."
	@echo ""

help:
	@echo "Команды:"
	@echo "  make / make dev  — make up (docker compose)"
	@echo "  make up          — БД, MinIO, микросервисы, gateway и фронт (образ frontend: serve, без nginx); $(COMPOSE_DIR)/.env"
	@echo "  make frontend    — только статика локально через npx serve :$(FRONTEND_PORT)"
	@echo "  make down        — остановить контейнеры"
	@echo "  make clean       — down и удалить volumes"
	@echo "  make logs        — логи (follow)"

frontend:
	cd $(FRONTEND_DIR) && npx --yes serve -l $(FRONTEND_PORT)

up: _ensure_env
	$(COMPOSE) up -d --build --remove-orphans

down: _ensure_env
	$(COMPOSE) down

clean: _ensure_env
	$(COMPOSE) down -v

restart: down up

logs: _ensure_env
	$(COMPOSE) logs -f
