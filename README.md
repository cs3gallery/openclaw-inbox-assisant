# OpenClaw Inbox Assistant

Sprint 1 provides the infrastructure foundation for a production-ready inbox organizer and executive assistant service. It includes a TypeScript backend scaffold, Dockerized PostgreSQL/Qdrant/Redis dependencies, SQL migrations, Qdrant collection bootstrap, structured logging, and health checks for the app and worker.

## Architecture Summary

- `app`: Fastify HTTP service exposing `/livez`, `/readyz`, and `/health`.
- `worker`: Background service scaffold with the same dependency bootstrap path plus a lightweight health server.
- `postgres`: System of record for structured state and operational tables.
- `qdrant`: Vector database for semantic memory and future embedding workflows.
- `redis`: Queue and job infrastructure foundation for future background processing.
- `adminer`: Optional PostgreSQL admin UI for local development.

The startup path is intentionally explicit:

1. Load and validate environment variables.
2. Connect to PostgreSQL, Redis, and Qdrant.
3. Run SQL migrations against PostgreSQL using an advisory lock.
4. Ensure required Qdrant collections exist.
5. Start the HTTP app or worker process.

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
curl http://localhost:3000/health
curl http://localhost:3001/health
```

4. Optional: start Adminer for local PostgreSQL inspection:

```bash
docker compose --profile admin up --build
```

Adminer will be available at [http://localhost:8080](http://localhost:8080).

## Useful Commands

```bash
npm install
npm run typecheck
npm run migrate
npm run dev:app
npm run dev:worker
```

## Environment Notes

- All secrets stay in environment variables only.
- `DATABASE_URL` is used by the Node services. The individual PostgreSQL variables are also supplied so Docker can initialize the database container.
- `EMBEDDING_VECTOR_SIZE` is shared by all Sprint 1 Qdrant collections.
- The sample `.env.example` is Docker-oriented. If you run `npm run dev:app` or `npm run dev:worker` directly on your host, change `POSTGRES_HOST`, `REDIS_URL`, and `QDRANT_URL` to `localhost` equivalents.

## Assumptions

- Microsoft Graph ingestion is intentionally out of scope for Sprint 1.
- Classification, task extraction, receipts handling, and approval workflows are not implemented yet.
- A single embedding dimensionality is sufficient for `email_embeddings`, `reply_style_embeddings`, and `training_examples` at this stage.
- Redis is provisioned and health-checked now, but job queues are deferred to a later sprint.
