# .env.
ENV_FILE := ./.env
include $(ENV_FILE)
export

# Docker Compose command.
DC_CMD := docker compose -f ./docker-compose.yaml --env-file $(ENV_FILE)

.PHONY: all
all: up

${SECRETS_DIR}:
	@./prep_keys.sh

.PHONY: up
up: ${SECRETS_DIR}
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

# Cleans EVERTYTHING related to Docker, including images created in "up" recipe.
.PHONY: clean
clean: down
	@./docker_clean.sh
	@rm -rf ${SECRETS_DIR}
