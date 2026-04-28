# AGENTS.md

## Overview

- **Language:** Python
- **Project type:** library
- **Framework:** FastAPI
- **Primary dependencies:** starlette, pydantic, typing-extensions, uvicorn, httpx, jinja2, python-multipart, pydantic-settings, anyio, sqlmodel

This file is for autonomous coding agents. Prefer the conventions and paths below over generic stack advice.

## Setup

Use the commands below when they are present; they are derived from project manifests in the repo snapshot.

## Commands

### Test (full suite)

```bash
pytest
```

### Test (single path)

```bash
pytest <path>
```

- Install and run workflows using the lockfile and scripts at the repository root (see `package.json`, `pyproject.toml`, `Cargo.toml`, or `Makefile`).

## Conventions

### Naming

- **Files:** Snake_case .py files; docs examples follow pattern `tutorial{NNN}[_an][_py310|_py39].py`; app modules named `main.py` inside feature subdirectories under `docs_src/`
- **Components:** Pydantic models use PascalCase (e.g. `Item`, `Settings`); FastAPI routers named after resource (e.g. `items`, `users`, `admin`)
- **Functions:** Snake_case async def for route handlers (e.g. `read_main`, `create_item`, `get_settings`); dependency providers prefixed with `get_` (e.g. `get_query_token`, `get_token_header`, `get_settings`)
- **Variables:** Snake_case for all locals and module-level vars (e.g. `fake_secret_token`, `fake_db`, `item_id`); settings instances named `settings`

### Structure and behavior

Source lives in `fastapi/` (library core), `docs_src/` (runnable documentation examples grouped by feature, e.g. `docs_src/app_testing/`, `docs_src/bigger_applications/`, `docs_src/settings/`), and `tests/`. Each docs_src feature directory contains variant files per Python version and annotation style (`_an`, `_py310`, `_py39`). Routers, dependencies, and internal modules are sub-packages within a feature directory (e.g. `routers/`, `internal/`, `dependencies.py`).

**Error handling:** Route handlers raise `fastapi.HTTPException` with explicit `status_code` and `detail` string for all error conditions; no bare `except` blocks — errors propagate to FastAPI's exception handlers.

**State:** Application settings are managed via `pydantic-settings` `BaseSettings` subclasses loaded once with `@lru_cache` and injected via `Depends(get_settings)`; no global mutable state in handlers.

### Shared building blocks

- **Pydantic BaseModel for request/response schemas** (`docs_src/app_testing/app_b_an_py310/main.py`): Declare typed request bodies and response shapes; used as `response_model=` on route decorators and as return type annotations
- **Dependency injection via Depends()** (`docs_src/bigger_applications/app_an_py310/main.py`): Inject shared logic (auth token validation, settings, DB sessions) into route handlers without coupling handler code to retrieval logic
- **lru_cache-wrapped settings factory** (`docs_src/settings/app02_an_py310/main.py`): Construct a `pydantic-settings` Settings instance once per process and expose it as a FastAPI dependency via `Depends(get_settings)`
- **APIRouter with prefix/tags/dependencies** (`docs_src/bigger_applications/app_an_py310/main.py`): Split large apps into resource-scoped routers (items, users, admin) included into the root `FastAPI` app with `app.include_router()`
- **Annotated[] for typed dependency/header declarations** (`docs_src/app_testing/app_b_an_py310/main.py`): Use `typing.Annotated` to attach FastAPI metadata (Header, Depends, Query, etc.) to parameters instead of default-value style, keeping signatures explicit
- **config.py Settings module per app package** (`docs_src/settings/app01_py310/main.py`): Isolate environment-driven configuration in a `config.py` sibling to `main.py`, imported as `from .config import settings` or `from .config import Settings`
- **Versioned docs_src tutorial variants** (`docs_src/app_testing/app_b_an_py310/main.py`): Each documentation example is duplicated per supported Python version and annotation style (`_an`, `_py310`, `_py39`) so all variants are independently testable and linted

**Things agents must not do:**

- Don't use default-value style (`x_token: str = Header()`) in new `_an_` variant files — those must use `Annotated[str, Header()]` instead
- Don't add new docs_src examples without creating all required Python-version variants (`_py310`, `_py39`, `_an_py310`, `_an_py39`) — missing variants break coverage and ruff checks
- Don't import from `docs_src` in tests directly — `pyproject.toml` configures pytest with `--ignore=docs_src`; docs_src modules are tested via their own dedicated test files in `tests/`
- Don't use `pydantic.v1` or v1-style validators — the project targets `pydantic>=2.9.0` and omits pydantic-v1 migration files from coverage
- Don't perform function calls in argument defaults (ruff B008 is enforced) — use `Depends()` or `Annotated` instead of calling factories inline in signatures
- Don't use `model.dict()` — use `model.model_dump()` as seen in `create_item` handlers; `dict()` is the pydantic v1 API
- Don't write tests that take longer than 20 seconds — `pytest-timeout` is configured with `timeout = 20` in `pyproject.toml`

## Testing

- **Runner / stack:** pytest

Tests run with `pytest >=9.0.0` (configured in `pyproject.toml` under `[tool.pytest]`) with `--strict-config --strict-markers --ignore=docs_src`; HTTP assertions use `httpx`-backed `starlette.testclient.TestClient` (sync) or `httpx.AsyncClient` with `anyio[trio]` for async tests; coverage collected via `pytest-cov` with `coverage[toml]`, parallel runs supported via `pytest-xdist`.

Run the full test suite before proposing a merge; fix failures you introduce.

## Pull Request Guidelines

- Keep changes scoped; follow the file layout and naming rules above.
- Reuse abstractions listed under **Shared building blocks** instead of duplicating logic.
- Address every **Things agents must not do** item—do not introduce new violations.
- For the common workflow **Adding a new documented API feature with tests**, follow:

1. Create a new feature directory under `docs_src/<feature_name>/`.
2. Implement the minimal FastAPI app in `main.py` (or `app.py`) using `pydantic.BaseModel` for schemas, `Annotated[]` + `Depends()` for dependencies, and `HTTPException` for errors.
3. Duplicate the file for each required variant: `tutorial001_py310.py`, `tutorial001_an_py310.py`, `tutorial001_py39.py`, `tutorial001_an_py39.py`.
4. Add a corresponding test file in `tests/test_tutorial/<feature_name>/test_tutorial001.py` that imports the app and uses `starlette.testclient.TestClient` (or `httpx.AsyncClient` with `anyio` for async) to assert status codes and response JSON.
5. Run `ruff check docs_src/<feature_name>/ tests/` and fix any E/W/F/I/B/C4/UP violations.
6. Run `mypy fastapi/` with `--strict` to verify type correctness in library code.
7. Run `pytest tests/ --timeout=20 -x` and confirm all assertions pass and coverage source includes the new files.
