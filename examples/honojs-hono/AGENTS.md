# AGENTS.md

## Overview

- **Language:** TypeScript
- **Project type:** library
- **Framework:** Hono
- **Primary dependencies:** vitest, esbuild, typescript, zod, msw, @hono/node-server, wrangler, jsdom, undici, @vitest/coverage-v8

This file is for autonomous coding agents. Prefer the conventions and paths below over generic stack advice.

## Setup

Use the commands below when they are present; they are derived from project manifests in the repo snapshot.

## Commands

### Install

```bash
bun install
```

### Build

```bash
bun run build
```

### Test (full suite)

```bash
bun run test
```

### Test (single path)

```bash
bun run test -- <path>
```

### Lint

```bash
bun run lint
```

### Lint (auto-fix)

```bash
bun run lint:fix
```

### Format

```bash
bun run format
```



## Conventions

### Naming

- **Files:** kebab-case .ts files (e.g. basic-auth/index.ts, serve-static.ts, conninfo.ts); each feature directory has an index.ts barrel export
- **Components:** PascalCase for JSX components and classes (e.g. Factory, WSContext, ErrorBoundary, Suspense)
- **Functions:** camelCase for exported functions and hooks (e.g. basicAuth, bearerAuth, getCookie, useFormStatus, createFactory, getRuntimeKey)
- **Variables:** camelCase for locals and module-level constants (e.g. hopByHopHeaders, tokenRegexp, resolvedPromiseValueMap); SCREAMING_SNAKE_CASE for symbol-like constants (e.g. STASH_EFFECT, DOM_RENDERER, GET_MATCH_RESULT)

### Structure and behavior

Source lives under src/ with top-level subdirectories: adapter/ (per-runtime adapters: aws-lambda, bun, cloudflare-workers, deno, vercel, etc.), middleware/ (built-in middleware: basic-auth, bearer-auth, etc.), helper/ (utility helpers: cookie, css, factory, testing, streaming, etc.), router/, jsx/, and client/. Each feature folder exposes a single index.ts barrel that re-exports from implementation files (handler.ts, conninfo.ts, types.ts, etc.). Runtime-specific integration tests live in runtime-tests/ separate from src/.

**Error handling:** Auth and proxy errors are thrown as HTTPException (from src/http-exception) with an explicit status code and a pre-built Response attached; middleware throws HTTPException rather than returning error responses directly, letting Hono's error handler propagate them.

**State:** No global app-level state store; JSX/DOM component state is managed through React-compatible hooks (useState, useReducer, useOptimistic, useActionState) implemented in src/jsx/hooks/index.ts and src/jsx/dom/hooks/index.ts using a DOM_STASH slot on the node object.

### Shared building blocks

- **Adapter index barrel** (`src/adapter/aws-lambda/index.ts`): Each runtime adapter (aws-lambda, bun, cloudflare-workers, deno, vercel, etc.) exposes a single index.ts that re-exports handle, serveStatic, getConnInfo, and adapter-specific types, keeping the public API surface uniform across runtimes.
- **HTTPException** (`src/middleware/basic-auth/index.ts`): Standardised error class used by all middleware to abort request processing; carries an HTTP status code and an optional pre-built Response, caught by Hono's built-in error handler.
- **MiddlewareHandler factory pattern** (`src/middleware/bearer-auth/index.ts`): Middleware is authored as a function that accepts options and returns an async named function (e.g. `async function basicAuth(ctx, next)`) so the function name appears in route inspection and stack traces.
- **Factory / createFactory** (`src/helper/factory/index.ts`): Factory class in src/helper/factory/index.ts provides createApp, createMiddleware, and createHandlers with full generic type propagation, used to share Env types across an application without repeating type parameters.
- **testClient helper** (`src/helper/testing/index.ts`): Wraps hc() with a custom fetch that calls app.request() directly, enabling type-safe in-process HTTP testing without spinning up a server.
- **Module-level @module JSDoc comment** (`src/helper/cookie/index.ts`): Every public index.ts begins with a /** @module \n * <Name> for Hono. */ block comment to document the entry point for generated API docs.
- **defineWebSocketHelper** (`src/helper/websocket/index.ts`): Adapter-agnostic factory that normalises the two calling signatures of upgradeWebSocket (middleware form and direct-call form) so each runtime adapter only needs to supply a single handler function.
- **createCssContext** (`src/helper/css/index.ts`): Context-scoped CSS-in-JS factory that returns css, cx, keyframes, viewTransition, and Style bound to a specific style element ID, enabling multiple isolated CSS contexts in one app.

**Things agents must not do:**

- Don't return error responses directly from middleware — throw HTTPException with a status code and optional pre-built Response instead.
- Don't add runtime-specific code (Deno.env, process.env, Cloudflare c.env) outside the appropriate src/adapter/ or the getRuntimeKey dispatch table in src/helper/adapter/index.ts.
- Don't skip the `tsc --noEmit` check — the `test` script runs it before vitest; submitting code that breaks type-checking will fail CI even if runtime tests pass.
- Don't create a new top-level export without a barrel index.ts with the `@module` JSDoc comment — all public sub-packages follow this pattern.
- Don't bypass the hop-by-hop header removal in proxy helpers — adding raw upstream headers (connection, transfer-encoding, etc.) to forwarded responses breaks the proxy contract.
- Don't use `timingSafeEqual` alternatives for credential comparison in auth middleware — the existing utility in src/utils/buffer must be used to prevent timing attacks.
- Don't write tests that start a real HTTP server when testClient (src/helper/testing/index.ts) can call app.request() in-process instead.

## Testing

- **Runner / stack:** Vitest

Tests run with Vitest via `bun run test` (which first type-checks with `tsc --noEmit` then runs `vitest --run`); per-runtime suites use named Vitest projects (--project node, --project workerd, --project lambda, --project fastly, etc.); the testClient helper from src/helper/testing/index.ts wraps hc() with app.request() so handlers can be exercised without a real HTTP server; coverage is collected with @vitest/coverage-v8 via `bun run coverage`.

Run the full test suite before proposing a merge; fix failures you introduce.

## Pull Request Guidelines

- Keep changes scoped; follow the file layout and naming rules above.
- Reuse abstractions listed under **Shared building blocks** instead of duplicating logic.
- Address every **Things agents must not do** item—do not introduce new violations.
- For the common workflow **Adding a new built-in middleware**, follow:

1. Create src/middleware/<name>/ directory with an index.ts barrel and an implementation file (e.g. handler.ts or the logic inline in index.ts).
2. Start index.ts with the /** @module\n * <Name> Middleware for Hono.\n */ JSDoc block.
3. Import MiddlewareHandler from '../../types' and HTTPException from '../../http-exception'.
4. Export a factory function (camelCase, e.g. myAuth) that accepts a typed options object and returns an async named function (async function myAuth(c, next)) so the name appears in showRoutes output.
5. Throw HTTPException with an explicit status code and a pre-built Response for all error paths; never return error responses directly.
6. Add a Vitest test file (e.g. src/middleware/<name>/index.test.ts) that uses testClient from src/helper/testing/index.ts to exercise the middleware in-process.
7. Run bun run test (tsc --noEmit + vitest --run) to verify types and tests pass.
8. Run bun run lint and bun run format to satisfy ESLint and Prettier checks before opening a PR.
