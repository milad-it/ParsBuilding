# Milestone 1 (M1) Backend Setup & Infrastructure Technical Plan
**ParsBuilding Commercial SaaS Platform — Server Toolchain, Framework & Architecture Specification**

---

## 1. Executive Summary & Objective

The ParsBuilding platform is transitioning from a legacy client-side PWA to a commercial multi-tenant SaaS backend with PostgreSQL and real-time capabilities. Milestone 1 (M1) establishes the foundational backend infrastructure in `server/`.

This document specifies the complete technical blueprint for the `server/` module, including runtime requirements, framework selection (Fastify vs. Express), TypeScript configuration, dependency matrix, test automation harness (Vitest), npm script lifecycle, and code layout.

---

## 2. Runtime Environment & Toolchain Design

### 2.1. Node.js & Package Manager Specification
- **Detected Local Environment**:
  - Node.js: `v24.19.0`
  - npm: `11.17.0`
  - OS: Windows 10/11 x64 (PowerShell shell environment)
- **Production / CI Runtime Requirement**:
  - Node.js: `>= 20.10.0 LTS` (Recommended: `20.x` or `22.x LTS`, compatible with `24.x`).
  - Package Manager: `npm >= 10.0.0` (or `pnpm >= 9.0.0`).
- **Windows PowerShell Execution Policy Note**:
  - In Windows environments where PowerShell script execution is restricted (`ExecutionPolicy: Restricted`), running `npm` directly invokes `npm.ps1` which causes `PSSecurityException`.
  - **Standard Command Convention**: On Windows PowerShell, all npm executions must use `npm.cmd` (or `npx.cmd`) or be executed inside cmd.exe / bash. Example: `npm.cmd run dev`, `npm.cmd test`.

### 2.2. Module System Decision: CommonJS with TypeScript vs. Native ESM
- **Evaluation**:
  - Modern Node.js supports native ES Modules (`"type": "module"`). However, native ESM in TypeScript with `NodeNext` resolution strictly requires relative imports to include explicit `.js` extensions (e.g., `import { db } from './config/database.js'`). In large teams and fast-moving codebases, missing extensions frequently cause runtime import errors.
  - Furthermore, several ecosystem libraries, Fastify plugins, and native addons (such as native Argon2 bindings and Prisma client generators) function with maximum stability under CommonJS bundling or `tsx` execution.
- **Decision**:
  - Configure `package.json` without `"type": "module"` (defaulting to CommonJS in emitted build) while authoring code in standard modern TypeScript ESM (`import` / `export` syntax).
  - Use `tsx` (TypeScript Execute) for zero-compilation, instant-reloading development (`tsx watch src/index.ts`).
  - Use `tsc` for production type checking and compilation to `dist/`.
  - Use `vitest` for tests, which natively handles TypeScript and ESM without compilation overhead.

---

## 3. Server Framework Selection: Fastify vs. Express

### 3.1. Comparison Matrix

| Feature / Metric | Fastify (Recommended) | Express | Rationale / SaaS Impact |
| :--- | :--- | :--- | :--- |
| **Throughput & Latency** | ~30,000–45,000 req/s | ~10,000–15,000 req/s | Fastify's optimized routing tree and serialization handle multi-tenant SaaS loads with lower memory footprint. |
| **TypeScript Support** | First-class, built-in typings | Requires `@types/express`, partial typings | Fastify provides strict generics for Params, Query, Body, Headers, and Replies out of the box. |
| **Schema & Validation** | Native JSON Schema / Ajv + Zod integration | External middleware (`zod`, `joi`) manual wiring | Fastify can validate inputs and serialize responses with `fastify-type-provider-zod` for 100% end-to-end type safety. |
| **Structured Logging** | Integrated Pino logger (`req.log`) | External (`winston`, `morgan`, `pino-http`) | Audit logs and compliance events require high-speed JSON structured logging with request correlation IDs (`reqId`). |
| **Plugin & Lifecycle** | Encapsulated DAG plugin model (`fastify-plugin`) | Linear middleware chain | Allows clean modular encapsulation of tenant middleware, auth, and database contexts without monkey-patching `req`. |
| **Real-Time WebSockets** | `@fastify/websocket` shares server & port natively | Requires manual `http.createServer` + `ws`/`socket.io` | Essential for Milestone 2 real-time building chat and live payment notifications. |
| **Async Error Handling** | Native promise rejection catch | Requires `express-async-errors` in Express 4 | Eliminates server crashes caused by unhandled async route errors. |

