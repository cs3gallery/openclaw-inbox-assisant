# OpenClaw Inbox Assistant

Sprint 1 provides the infrastructure foundation for a production-ready inbox organizer and executive assistant service. It includes a TypeScript backend scaffold, Dockerized PostgreSQL/Qdrant/Redis dependencies, SQL migrations, Qdrant collection bootstrap, structured logging, and health checks for the app and worker.

Sprint 2 adds email ingestion and normalization using the existing local OpenClaw Microsoft Graph connector. This service does not implement OAuth, Graph token management, or a standalone Graph SDK client. It integrates with the inspected OpenClaw connector API surface instead.

Sprint 3 adds background email classification and action inference. The worker consumes `classify_email` jobs from `action_queue`, calls an OpenClaw-managed inference provider for structured classification, stores results in `email_classifications`, and optionally enqueues next-step suggestion jobs without executing them.

## Architecture Summary

- `app`: Fastify HTTP service exposing `/livez`, `/readyz`, and `/health`.
- `worker`: Background service scaffold with the same dependency bootstrap path plus a lightweight health server.
- `postgres`: System of record for structured state and operational tables.
- `qdrant`: Vector database for semantic memory and future embedding workflows.
- `redis`: Queue and job infrastructure foundation for future background processing.
- `adminer`: Optional PostgreSQL admin UI for local development.
- `mail ingestion`: App-side module that pulls mailbox messages from the OpenClaw connector, normalizes them, persists them idempotently, records sync checkpoints, and queues `classify_email` actions for downstream processing.
- `classification worker`: Worker-side module that claims pending `classify_email` jobs, fetches the stored email context, performs structured classification, persists the result, and optionally enqueues `suggest_reply`, `extract_task`, `extract_document`, or `detect_emergency`.

The startup path is intentionally explicit:

1. Load and validate environment variables.
2. Retry PostgreSQL, Redis, and Qdrant connectivity with exponential backoff during startup.
3. Run SQL migrations against PostgreSQL using an advisory lock so concurrent app/worker boot only applies each migration once.
4. Ensure required Qdrant collections exist using the configured vector parameters.
5. Start the HTTP app or worker process and expose health endpoints.

## OpenClaw Connector Integration

The requested path `.openclaw/workspace/skills/openclaw-msgraph-connector` did not exist in this repo. The inspected connector was found at:

```text
/Users/josh/dev/OpenClaw-MS-API/apps/openclaw-msgraph-connector
```

The inspected implementation exports an OpenClaw plugin plus a thin HTTP client around the local connector API:

- Plugin entrypoint: `src/index.ts`
- Client wrapper: `src/client/connectorClient.ts`
- Mail tool: `src/tools/definitions.ts`
- Backing API route: `apps/connector-api/src/routes/graph.ts`
- Backing mail implementation: `apps/connector-api/src/services/graphService.ts`

Integration pattern used here:

1. Inspect the plugin/module source to determine its real invocation contract.
2. Reuse the connector’s existing HTTP API shape and shared-secret header contract.
3. Wrap that API behind `MailProvider` so ingestion is isolated from plugin specifics.

This means the inbox service talks to the existing OpenClaw connector service. It does not create a new OAuth or Graph token layer.

## Ingestion Behavior

- Provider implementation: `OpenClawMsGraphProvider`
- Trigger endpoint: `POST /ingestion/mail/run`
- Status endpoints:
  - `GET /ingestion/mail/status`
  - `GET /ingestion/mail/runs`
- Queue action type for downstream work: `classify_email`

Normalized persistence includes:

- sender profile upsert
- `emails` row upsert keyed by `graph_message_id` with `internet_message_id` fallback matching
- queryable normalized recipients in `email_recipients`
- attachment metadata rows in `attachments` when the connector payload already includes attachment metadata
- sync checkpoints in `sync_state`
- run tracking in `ingestion_runs`
- downstream queue entries in `action_queue` and Redis stream publication

## Classification Behavior

- Queue source: durable `action_queue` rows with `action_type = classify_email`
- Claim strategy: PostgreSQL `FOR UPDATE SKIP LOCKED`
- Model interface: provider abstraction with an OpenClaw-backed default adapter that sends an OpenAI-compatible `chat/completions` payload to an OpenClaw-managed inference endpoint
- Idempotency: if the same `email_id` and `CLASSIFICATION_VERSION` already exist in `email_classifications`, the worker marks the queue job completed without reclassifying
- Retry behavior: failed jobs are rescheduled with exponential backoff until `CLASSIFICATION_MAX_ATTEMPTS`, then marked `failed`
- Optional follow-up queue actions:
  - `suggest_reply`
  - `extract_task`
  - `extract_document`
  - `detect_emergency`

