# ShortlyX backend developer tasks.
# On Windows use Git Bash / WSL, or run the underlying commands directly.

PYTHON ?= python
VENV ?= .venv
ifeq ($(OS),Windows_NT)
BIN := $(VENV)/Scripts
else
BIN := $(VENV)/bin
endif

.PHONY: help install dev run migrate revision test lint fmt typecheck up down logs promote-admin

help:
	@echo "install   - create venv and install runtime + dev deps"
	@echo "run       - run the API with uvicorn (reload)"
	@echo "migrate   - apply DB migrations (alembic upgrade head)"
	@echo "revision  - autogenerate a migration: make revision m=\"message\""
	@echo "test      - run the test suite"
	@echo "lint      - ruff check"
	@echo "fmt       - ruff format + autofix"
	@echo "typecheck - mypy"
	@echo "up/down   - docker compose up/down"
	@echo "promote-admin - grant superuser: make promote-admin EMAIL=you@example.com"

install:
	$(PYTHON) -m venv $(VENV)
	$(BIN)/python -m pip install --upgrade pip
	$(BIN)/python -m pip install -e ".[dev]"

run:
	$(BIN)/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

migrate:
	$(BIN)/alembic upgrade head

revision:
	$(BIN)/alembic revision --autogenerate -m "$(m)"

test:
	$(BIN)/pytest

lint:
	$(BIN)/ruff check .

fmt:
	$(BIN)/ruff format .
	$(BIN)/ruff check . --fix

typecheck:
	$(BIN)/mypy app

promote-admin:
	$(BIN)/python -m app.cli promote-admin $(EMAIL)

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f api
