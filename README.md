# CreativeFlow AI

CreativeFlow AI is an AI creative production workspace for turning campaign briefs into structured strategy, copy, visual assets, and reviewable versions.

## Overview

The product keeps campaign planning, AI generation, human review, asset history, and generation observability in one focused workflow. Clerk protects the workspace, while PostgreSQL persists campaigns, strategies, assets, versions, reviews, and generation metadata.

## Core workflow

1. Create a campaign brief with its brand, objective, audience, tone, and key message.
2. Generate a structured campaign strategy.
3. Generate campaign copy and visual assets.
4. Regenerate assets while preserving version history.
5. Approve or reject assets through a human review step.
6. Inspect generation history and usage information.

## Key capabilities

- Structured AI strategy generation
- AI copy generation
- Visual generation workflow
- Human approval and rejection
- Asset regeneration and version history
- Generation history and usage visibility
- PostgreSQL persistence
- Clerk authentication
- Responsive production-workspace UI

## Tech stack

- Web: React, Vite, TypeScript, Clerk
- API: Express, TypeScript, Zod
- Data: PostgreSQL
- Text and strategy: Gemini (`gemini-3.5-flash-lite`)
- Visual pipeline: Gemini, Clipdrop, and Cloudinary
- Testing: Vitest

## Architecture

The repository contains two independently installable npm applications:

- `apps/web`: browser application and API client
- `apps/api`: HTTP API, provider integrations, persistence, tests, and SQL migration

The API owns authentication enforcement, validation, generation orchestration, review state, and persistence. The web application consumes its `/api/v1` endpoints.

## Local development

Requirements: Node.js 22+, npm, Docker, and a Clerk development application.

1. Copy each application's `.env.example` to its local `.env` and provide development credentials. Never commit local env files.
2. Start PostgreSQL:

   ```bash
   docker compose -f apps/api/docker-compose.yml up -d
   ```

3. Apply `apps/api/migrations/001_creativeflow.sql` to the local database.
4. Install and start the API:

   ```bash
   cd apps/api
   npm ci
   npm run dev
   ```

5. In another terminal, install and start the web app:

   ```bash
   cd apps/web
   npm ci
   npm run dev
   ```

The included Docker Compose configuration retains PostgreSQL data in the `creativeflow_postgres_data` volume and exposes the database on host port `54329`.

## Project structure

```text
creativeflow-ai/
├── apps/
│   ├── api/
│   └── web/
├── docs/
│   └── screenshots/
├── .github/
│   └── workflows/
├── .gitignore
└── README.md
```

## Testing

Run the quality checks independently in both `apps/web` and `apps/api`:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run format:check
```

Provider tests use deterministic mock mode and do not require live generation calls.

## Deployment architecture

Deployment targets and public URLs will be documented after production infrastructure is configured and verified.