Classification fields stored:

- `category`
- `urgency`
- `emergency_score`
- `needs_reply`
- `task_likelihood`
- `finance_doc_type`
- `confidence`
- `explanation_json`
- `model_name`
- `raw_response`

OpenClaw-backed inference integration pattern:

1. The worker builds the classification prompt locally from stored email data.
2. `ClassificationInferenceProvider` abstracts model inference from the rest of the pipeline.
3. `OpenClawInferenceProvider` sends the request to `OPENCLAW_INFERENCE_URL`.
4. The request uses `x-openclaw-shared-secret` authentication and an OpenAI-compatible JSON-schema response contract.
5. OpenClaw owns upstream vendor credentials and routing to OpenAI, Grok, or another compatible model provider.
6. This inbox assistant only receives the structured result and validates it before persistence.

## Connector Capability Findings

From the inspected connector implementation:

- Mail folder listing: not supported
- Message listing: supported through `/graph/:connectionName/mail/search`
- Message detail fetch: not supported
- Attachment metadata listing: not supported as a dedicated API
- Pagination cursors: not supported by the plugin surface
- Delta/cursor sync: not supported by the plugin surface

Because delta/cursor sync is not available, ingestion uses a fallback strategy:

1. Pull the newest `MAIL_INGESTION_PAGE_SIZE` messages from the mailbox.
2. Apply a timestamp window using `sync_state.last_seen_received_at` plus `MAIL_INGESTION_FALLBACK_LOOKBACK_MINUTES`.
3. Upsert messages idempotently.
4. Record updated sync checkpoints.

Known fallback limitation: because the connector currently exposes only a top-N mailbox listing and no pagination cursor, very high message volume between runs can exceed the configured page size and leave gaps. Increase `MAIL_INGESTION_PAGE_SIZE` and run ingestion frequently to reduce that risk.

## Project Structure

```text
.
├── docker-compose.yml
├── Dockerfile
├── migrations/
├── src/
│   ├── app.ts
│   ├── bootstrap/
│   ├── common/
│   ├── config/
│   ├── db/
│   │   ├── postgres/
│   │   ├── qdrant/
│   │   └── redis/
│   ├── modules/
│   │   └── health/
│   ├── server/
│   └── worker/
└── .env.example
```

## Local Startup

1. Copy the environment template:

```bash
cp .env.example .env
```

2. Build and start the stack:

```bash
docker compose up --build
```

3. Verify service health:

```bash
curl http://localhost:3400/livez
curl http://localhost:3400/readyz
curl http://localhost:3400/health
curl http://localhost:3400/ingestion/mail/status
curl http://localhost:3401/health
```

4. Optional: start Adminer for local PostgreSQL inspection:

```bash
docker compose --profile admin up --build
```

