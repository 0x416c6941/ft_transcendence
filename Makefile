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

# Avalanche Local Network management
.PHONY: avalanche-up
avalanche-up: ${SECRETS_DIR}
	@echo "Starting Avalanche Local Development Network..."
	@$(DC_CMD) up --build -d avalanche-fuji
	@echo "Avalanche network starting (contract will auto-deploy)"
	@echo "Check status with: make avalanche-status"
	@echo "View logs with: make avalanche-logs"

.PHONY: avalanche-stop
avalanche-stop:
	@echo "Stopping Avalanche Fuji node..."
	@$(DC_CMD) stop avalanche-fuji

.PHONY: avalanche-start
avalanche-start:
	@echo "Starting Avalanche Fuji node..."
	@$(DC_CMD) start avalanche-fuji

.PHONY: avalanche-restart
avalanche-restart:
	@echo "Restarting Avalanche Fuji node..."
	@$(DC_CMD) restart avalanche-fuji

.PHONY: avalanche-logs
avalanche-logs:
	@$(DC_CMD) logs -f avalanche-fuji

.PHONY: avalanche-status
avalanche-status:
	@echo "Checking Avalanche Fuji node status..."
	@docker ps -a --filter "name=${SERVICE_NAME_PREFIX}-avalanche-fuji" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
	@echo ""
	@echo "Testing RPC endpoint..."
	@curl -sf --max-time 5 http://localhost:9650/ext/health && echo "✓ Node is healthy" || echo "✗ Node is not ready yet (may still be syncing)"

.PHONY: avalanche-clean
avalanche-clean:
	@echo "Removing Avalanche Fuji node and data..."
	@$(DC_CMD) rm -sf avalanche-fuji
	@docker volume rm -f ${SERVICE_NAME_PREFIX}_avalanche-fuji-data 2>/dev/null || true
	@echo "Avalanche Fuji node removed."

.PHONY: avalanche-shell
avalanche-shell:
	@docker exec -it ${SERVICE_NAME_PREFIX}-avalanche-fuji /bin/bash
