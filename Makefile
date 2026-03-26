.DEFAULT_GOAL := start

-include .env

export

IMAGE_NAME ?= lobe-to-cc
IMAGE_TAG ?= local
CONTAINER_NAME ?= lobe-to-cc
ACCOUNT_FILE ?= data/account-pool.toml
DOCKER_PUBLISH_HOST ?= 127.0.0.1
DOCKER_PUBLISH_PORT ?= $(PORT)
LOBE_GATEWAY_HOST ?= 0.0.0.0
LOBE_GATEWAY_PORT ?= $(PORT)

PORT := $(shell awk -F'= ' '/^port = / {gsub(/ /,"",$$2); print $$2; exit}' $(ACCOUNT_FILE) 2>/dev/null)
AUTH_TOKEN := $(shell awk -F'"' '/^auth_token = / {print $$2; exit}' $(ACCOUNT_FILE) 2>/dev/null)

.PHONY: start stop restart logs status print-config ensure-config

ensure-config:
	@mkdir -p data
	@if [ ! -f "$(ACCOUNT_FILE)" ]; then \
		cp data/account-pool.example.toml "$(ACCOUNT_FILE)"; \
		echo "Created $(ACCOUNT_FILE) from example. Fill in real session values before production use."; \
	fi

start: ensure-config
	@if [ -z "$(PORT)" ]; then echo "Failed to parse port from $(ACCOUNT_FILE)"; exit 1; fi
	@if [ -z "$(AUTH_TOKEN)" ]; then echo "Failed to parse auth_token from $(ACCOUNT_FILE)"; exit 1; fi
	@docker rm -f $(CONTAINER_NAME) >/dev/null 2>&1 || true
	@DOCKER_BUILDKIT=0 docker build -t $(IMAGE_NAME):$(IMAGE_TAG) .
	@docker run -d \
		--name $(CONTAINER_NAME) \
		-p $(DOCKER_PUBLISH_HOST):$(DOCKER_PUBLISH_PORT):$(LOBE_GATEWAY_PORT) \
		-e LOBE_GATEWAY_HOST=$(LOBE_GATEWAY_HOST) \
		-e LOBE_GATEWAY_PORT=$(LOBE_GATEWAY_PORT) \
		-v $(PWD)/data:/app/data \
		$(IMAGE_NAME):$(IMAGE_TAG) >/dev/null
	@echo ""
	@echo "Container started: $(CONTAINER_NAME)"
	@echo "Image: $(IMAGE_NAME):$(IMAGE_TAG)"
	@echo "Mounted data: $(PWD)/data -> /app/data"
	@echo ""
	@echo "Gateway:"
	@echo "  http://$(DOCKER_PUBLISH_HOST):$(DOCKER_PUBLISH_PORT)"
	@echo ""
	@echo "Claude Code:"
	@echo "  export ANTHROPIC_BASE_URL=http://$(DOCKER_PUBLISH_HOST):$(DOCKER_PUBLISH_PORT)"
	@echo "  export ANTHROPIC_AUTH_TOKEN=$(AUTH_TOKEN)"
	@echo "  claude"
	@echo ""
	@echo "Smoke test:"
	@echo "  curl -H \"Authorization: Bearer $(AUTH_TOKEN)\" http://$(DOCKER_PUBLISH_HOST):$(DOCKER_PUBLISH_PORT)/v1/models"
	@echo "  curl -H \"X-Api-Key: $(AUTH_TOKEN)\" http://$(DOCKER_PUBLISH_HOST):$(DOCKER_PUBLISH_PORT)/debug/accounts"
	@echo ""
	@echo "Logs:"
	@echo "  make logs"

stop:
	@docker rm -f $(CONTAINER_NAME) >/dev/null 2>&1 || true
	@echo "Container stopped: $(CONTAINER_NAME)"

restart: stop start

logs:
	@docker logs -f $(CONTAINER_NAME)

status:
	@docker ps --filter "name=$(CONTAINER_NAME)"

print-config: ensure-config
	@if [ -z "$(PORT)" ]; then echo "Failed to parse port from $(ACCOUNT_FILE)"; exit 1; fi
	@if [ -z "$(AUTH_TOKEN)" ]; then echo "Failed to parse auth_token from $(ACCOUNT_FILE)"; exit 1; fi
	@echo "Gateway:"
	@echo "  http://$(DOCKER_PUBLISH_HOST):$(DOCKER_PUBLISH_PORT)"
	@echo ""
	@echo "Claude Code:"
	@echo "  export ANTHROPIC_BASE_URL=http://$(DOCKER_PUBLISH_HOST):$(DOCKER_PUBLISH_PORT)"
	@echo "  export ANTHROPIC_AUTH_TOKEN=$(AUTH_TOKEN)"
	@echo "  claude"
	@echo ""
	@echo "Debug:"
	@echo "  curl -H \"X-Api-Key: $(AUTH_TOKEN)\" http://$(DOCKER_PUBLISH_HOST):$(DOCKER_PUBLISH_PORT)/debug/accounts"