Adminer will be available at [http://localhost:8080](http://localhost:8080).

## Useful Commands

```bash
npm install
npm run clean
npm run typecheck
npm run build
npm run migrate
npm run dev:app
npm run dev:worker
npm run verify:health
npm run verify:infra
docker compose down --remove-orphans
```

For host-native development instead of Docker:

```bash
npm install
cp .env.example .env
# Change POSTGRES_HOST, REDIS_URL, and QDRANT_URL in .env to localhost equivalents.
npm run build
npm run dev:app
npm run dev:worker
```

## Migration Behavior

- Migrations live in `migrations/*.sql`.
- `app` and `worker` both run the migrator at startup, but PostgreSQL advisory locking prevents duplicate execution.
- Applied migrations are tracked in `schema_migrations`.
- The bootstrap path only creates Qdrant collections after dependency connectivity is confirmed.
- Sprint 2 adds `sync_state`, `email_recipients`, and `ingestion_runs`, plus email schema refinements for source tracking and idempotent ingestion.
- Sprint 3 adds classification fields and queue indexes for follow-up suggestion jobs.

## Health Endpoints

- `/livez`: process-only liveness. No dependency checks.
- `/readyz`: dependency readiness for PostgreSQL, Redis, and Qdrant, including per-dependency status and latency.
- `/health`: concise summary payload for dashboards and container health checks.
- `/ingestion/mail/run`: manually trigger a mail ingestion run.
- `/ingestion/mail/runs`: list recent ingestion runs.
- `/ingestion/mail/status`: return provider capabilities, recent runs, and sync checkpoint state.

Example `/health` response:

```json
{
  "service": "app",
  "status": "ok",
  "timestamp": "2026-03-22T03:11:00.000Z",
  "dependencies": {
    "postgres": "ok",
    "redis": "ok",
    "qdrant": "ok"
  }
}
```

## Environment Notes

- All secrets stay in environment variables only.
- `DATABASE_URL` is used by the Node services. The individual PostgreSQL variables are also supplied so Docker can initialize the database container.
- `EMBEDDING_VECTOR_SIZE` is shared by all Sprint 1 Qdrant collections.
- `HOST_APP_PORT` and `HOST_WORKER_PORT` control the exposed local ports. Container ports remain `3000` and `3001`.
- The sample `.env.example` is Docker-oriented. If you run `npm run dev:app` or `npm run dev:worker` directly on your host, change `POSTGRES_HOST`, `REDIS_URL`, and `QDRANT_URL` to `localhost` equivalents.
- `QDRANT_COLLECTION_DISTANCE` and `QDRANT_COLLECTION_ON_DISK_PAYLOAD` control initial collection creation.
- `STARTUP_MAX_ATTEMPTS`, `STARTUP_INITIAL_BACKOFF_MS`, and `STARTUP_MAX_BACKOFF_MS` control dependency retry behavior.
- `OPENCLAW_MSGRAPH_BASE_URL` is the existing local OpenClaw connector API base URL. In Docker on macOS, `http://host.docker.internal:3000` is a typical host-reachable default.
- `OPENCLAW_MSGRAPH_SHARED_SECRET` must match the connector’s configured shared secret.
- `OPENCLAW_MSGRAPH_CONNECTION_NAME` optionally pins the connector connection; otherwise the service tries the default/only active connection.
- `OPENCLAW_MSGRAPH_AUTH_MODE` should stay `delegated` for mail ingestion with the current connector API.
- `MAIL_INGESTION_FOLDERS` defaults to `Inbox`. The current connector only supports Inbox-style mailbox listing.
- `MAIL_INGESTION_PAGE_SIZE`, `MAIL_INGESTION_POLL_WINDOW_MINUTES`, and `MAIL_INGESTION_FALLBACK_LOOKBACK_MINUTES` control the fallback ingestion window.
- `MAIL_INGESTION_STATUS_LIMIT` controls the number of recent runs returned by status endpoints.
- `CLASSIFICATION_PROVIDER` defaults to `openclaw` and controls which inference adapter the worker uses.
- `CLASSIFICATION_MODEL` selects the model name passed through the inference provider.
- `CLASSIFICATION_TIMEOUT_MS` controls the per-request timeout for model inference.
- `OPENCLAW_INFERENCE_URL` is the OpenClaw-managed inference endpoint used for normal operation.
- `OPENCLAW_INFERENCE_SHARED_SECRET` optionally overrides the header secret used for OpenClaw inference. If omitted, it falls back to `OPENCLAW_MSGRAPH_SHARED_SECRET`.
- `OPENAI_API_KEY` is optional and only used if `CLASSIFICATION_PROVIDER=openai` for fallback/debug use.
- `OPENAI_BASE_URL` is optional and only used with the direct OpenAI fallback.
- `CLASSIFICATION_VERSION` controls idempotent classifier versioning.
- `CLASSIFICATION_BODY_MAX_CHARS` limits how much email body text is sent to the model.
- `CLASSIFICATION_POLL_INTERVAL_MS` controls worker idle polling frequency.
- `CLASSIFICATION_MAX_ATTEMPTS`, `CLASSIFICATION_RETRY_BASE_DELAY_MS`, and `CLASSIFICATION_RETRY_MAX_DELAY_MS` control classification retry scheduling.
- `CLASSIFICATION_TASK_THRESHOLD` controls when `extract_task` is enqueued.
- `CLASSIFICATION_EMERGENCY_THRESHOLD` controls when `detect_emergency` is enqueued.

## Verification

With the Docker stack running:

```bash
npm run build
APP_BASE_URL=http://127.0.0.1:3400 WORKER_BASE_URL=http://127.0.0.1:3401 node dist/scripts/verifyHealth.js
docker compose exec -T app node dist/scripts/verifyInfra.js
```

`verifyHealth` checks the endpoint contracts for `/livez`, `/readyz`, and `/health`. `verifyInfra` checks migration history, required tables and indexes, `updated_at` triggers, trigger behavior, and Qdrant collections.

## Manual Ingestion Test Steps

1. Ensure the local OpenClaw connector service is running and has at least one active Microsoft connection.
2. Set these values in `.env`:

```bash
OPENCLAW_MSGRAPH_BASE_URL=http://host.docker.internal:3000
OPENCLAW_MSGRAPH_SHARED_SECRET=your-connector-secret
OPENCLAW_MSGRAPH_CONNECTION_NAME=your-connection-name
MAIL_INGESTION_FOLDERS=Inbox
MAIL_INGESTION_PAGE_SIZE=100
```

3. Start the stack:

```bash
docker compose up --build
```

4. Trigger ingestion:

```bash
curl -X POST http://localhost:3400/ingestion/mail/run \
  -H 'content-type: application/json' \
  -d '{"requested_by":"local-test"}'
```

5. Inspect ingestion state:

```bash
curl http://localhost:3400/ingestion/mail/status
curl http://localhost:3400/ingestion/mail/runs
```

6. Verify downstream queue payloads:

```bash
docker compose exec -T postgres psql -U openclaw -d openclaw_inbox \
  -c "select action_type, email_id, payload from action_queue order by created_at desc limit 5;"
```

## Manual Classification Test Steps

1. Set the OpenClaw-managed inference configuration in `.env`:

```bash
CLASSIFICATION_PROVIDER=openclaw
OPENCLAW_INFERENCE_URL=https://your-openclaw-host/v1/chat/completions
OPENCLAW_INFERENCE_SHARED_SECRET=your-openclaw-shared-secret
CLASSIFICATION_MODEL=gpt-4o-mini
CLASSIFICATION_VERSION=sprint-3
```

2. Start or rebuild the stack:

```bash
docker compose up --build
```

3. Confirm the worker is healthy and processing:

```bash
curl http://localhost:3401/health
docker compose logs --tail=100 worker
```

4. Ensure `classify_email` jobs exist. If not, trigger ingestion:

```bash
curl -X POST http://localhost:3400/ingestion/mail/run \
  -H 'content-type: application/json' \
  -d '{"requested_by":"classification-test"}'
```

5. Inspect persisted classification results:

```bash
docker compose exec -T postgres psql -U openclaw -d openclaw_inbox \
  -c "select email_id, category, urgency, needs_reply, task_likelihood, finance_doc_type, confidence, classified_at from email_classifications order by classified_at desc limit 20;"
```

6. Inspect queue state after classification:

```bash
docker compose exec -T postgres psql -U openclaw -d openclaw_inbox \
  -c "select action_type, status, attempts, email_id, scheduled_for, last_error from action_queue order by created_at desc limit 50;"
```

Expected result:

- `classify_email` jobs move to `completed`
- `email_classifications` rows are created
- follow-up queue rows may appear for `suggest_reply`, `extract_task`, `extract_document`, or `detect_emergency`
- rerunning the worker does not create another classification row for the same `email_id` and `CLASSIFICATION_VERSION`
- no local `OPENAI_API_KEY` is required when `CLASSIFICATION_PROVIDER=openclaw`

## Troubleshooting

- If `docker compose up --build` fails with a port collision, update `HOST_APP_PORT`, `HOST_WORKER_PORT`, or `ADMINER_PORT` in `.env`.
- PostgreSQL, Redis, and Qdrant are intentionally not published to the host by default. Use `docker compose exec` or Adminer for local inspection.
- If startup stalls, inspect `docker compose logs app worker postgres redis qdrant` to see retry/backoff messages.
- If you reset local data, remove the named volumes manually before restarting.
- If ingestion fails immediately, check `OPENCLAW_MSGRAPH_BASE_URL`, `OPENCLAW_MSGRAPH_SHARED_SECRET`, and the selected connection name.
- If you configure folders other than `Inbox`, the current connector adapter will reject them because the inspected plugin does not expose folder-specific mail APIs yet.
- If attachment metadata stays empty, that is expected when the connector payload does not include inline attachment objects.
- If the worker exits on startup, check that `OPENCLAW_INFERENCE_URL` is set when `CLASSIFICATION_PROVIDER=openclaw`.
- If classification jobs remain pending, inspect `docker compose logs worker` for model API errors or schema validation failures.
- If jobs keep retrying, inspect `action_queue.last_error` and `scheduled_for` to confirm retry backoff is working as intended.

## Assumptions

- Microsoft Graph ingestion is intentionally out of scope for Sprint 1.
- Reply sending, task execution, receipts handling, document extraction, and approval workflows are not implemented yet.
- A single embedding dimensionality is sufficient for `email_embeddings`, `reply_style_embeddings`, and `training_examples` at this stage.
- Redis is provisioned and health-checked now, but the classification worker currently uses PostgreSQL as the durable queue source of truth.
- The exact OpenClaw inference endpoint contract was not present in the checked-in repos, so the adapter assumes an OpenAI-compatible `chat/completions` surface fronted by OpenClaw and authenticated with `x-openclaw-shared-secret`.
