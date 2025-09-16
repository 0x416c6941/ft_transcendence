# Docker Compose command.
DC_CMD := docker compose -f ./docker-compose.yaml

.PHONY: all
all: up

.PHONY: up
up:
	@$(DC_CMD) up --build -d

.PHONY: build
build:
	@$(DC_CMD) build

.PHONY: stop
stop:
	@$(DC_CMD) stop

.PHONY: kill
kill:
	@$(DC_CMD) kill

.PHONY: down
down:
	@$(DC_CMD) down

# Cleans all Docker images created in "up" recipe.
.PHONY: clean
clean: down
	@./clean.sh
