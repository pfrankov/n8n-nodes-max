# Repository Guidelines

## Maintenance & Documentation
- At the start of any non-trivial task, quickly re-check `AGENTS.md` and `README.md` for current conventions and expected behavior.
- Keep `AGENTS.md` and `README.md` in lockstep with behavior changes. If API semantics, limits, or UI fields change, update both.
- Treat `https://dev.max.ru/docs-api` as the source of truth for request/response contracts.
- `openapi_schema.yaml` is a deprecated local reference and may lag behind current API behavior.
- Before merging API-facing changes, verify alignment in three places: implementation, tests, and user-facing descriptions in node parameters.
- Prefer explicit, user-readable error messages. This project is used by non-native English speakers, so avoid vague wording.

## Tool Purpose & Problem Domain

**n8n-nodes-max** is a community node package for integrating n8n workflows with Max Bot API.

### Primary Goals
- Provide stable message operations (`send`, `edit`, `delete`, `answer callback`) for Max bots.
- Provide chat operations (`get chat info`, `leave chat`) in n8n workflows.
- Provide trigger-based event processing via webhook subscriptions.
- Keep node UX and backend behavior aligned with official Max API docs.

### Integration Surface
| Component | Role |
| :--- | :--- |
| `Max` node | Outbound actions for messages/chats |
| `Max Trigger` node | Webhook subscription lifecycle + incoming event processing |
| `MaxApi` credentials | Access token + base URL configuration + credential test |

### Key Design Decisions
- Default API base URL is `https://platform-api.max.ru`.
- Authentication is sent via `Authorization` header.
- Message and webhook operations use direct HTTP requests for strict API-shape control.
- Webhook processing is fail-soft: invalid events or filter issues should not crash trigger execution.
- Webhook subscription URLs are normalized to ASCII/Punycode hostnames before registration to avoid TLS issues on IDN domains.
- Upload flow is two-step (`POST /uploads` then multipart upload to returned URL), with support for both `token` and `url` payload responses.
- Keyboard validation enforces documented limits (rows/buttons/text/payload/url and limited-type per-row constraints).

## Project Structure & Module Organization
- `credentials/MaxApi.credentials.ts`: credential definition, docs URL, base URL default, `/me` credential test.
- `credentials/tests/`: credential contract tests.
- `nodes/Max/Max.node.ts`: main action node parameter schema + execute routing.
- `nodes/Max/GenericFunctions.ts`: API calls, validation, attachment handling, keyboard formatting, error categorization.
- `nodes/Max/MaxTrigger.node.ts`: trigger node entry point.
- `nodes/Max/MaxWebhookManager.ts`: subscription lifecycle (`GET/POST/DELETE /subscriptions`).
- `nodes/Max/MaxEventProcessor.ts`: incoming webhook normalization/filtering and output shaping.
- `nodes/Max/MaxTriggerConfig.ts`: trigger events and additional trigger fields.
- `nodes/Max/tests/`: behavior and regression tests for node, trigger, webhook manager, error handling, and utility functions.
- `openapi_schema.yaml`: deprecated local schema snapshot (use official docs for final decisions).

## Build, Test, and Development Commands
- `npm install`: install dependencies.
- `npm run build`: compile TypeScript to `dist/` and build icons.
- `npm run dev`: TypeScript watch mode.
- `npm run lint`: lint nodes, credentials, and `package.json`.
- `npm run lintfix`: lint with auto-fixes.
- `npm test`: run Jest test suite.
- `npm run test:coverage`: run Jest with coverage output.
- `npm run debug:setup`: local linking/setup for manual n8n validation.
- `npm run debug:start`: run local n8n instance.

## Coding Style & Naming Conventions
- TypeScript is strict (`strict: true`, `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`).
- Prefer the simplest solution that is readable and maintainable. Do not add abstraction layers without clear payoff.
- Variable and function names must be predictable, consistent, and self-explanatory.
- Use `NodeOperationError` for input/validation failures and `NodeApiError` for upstream/API failures.
- Keep functions focused and side-effect boundaries obvious in `GenericFunctions.ts`.
- Extract helpers only when logic is reused or when it captures a non-trivial concept that improves readability.
- Prefer options objects instead of long positional argument lists when it improves clarity.
- Follow Prettier config: tabs, single quotes, trailing commas, `printWidth: 100`.
- Respect `eslint-plugin-n8n-nodes-base` rules, especially node parameter conventions:
  - option arrays sorted where required,
  - precise `displayName`/`description` style,
  - correct defaults for field types.
- Keep parameter names/API fields aligned with Max API schema (`message_id`, `callback_id`, `update_types`, etc.).

## Testing Guidelines
- Framework: Jest with `ts-jest`.
- Test roots: `nodes/` and `credentials/`.
- Keep tests focused on observable behavior and regressions:
  - request method/path/query/header/body shape,
  - validation rules and limits,
  - trigger filtering behavior,
  - error categorization and user-facing messages.
- Tests should be sufficient, not excessive: cover changed behavior and meaningful edge cases, avoid redundant checks of implementation details.
- Coverage thresholds are enforced globally (see `jest.config.js`); do not lower thresholds to pass changes.
- For API-facing changes, add or update regression tests in:
  - `nodes/Max/tests/GenericFunctions.test.ts`
  - `nodes/Max/tests/Max.node.test.ts`
  - `nodes/Max/tests/MaxWebhookManager.test.ts`
  - `credentials/tests/MaxApi.credentials.test.ts`

## Commit & Pull Request Guidelines
- Use short, imperative commit messages (for example: `fix: align uploads with multipart contract`).
- In PRs, clearly list:
  - which Max API behaviors changed,
  - which official docs pages were used to validate the change,
  - which node parameters changed in UI,
  - which tests were added/updated.
- Always run `npm test`, `npm run build`, and `npm run lint` before requesting review.
- Avoid committing generated artifacts unless release workflow explicitly requires them.

## Configuration Notes

### Credentials
- `accessToken`: issued by `@PrimeBot`.
- `baseUrl`: defaults to `https://platform-api.max.ru`, override only for controlled environments.
- Keep credential test behavior aligned with official docs and current API auth expectations.

## API Alignment Protocol (Docs-First)
- Do not treat API contracts in this file as authoritative snapshots.
- Before implementing or changing API behavior, verify details in `https://dev.max.ru/docs-api`.
- If docs and existing code differ, update code and tests to match docs, then update `README.md`/`AGENTS.md` with high-level behavior notes only.
- Use `openapi_schema.yaml` only as a deprecated local hint for navigation, not as the final source of truth.
- Keep request-building logic, node parameter descriptions, and tests consistent with each other.

## Maintainability Checklist
- Prefer straightforward control flow over clever abstractions.
- Keep naming predictable across node parameters, helper functions, and tests.
- Avoid broad refactors in feature fixes unless they materially improve readability or reduce risk.
- Add tests for changed behavior and critical edge cases; avoid bloating suite size with redundant assertions.