### 3.2. Architecture Recommendation: Fastify with TypeScript
- **Primary Selection**: **Fastify v4 / v5** with TypeScript.
  - Fastify directly aligns with ParsBuilding's commercial SaaS requirements: high-speed JSON transactions, built-in structured audit logging with Pino, native WebSocket support for resident/manager rooms, and end-to-end Zod type inference via `fastify-type-provider-zod`.
- **Secondary / Fallback Strategy**:
  - The service layer (`calculationEngine.ts`, `auditLogger.ts`, `migrationService.ts`) is designed strictly as **framework-agnostic pure TypeScript modules**. If an engineering decision requires Express, the route handlers can be adapted without altering the computational or database business logic.

---

## 4. Testing Framework: Vitest vs. Jest

### 4.1. Comparison Matrix

| Feature | Vitest (Selected) | Jest |
| :--- | :--- | :--- |
| **TypeScript Execution** | Native via Vite/esbuild (0ms setup) | Requires `ts-jest` or `@swc/jest` with heavy configs |
| **Execution Speed** | Instant startup, multithreaded worker pools | Noticeable startup lag and transpilation delay |
| **ESM / TS Compatibility** | 100% native out of the box | Requires `--experimental-vm-modules` and custom transforms |
| **Monorepo / Frontend Synergy** | Same test runner as Vite client (`client/`) | Separate toolchain and configuration paradigms |
| **API Compatibility** | Full Jest drop-in (`describe`, `it`, `expect`, `vi`) | Standard Jest API |
| **Watch Mode Performance** | Instant sub-millisecond HMR-like re-test | Slower full file graph recompilation |

