# OpenClaw Deployment And Integration Guide

This guide explains how to install, configure, and run the OpenClaw Inbox Assistant alongside OpenClaw in a real environment.

It is written for operators who need to bring the stack up, wire it to the existing OpenClaw services, and run the first live ingestion and classification tests.

## Overview

The Inbox Assistant is a separate Docker-based backend that integrates with OpenClaw over HTTP.

It is responsible for:

- ingesting email through the existing OpenClaw Microsoft Graph connector
- normalizing and storing email data in PostgreSQL
- queuing downstream work in PostgreSQL and Redis
- classifying emails through an OpenClaw-managed inference endpoint
- persisting structured classification results

It is not responsible for:

- Microsoft OAuth
- Microsoft Graph token management
- model-provider credential management
- direct OpenAI or Grok credential ownership in the standard path
- UI
- sending replies
- creating Microsoft To Do tasks
- filing documents into OneDrive

OpenClaw remains the owner of:

- Microsoft Graph connector access
- upstream model credentials
- model routing to OpenAI, Grok, or another provider

## Architecture

Inbox Assistant stack:

- `app`: HTTP API for health, ingestion triggers, and status
- `worker`: background processor for classification jobs
- `postgres`: structured system of record
- `redis`: queue/event plumbing
- `qdrant`: vector database for future semantic workflows
- optional `adminer`: local PostgreSQL inspection

OpenClaw-side dependencies:

- OpenClaw Microsoft Graph connector endpoint
- OpenClaw-managed inference endpoint
- shared secret(s) used to authenticate requests from the Inbox Assistant

Network flow:

- Inbox Assistant `app` -> OpenClaw msgraph connector -> Microsoft Graph
- Inbox Assistant `worker` -> OpenClaw inference endpoint -> upstream model provider
- Inbox Assistant `app` and `worker` -> local PostgreSQL / Redis / Qdrant

## Required Services

Services that run inside the Inbox Assistant stack:

- `app`
- `worker`
- `postgres`
- `redis`
- `qdrant`
- optional `adminer`

Services that must already exist in OpenClaw or adjacent infrastructure:

- OpenClaw msgraph connector API
- OpenClaw inference API

## Docker Compose Expectations

The Inbox Assistant stack expects:

- Docker Engine and Docker Compose
- one `.env` file in the project root
- the OpenClaw endpoints to be reachable from inside the containers

Default published ports:

- `3400` -> Inbox Assistant `app`
- `3401` -> Inbox Assistant `worker`

Internal-only services by default:

- PostgreSQL
- Redis
- Qdrant

Typical startup command:

```bash
docker compose up -d --build
```

## Required Environment Variables

Minimum required for OpenClaw-integrated operation:

```dotenv
NODE_ENV=production
APP_NAME=openclaw-inbox-assistant
LOG_LEVEL=info

APP_HOST=0.0.0.0
APP_PORT=3000
HOST_APP_PORT=3400
WORKER_HOST=0.0.0.0
WORKER_PORT=3001
HOST_WORKER_PORT=3401

POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=openclaw_inbox
POSTGRES_USER=openclaw
POSTGRES_PASSWORD=change-me
DATABASE_URL=postgresql://openclaw:change-me@postgres:5432/openclaw_inbox

REDIS_URL=redis://redis:6379
QDRANT_URL=http://qdrant:6333

OPENCLAW_MSGRAPH_BASE_URL=https://<openclaw-msgraph-endpoint>
OPENCLAW_MSGRAPH_SHARED_SECRET=<shared-secret>
OPENCLAW_MSGRAPH_CONNECTION_NAME=<connection-name>
OPENCLAW_MSGRAPH_AUTH_MODE=delegated

MAIL_INGESTION_FOLDERS=Inbox
MAIL_INGESTION_PAGE_SIZE=100
MAIL_INGESTION_POLL_WINDOW_MINUTES=1440
MAIL_INGESTION_FALLBACK_LOOKBACK_MINUTES=240
MAIL_INGESTION_STATUS_LIMIT=20

CLASSIFICATION_PROVIDER=openclaw
CLASSIFICATION_MODEL=gpt-4o-mini
CLASSIFICATION_TIMEOUT_MS=30000
OPENCLAW_INFERENCE_AUTH_MODE=bearer
OPENCLAW_INFERENCE_URL=https://<openclaw-gateway-host>:18789/v1/chat/completions
OPENCLAW_INFERENCE_BEARER_TOKEN=<gateway-token>
OPENCLAW_INFERENCE_SHARED_SECRET=

CLASSIFICATION_VERSION=sprint-3
CLASSIFICATION_BODY_MAX_CHARS=12000
CLASSIFICATION_POLL_INTERVAL_MS=5000
CLASSIFICATION_MAX_ATTEMPTS=5
CLASSIFICATION_RETRY_BASE_DELAY_MS=15000
CLASSIFICATION_RETRY_MAX_DELAY_MS=1800000
CLASSIFICATION_TASK_THRESHOLD=0.75
CLASSIFICATION_EMERGENCY_THRESHOLD=0.85
```

