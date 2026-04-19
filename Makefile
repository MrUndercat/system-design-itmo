# Запуск всего стека из корня репозитория.
# Compose-файл лежит в backend/microservices; пути build: ./user-manager и т.д. резолвятся относительно этой папки.

COMPOSE_FILE := backend/microservices/docker-compose.yml
COMPOSE      := docker compose -f $(COMPOSE_FILE)
FRONTEND_DIR := frontend
FRONTEND_PORT ?= 8080

.DEFAULT_GOAL := dev

.PHONY: dev up down clean restart logs help

help:
	@echo "Команды:"
	@echo "  make / make dev  — поднять Docker (микросервисы + БД + MinIO + gateway) и фронт на http://localhost:$(FRONTEND_PORT)"
	@echo "  make up          — только Docker (detached)"
	@echo "  make down        — остановить контейнеры"
	@echo "  make clean       — down и удалить volumes"
	@echo "  make logs        — логи всех сервисов (follow)"
	@echo "  GraphQL gateway: http://localhost:3000/graphql"

# Вся инфра в фоне + статический фронт (процесс на переднем плане; Ctrl+C останавливает только http.server).
dev: up
	@echo ""
	@echo "Фронт:    http://localhost:$(FRONTEND_PORT)"
	@echo "Gateway:  http://localhost:3000/graphql"
	@echo "MinIO:    http://localhost:9001"
	@echo ""
	cd $(FRONTEND_DIR) && python3 -m http.server $(FRONTEND_PORT)

up:
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

clean:
	$(COMPOSE) down -v

restart: down up

logs:
	$(COMPOSE) logs -f