### 4.2. Vitest Configuration (`server/vitest.config.ts`)
Vitest is configured to run all unit tests (calculation engine, rounding, debt resolution) and integration tests with deterministic isolation.

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', 'tests/']
    },
    alias: {
      '@': path.resolve(__dirname, './src')
    },
    testTimeout: 10000
  }
});
```

---

## 5. Complete Dependency Matrix (`server/package.json`)

### 5.1. Runtime Dependencies (`dependencies`)
| Package | Version | Purpose |
| :--- | :--- | :--- |
| `fastify` | `^4.28.1` | High-performance HTTP/2 & WebSocket web framework |
| `@fastify/cors` | `^9.0.1` | Hardened Cross-Origin Resource Sharing middleware |
| `@fastify/helmet` | `^11.1.1` | Security headers (CSP, HSTS, X-Frame-Options) |
| `@fastify/rate-limit` | `^9.1.0` | IP & tenant-based rate limiting to prevent brute force / DoS |
| `@fastify/cookie` | `^9.3.1` | Signed & HttpOnly cookie parser for refresh tokens |
| `@fastify/jwt` | `^8.0.1` | High-speed JWT verification and signing |
| `@fastify/websocket` | `^10.0.1` | Real-time WebSocket support for chat and live balance push |
| `fastify-plugin` | `^4.5.1` | Encapsulation bypass for shared plugins & decorators |
| `fastify-type-provider-zod` | `^2.0.0` | End-to-end type safety bridging Zod schemas and Fastify routes |
| `@prisma/client` | `^5.21.1` | Type-safe PostgreSQL ORM client |
| `dotenv` | `^16.4.5` | Environment variable loader from `.env` |
| `zod` | `^3.23.8` | Declarative schema validation for runtime inputs and configs |
| `@node-rs/argon2` | `^1.8.3` | Fast native Argon2id password hashing |

### 5.2. Development Dependencies (`devDependencies`)
| Package | Version | Purpose |
| :--- | :--- | :--- |
| `typescript` | `^5.6.3` | TypeScript compiler |
| `@types/node` | `^22.7.5` | TypeScript type declarations for Node.js runtime |
| `prisma` | `^5.21.1` | Prisma CLI for migrations, introspection, and schema generation |
| `tsx` | `^4.19.1` | High-speed TypeScript executor for development watch mode |
| `vitest` | `^2.1.3` | Next-generation testing framework |
| `@vitest/coverage-v8`| `^2.1.3` | Code coverage provider using V8 native coverage |
| `rimraf` | `^6.0.1` | Cross-platform directory cleaner for `dist/` |

---

## 6. TypeScript Configuration (`server/tsconfig.json`)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "CommonJS",
    "moduleResolution": "node",
    "rootDir": "./src",
    "outDir": "./dist",
    "baseUrl": "./",
    "paths": {
      "@/*": ["src/*"]
    },
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

---

## 7. Build, Execution & Test Lifecycle Scripts

### 7.1. Recommended `scripts` in `server/package.json`
```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "rimraf dist && tsc",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:push": "prisma db push",
    "prisma:studio": "prisma studio",
    "prisma:seed": "tsx prisma/seed.ts"
  }
}
```

### 7.2. Command Invocation Matrix
- **Development Server**: `npm.cmd run dev` (watches `src/` with instant restarts on change).
- **Unit & Logic Tests**: `npm.cmd test` (runs calculation and isolation test suites with Vitest).
- **Type Checking**: `npm.cmd run typecheck` (validates TypeScript types without emitting files).
- **Production Build**: `npm.cmd run build` (cleans `dist/` and compiles to standalone JavaScript).
- **Database Schema Sync**: `npm.cmd run prisma:generate && npm.cmd run prisma:push`.

---

## 8. Backend Directory Architecture & Component Design

The directory structure in `server/` satisfies the project layout specified in `PROJECT.md:157-175`:

```
server/
├── prisma/
│   ├── schema.prisma              # Multi-tenant PostgreSQL schema
│   └── seed.ts                    # Initial seed (Super-Admin, default complex)
├── src/
│   ├── config/
│   │   ├── env.ts                 # Zod-validated environment config
│   │   └── database.ts            # PrismaClient singleton with tenant extensions
│   ├── middleware/
│   │   ├── auth.ts                # Argon2/JWT bearer authentication hook
│   │   ├── tenant.ts              # Multi-tenant context injection & validation
│   │   ├── rbac.ts                # Granular role & permission authorization guards
│   │   └── errorHandler.ts        # Standardized RFC 7807 problem details handler
│   ├── services/
│   │   ├── calculationEngine.ts   # Deterministic financial calculation engine
│   │   ├── auditLogger.ts         # Immutable append-only audit logger
│   │   ├── authService.ts         # Password hashing & token rotation service
│   │   ├── migrationService.ts    # Lossless client data importer
│   │   └── realtimeService.ts     # WebSocket room & event dispatcher
│   ├── routes/
│   │   ├── index.ts               # Root route registrar (/api/v1)
│   │   ├── auth.routes.ts         # Login, refresh, register endpoints
│   │   ├── complexes.routes.ts    # Building complex management
│   │   ├── units.routes.ts        # Unit & resident management
│   │   ├── periods.routes.ts      # Expense entry, charge calculation, period closing
│   │   ├── ledger.routes.ts       # Manual transactions & unit payments
│   │   ├── migration.routes.ts    # Legacy IndexedDB ingestion endpoint
│   │   └── audit.routes.ts        # Immutable audit log queries
│   ├── types/
│   │   └── index.ts               # Shared contracts (TenantContext, CalculationResult)
│   └── index.ts                   # Fastify server bootstrap & graceful shutdown
├── tests/
│   ├── calculationEngine.test.ts  # 15 scenario deterministic calculation tests
│   ├── tenantIsolation.test.ts    # Cross-tenant data isolation tests
│   └── auth.test.ts               # Token security & Argon2 tests
├── .env.example                   # Template environment variables
├── package.json                   # Dependencies, scripts, and engine specs
├── tsconfig.json                  # TypeScript compiler options
└── vitest.config.ts               # Vitest runner configuration
```

---

## 9. Core Infrastructure Code Blueprints

### 9.1. Environment Configuration (`src/config/env.ts`)
Guarantees that the server never starts with missing or invalid configuration:

```typescript
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  COOKIE_SECRET: z.string().min(32).default('a-secure-cookie-signing-secret-key-32chars')
});