Notes:

- `OPENAI_API_KEY` is not required for the standard path.
- `OPENCLAW_INFERENCE_AUTH_MODE` should remain `bearer` for the standard OpenClaw gateway path.
- `OPENCLAW_INFERENCE_URL` must be the full endpoint URL, not just the gateway host.
- `OPENCLAW_INFERENCE_BEARER_TOKEN` is required for the standard OpenClaw gateway path.
- `OPENCLAW_INFERENCE_SHARED_SECRET` is only used if you explicitly set `OPENCLAW_INFERENCE_AUTH_MODE=shared_secret`.
- `CLASSIFICATION_PROVIDER` should remain `openclaw` in normal deployments.

## OpenClaw Dependencies

The Inbox Assistant currently depends on two OpenClaw-facing HTTP surfaces:

1. Microsoft Graph connector surface
2. Model inference surface

The assistant assumes both are reachable over the network from Docker containers.

OpenClaw must provide:

- a reachable base URL for mail search / mail connector requests
- a reachable full inference endpoint URL for `POST /v1/chat/completions`
- gateway token authentication for the inference endpoint
- an active Microsoft Graph connection in the connector
- an inference route that accepts an OpenAI-compatible `chat/completions` payload and returns model output

## OpenClaw MsGraph Connector Integration

The Inbox Assistant does not call Microsoft Graph directly.

It uses the existing OpenClaw connector through:

- `OPENCLAW_MSGRAPH_BASE_URL`
- `x-openclaw-shared-secret`
- the existing connection name configured in OpenClaw

The current connector capability assumptions are:

- mailbox message listing is available
- folder listing is not available
- message detail fetch is not available
- delta/cursor sync is not available

Operational effect:

- ingestion currently uses a fallback timestamp-window strategy
- only Inbox-style mailbox listing is supported

## OpenClaw Inference Integration

The Inbox Assistant classification worker does not own model credentials.

Instead:

1. The worker builds a classification prompt from stored email data.
2. The worker sends a request to `OPENCLAW_INFERENCE_URL`.
3. The request is authenticated with `Authorization: Bearer <gateway token>` by default.
4. OpenClaw routes that request to the upstream model provider.
5. The worker validates the returned structured JSON and persists the result.

Expected request style:

- OpenAI-compatible `chat/completions`
- strict JSON-schema response contract
- model name passed through `CLASSIFICATION_MODEL`

Confirmed contract:

- OpenClaw gateway port: `18789`
- Route: `POST /v1/chat/completions`
- Auth: `Authorization: Bearer <gateway token>`
- Response shape: OpenAI-compatible chat completion JSON

## Startup Order

Recommended order:

1. Ensure OpenClaw msgraph connector is reachable and has an active connection.
2. Ensure the OpenClaw gateway `POST /v1/chat/completions` endpoint is reachable with a gateway token.
3. Create `.env` for the Inbox Assistant with both OpenClaw URLs.
4. Start the Inbox Assistant stack:

```bash
docker compose up -d --build
```

5. Wait for `postgres`, `redis`, and `app` to become healthy.
6. Confirm `worker` stays up and does not restart-loop.
7. Run the first ingestion test.
8. Confirm `classify_email` jobs are processed.

## Health Checks

App:

- `GET /livez`
- `GET /readyz`
- `GET /health`
- `GET /ingestion/mail/status`

Worker:

- `GET /health`

Useful commands:

```bash
curl http://localhost:3400/livez
curl http://localhost:3400/readyz
curl http://localhost:3400/health
curl http://localhost:3400/ingestion/mail/status
curl http://localhost:3401/health
docker compose ps
docker compose logs --tail=120 app worker
```

Success criteria:

- `app` is healthy
- `readyz` reports PostgreSQL, Redis, and Qdrant as ready
- `worker` is healthy and not restarting

## First Live Test Procedure

1. Confirm env is present:

```bash
grep -E '^(OPENCLAW_MSGRAPH_BASE_URL|OPENCLAW_MSGRAPH_CONNECTION_NAME|CLASSIFICATION_PROVIDER|OPENCLAW_INFERENCE_AUTH_MODE|OPENCLAW_INFERENCE_URL|OPENCLAW_INFERENCE_BEARER_TOKEN)=' .env
```

2. Start the stack:

```bash
docker compose up -d --build
```

3. Confirm services:

```bash
docker compose ps
```

4. Confirm app readiness:

```bash
curl http://localhost:3400/readyz
```

5. Confirm ingestion status:

```bash
curl http://localhost:3400/ingestion/mail/status
```

6. Inspect worker logs:

```bash
docker compose logs --tail=120 worker
```

Expected:

- no restart loop
- no missing `OPENCLAW_INFERENCE_URL` error
- no missing `OPENCLAW_INFERENCE_BEARER_TOKEN` error when `OPENCLAW_INFERENCE_AUTH_MODE=bearer`
- no missing `OPENAI_API_KEY` requirement when `CLASSIFICATION_PROVIDER=openclaw`

## Ingestion Validation

Trigger ingestion:

```bash
curl -X POST http://localhost:3400/ingestion/mail/run \
  -H 'content-type: application/json' \
  -d '{"requested_by":"openclaw-live-test"}'
```

Verify recent runs:

```bash
curl http://localhost:3400/ingestion/mail/runs
curl http://localhost:3400/ingestion/mail/status
```

Verify email persistence:

```bash
docker compose exec -T postgres psql -U openclaw -d openclaw_inbox \
  -c "select count(*) as emails_count from emails; select count(*) as recipients_count from email_recipients;"
```

Verify queued classification jobs:

```bash
docker compose exec -T postgres psql -U openclaw -d openclaw_inbox \
  -c "select action_type, status, count(*) from action_queue where action_type = 'classify_email' group by 1,2 order by 1,2;"
```

## Classification Validation

Pre-check:

```bash
docker compose exec -T postgres psql -U openclaw -d openclaw_inbox \
  -c "select action_type, status, count(*) from action_queue where action_type = 'classify_email' group by 1,2 order by 1,2;"
```

Verify worker config and behavior:

```bash
docker compose logs --tail=120 worker
docker compose ps worker
```

Verify completed classification jobs:

```bash
docker compose exec -T postgres psql -U openclaw -d openclaw_inbox \
  -c "select id, status, attempts, completed_at, result from action_queue where action_type = 'classify_email' order by updated_at desc limit 20;"
```

Verify classification rows:

```bash
docker compose exec -T postgres psql -U openclaw -d openclaw_inbox \
  -c "select email_id, classifier_version, category, urgency, needs_reply, task_likelihood, finance_doc_type, confidence, model_name, classified_at from email_classifications order by classified_at desc limit 20;"
```

Verify queued follow-up actions:

```bash
docker compose exec -T postgres psql -U openclaw -d openclaw_inbox \
  -c "select action_type, status, count(*) from action_queue where action_type in ('suggest_reply','extract_task','extract_document','detect_emergency') group by 1,2 order by 1,2;"
```

Success criteria:

- `classify_email` jobs move from `pending` to `completed`
- `email_classifications` rows are created
- `OPENAI_API_KEY` is not required
- optional follow-up queue rows appear when classification conditions are met

## Troubleshooting

Worker restart-loop:

- likely cause: `OPENCLAW_INFERENCE_URL` missing
- confirm with:

```bash
docker compose logs --tail=120 worker
```

Expected error:

```text
OPENCLAW_INFERENCE_URL is required to start the classification worker when CLASSIFICATION_PROVIDER=openclaw
```

Inference endpoint returns 404:

- the configured URL is likely not the full gateway endpoint path
- set `OPENCLAW_INFERENCE_URL` to the full route, for example `https://<host>:18789/v1/chat/completions`

Inference endpoint returns 401 or 403:

- verify `OPENCLAW_INFERENCE_BEARER_TOKEN`
- verify the token is a valid OpenClaw gateway token
- if you intentionally switched to `OPENCLAW_INFERENCE_AUTH_MODE=shared_secret`, verify `OPENCLAW_INFERENCE_SHARED_SECRET`

Classification jobs remain pending:

- worker is not running, is restarting, or cannot reach inference

Check:

```bash
docker compose ps worker
docker compose logs --tail=120 worker
```

Classification jobs keep retrying:

```bash
docker compose exec -T postgres psql -U openclaw -d openclaw_inbox \
  -c "select id, attempts, scheduled_for, last_error from action_queue where action_type = 'classify_email' order by updated_at desc limit 20;"
```

No classification rows are written:

- check worker logs for:
  - provider config errors
  - HTTP auth errors
  - schema validation failures

## Known Limitations

- The gateway route is confirmed as `/v1/chat/completions`, but the Inbox Assistant must still be pointed at a host-reachable gateway URL from its own deployment environment.
- The worker uses PostgreSQL as the durable queue source of truth.
- Downstream processors for `suggest_reply`, `extract_task`, `extract_document`, and `detect_emergency` are not implemented yet.
- The current ingestion path still depends on top-N message listing with a fallback timestamp window because the connector does not expose delta/cursor sync.

## Sample Validation Commands

Check that local OpenAI is not required:

```bash
node -e "const fs=require('fs'); const text=fs.readFileSync('.env','utf8'); const m=text.match(/^OPENAI_API_KEY=(.*)$/m); console.log(m && m[1] ? 'OPENAI_API_KEY is set' : 'OPENAI_API_KEY is not set');"
```

Check queue state:

```bash
docker compose exec -T postgres psql -U openclaw -d openclaw_inbox \
  -c "select action_type, status, count(*) from action_queue group by 1,2 order by 1,2;"
```

Check classification rows:

```bash
docker compose exec -T postgres psql -U openclaw -d openclaw_inbox \
  -c "select count(*) as classification_rows from email_classifications;"
```

## Operator Checklist

1. Confirm the OpenClaw msgraph connector URL is known and reachable.
2. Confirm the OpenClaw gateway `POST /v1/chat/completions` endpoint is reachable.
3. Set `CLASSIFICATION_PROVIDER=openclaw`.
4. Set `OPENCLAW_INFERENCE_AUTH_MODE=bearer`.
5. Set `OPENCLAW_INFERENCE_URL` to the full gateway endpoint URL.
6. Set `OPENCLAW_INFERENCE_BEARER_TOKEN`.
7. Start the Inbox Assistant stack with `docker compose up -d --build`.
8. Confirm `app` and `worker` are both healthy.
9. Trigger ingestion.
10. Confirm `classify_email` jobs appear and then complete.
11. Confirm rows appear in `email_classifications`.
12. Confirm optional follow-up action rows are queued as expected.
