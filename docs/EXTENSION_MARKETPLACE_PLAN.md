# Browzer Extension Marketplace - Architecture & Implementation Plan

## Objective
Provide a production-ready marketplace where developers can publish signed Browzer extensions and users can discover, install, update and remove them seamlessly from both the public website and the in-browser "Extension Manager".

---

## High-Level Decisions
1. **Poly-repo with Shared Packages**  
   • `browzer` (desktop app, extension framework **and Extension Store frontend**)  
   • `browzer-store` (APIs, DB, signing)  
   • `packages/extension-schema` (shared TS types)  
   • `packages/ui` (optional React component library reused by store & desktop panel)  

2. **Monorepo Tooling Optional**  
   If preferred, place all of the above in a single Git repo organised as workspaces; decision can be revisited without code changes.

---

## Repository / Package Layout
```text
browzer/                       # existing desktop app
    src/
    extension-store/           # Next.js frontend for marketplace
browzer-store/                 # standalone backend repo
    src/
    prisma/                    # DB schema & migrations
    Dockerfile
packages/
├── extension-schema/          # npm package with shared types
└── ui/                        # shared component lib (optional)
```

---

## Backend (`browzer-store` repo)
### Tech Stack
• Node.js 20 + TypeScript  
• Fastify (or NestJS) for HTTP & WebSocket APIs  
• PostgreSQL + Prisma ORM  
• Redis for caching & job queue  
• MinIO/S3 for extension package storage  
• Dockerised for local dev & CI  

### Core Responsibilities
1. Extension CRUD: publish, update, deprecate, delete  
2. Versioning & SemVer channels (stable, beta)  
3. Extension package (.bzx) storage & CDN integration  
4. Automatic signature generation & verification  
5. Permission validation against `extension-schema`  
6. Search & discovery endpoints (full-text, filters)  
7. Auth (OAuth2 + JWT) for dev & user accounts  
8. Payment hooks (future)  

### Key API Endpoints (REST)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/extensions` | Publish new extension |
| GET | `/api/v1/extensions` | Search & list |
| GET | `/api/v1/extensions/:id` | Metadata & versions |
| GET | `/api/v1/extensions/:id/:version/download` | Signed download |
| PATCH | `/api/v1/extensions/:id` | Update metadata |
| DELETE | `/api/v1/extensions/:id` | Delete/retire extension |

### Data Model (Prisma)
```prisma
model Extension {
  id           String   @id @default(cuid())
  name         String
  slug         String   @unique
  ownerId      String
  description  String
  iconUrl      String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  versions     ExtensionVersion[]
}

model ExtensionVersion {
  id            String   @id @default(cuid())
  extensionId   String
  semver        String
  manifestJson  Json
  packageUrl    String
  signature     String
  createdAt     DateTime @default(now())
  @@index([extensionId, semver])
}
```

### Security
• All uploads are scanned (ClamAV) & validated.  
• Private RSA keys stored in HSM or KMS for signing.  
• Rate limiting & audit logging on publish endpoints.  

### CI/CD
• GitHub Actions: lint, test, build Docker image → GHCR/ECR  
• Automatic DB migrations via `prisma migrate deploy`.  
• Blue/Green deploy on Kubernetes.

---

## Extension Store Frontend (inside `browzer` repo)
### Tech Stack
• Next.js 14 (App Router) + TypeScript  
• Tailwind CSS + Radix UI  
• React Query / tRPC client  
• Vercel or Netlify deploy  

### Pages
1. Home / Featured  
2. Category listing  
3. Extension detail (screenshots, permissions)  
4. Publisher dashboard (upload, analytics)  
5. Auth (OAuth)  

### Integration
• Consumes backend via REST/tRPC.  
• Pre-render SEO pages via ISR.  

---

## In-Browser Extension Manager (inside `browzer`)
• Re-use components from `packages/ui`.  
• Calls backend API with OAuth token via embedded webview or internal IPC.  
• Supports install, update, delete, enable/disable.  
• Shows permission diff before updates.  

---

## Shared Packages
1. `extension-schema`  
   • TS types: `ExtensionManifest`, `Permission`, etc.  
   • Validation helpers using Zod/Ajv.  
2. `ui` (optional)  
   • Design tokens, buttons, cards, modal, etc.  
   • Published to npm & consumed by both frontends.  

---

## Development Workflow
1. Clone all repos (or workspaces) with `pnpm` workspaces.  
2. `docker compose up` starts Postgres, Redis, MinIO.  
3. `pnpm dev` in **`browzer-store` (backend)** and **`browzer/extension-store` (frontend)** for hot reload.  
4. Desktop app runs locally and points to `localhost:3000`.  

---

## Milestones & Timeline
| Phase | Duration | Deliverables |
|-------|----------|--------------|
| 1 – Skeleton | 1 week | Repo scaffolds, CI, Docker, shared schema |
| 2 – Upload Flow | 2 weeks | Auth, publish API, DB models, S3 storage |
| 3 – Download & Install | 1 week | Signed downloads, desktop integration |
| 4 – Extension Store UI | 2 weeks | Browse, detail pages, search |
| 5 – Dashboard | 1 week | Publisher analytics, version control |
| 6 – Hardening | 2 weeks | Security audit, rate limiting, e2e tests |

---

## Open Questions
1. Payment processing & premium extensions timeline?  
2. Analytics data pipeline (Snowflake, PostHog)?  
3. How to handle cross-extension dependencies in store UI?  

---

## Future Considerations
• WebAssembly extension type support.  
• Private enterprise marketplace mode.  
• Extension A/B testing & staged rollouts.  
• Compliance: GDPR/CCPA, SOC2.  

---

_Last updated: {{DATE}}_