export const env = envSchema.parse(process.env);
```

### 9.2. Server Bootstrap Entry Point (`src/index.ts`)
Implements Fastify with Zod schema validation, CORS, Helmet, Rate Limiting, and Cookie handling:

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { env } from './config/env';
import { registerRoutes } from './routes';
import { errorHandler } from './middleware/errorHandler';

export async function buildServer() {
  const server = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined
    }
  }).withTypeProvider<ZodTypeProvider>();

  // Schema validation compilers
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  // Security middlewares
  await server.register(helmet, { contentSecurityPolicy: false });
  await server.register(cors, {
    origin: env.CORS_ORIGIN.split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  });
  await server.register(cookie, {
    secret: env.COOKIE_SECRET,
    hook: 'onRequest'
  });
  await server.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute'
  });
  await server.register(websocket);

  // Global Error Handler
  server.setErrorHandler(errorHandler);

  // API Route Registration
  await server.register(registerRoutes, { prefix: '/api/v1' });

  // Healthcheck endpoint
  server.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  return server;
}

async function start() {
  try {
    const server = await buildServer();
    await server.listen({ port: env.PORT, host: env.HOST });
    console.log(`🚀 ParsBuilding Backend running on http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  start();
}
```

### 9.3. Standardized Error Handling (`src/middleware/errorHandler.ts`)
Ensures uniform, safe JSON responses with proper HTTP status codes without leaking stack traces in production:

```typescript
import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  request.log.error(error);

  // Zod Validation Error (HTTP 400)
  if (error instanceof ZodError) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed',
      issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
    });
  }

  // Fastify Schema Validation Error
  if (error.validation) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: error.message
    });
  }

  // Known Business / Permission Error
  const statusCode = error.statusCode && error.statusCode >= 400 && error.statusCode < 600
    ? error.statusCode
    : 500;

  return reply.status(statusCode).send({
    statusCode,
    error: statusCode === 500 ? 'Internal Server Error' : error.name,
    message: statusCode === 500 && process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : error.message
  });
}
```

---

## 10. Alignment with Parallel M1 Tracks

1. **Alignment with M1 Explorer 2 (Prisma Schema & Database)**:
   - Toolchain includes `@prisma/client` and `prisma` CLI.
   - Database connection client (`src/config/database.ts`) is designed to host the multi-tenant Prisma extension created by M1 Explorer 2.
   - Script `npm.cmd run prisma:generate` will be executed immediately upon creation of `server/prisma/schema.prisma`.
2. **Alignment with M1 Explorer 3 (Calculation Engine & Test Suite)**:
   - Vitest test runner is configured to immediately execute `server/tests/calculationEngine.test.ts`.
   - `calculationEngine.ts` is purely decoupled from database and HTTP transport, enabling sub-10ms test runs.
3. **Contract Adherence**:
   - Implements interface contracts from `PROJECT.md` (`CalculationResult`, `TenantContext`, `AuditLogEntry`, `MigrationReconciliation`).

---

## 11. Implementation Action Checklist for Milestone 1 Implementers

1. [ ] Create directory `server/` with subfolders (`prisma/`, `src/config/`, `src/middleware/`, `src/services/`, `src/routes/`, `src/types/`, `tests/`).
2. [ ] Write `server/package.json` with the exact dependencies and scripts specified in Sections 5 & 7.
3. [ ] Write `server/tsconfig.json` and `server/vitest.config.ts`.
4. [ ] Run `npm.cmd install` inside `server/`.
5. [ ] Place multi-tenant schema in `server/prisma/schema.prisma` (from M1 Explorer 2 plan) and run `npm.cmd run prisma:generate`.
6. [ ] Implement `src/services/calculationEngine.ts` and `tests/calculationEngine.test.ts` (from M1 Explorer 3 plan).
7. [ ] Run `npm.cmd test` to verify 100% calculation test pass.
8. [ ] Implement `src/config/env.ts`, `src/middleware/errorHandler.ts`, and `src/index.ts`.
9. [ ] Run `npm.cmd run dev` to verify server boot and `/health` response.
