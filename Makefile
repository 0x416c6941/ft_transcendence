# .env.
ENV_FILE := ./.env
include $(ENV_FILE)
export

# Docker Compose command.
DC_CMD := docker compose -f ./docker-compose.yaml --env-file $(ENV_FILE)

.PHONY: all
all: up

${SECRETS_DIR}:
	# XXX: You still need to manully provide credentials for 42 OAuth.
	# Backend server won't start without them.
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

# Cleans everything related to Docker, produced by this project.
# "${SECRETS_DIR}" is left intact.
.PHONY: clean
clean: down
	@./docker_clean.sh
