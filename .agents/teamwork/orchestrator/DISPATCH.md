## 2026-10-31T19:33:46Z
From: c7973782-ce62-4b7c-8bf6-bcd933923c36
Content:
Use a full team (یه تیم کامل). Build a commercial SaaS-ready, multi-tenant building management platform with a world-class UI/UX featuring 3D elements, a 100% online real-time Node.js and PostgreSQL backend, hardened multi-tenant security, immutable audit logging, granular RBAC, resident portals, future-ready chat/AI foundations, and a fully tested computational core.

Working directory: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui
Integrity mode: development

## Requirements

### R1. World-Class UI/UX with 3D Elements & Resident Experience
Deliver a complete graphical refactor to world-class standards avoiding generic AI templates, featuring intuitive Persian RTL typography, modern component systems, friction-free manager workflows, and engaging 3D visual elements on key screens such as login and dashboard highlights. Provide dedicated interfaces for managers as well as a resident portal with a digital bulletin board, account statements, and payment views.

### R2. Multi-Tenant SaaS Architecture & Real-Time Backend
Build a 100% online, real-time backend using Node.js (Fastify or Express) with Prisma ORM and PostgreSQL. Implement strict multi-tenant data isolation per building/complex to enable commercial SaaS scalability, with lossless migration of existing IndexedDB and LocalStorage data into the new PostgreSQL schema. All reads and mutations must interact directly with the server in real-time.

### R3. Security Hardening, Tenant Isolation & Comprehensive Audit Logging
Enforce rigorous security hardening including secure authentication (JWT/session with Argon2 or Bcrypt hashing), strict tenant data isolation, input sanitization, rate limiting, and protection against CSRF, XSS, and SQL injection. Implement a comprehensive, immutable audit trail capturing all system events—including logins, financial transactions, CRUD mutations on units/residents/invoices, and permission modifications—with user identification, timestamps, and change deltas.

### R4. Role-Based Access Control (RBAC) & Future-Ready Foundation
Implement granular permission management allowing Super-Admins to configure sub-managers with specific, customizable module access rights. Architect the backend and state model with clean separation and extensibility hooks ready for real-time WebSocket communication (building chat) and AI-assisted payment receipt verification.

### R5. Business Logic, Calculation Audit, and Automated Testing
Perform a comprehensive audit and debugging of all building accounting logic, charge calculation formulas (fixed, variable, area-based, resident-count-based), expense distribution rules, resident debt/credit tracking, and financial statements. Create an automated test suite verifying all calculation rules and edge cases based on existing code logic and standard building accounting practices to guarantee 100% mathematical accuracy.

## Acceptance Criteria

### UI/UX & Resident Experience
- [ ] User interface displays a custom, world-class aesthetic with 3D elements on key pages (e.g. login), refined Persian typography, and zero generic AI template feel.
- [ ] Manager dashboard provides intuitive, friction-free navigation across financial, resident, and unit management.
- [ ] Resident portal allows tenants/owners to view their ledger, balance, statements, and building announcements via digital bulletin board.

### Multi-Tenant Architecture & Data Migration
- [ ] PostgreSQL schema and Prisma ORM enforce complete multi-tenant data segregation across buildings/organizations.
- [ ] Backend runs on Node.js (Fastify or Express) handling all queries and mutations in real-time without offline caching.
- [ ] Migration script imports existing local IndexedDB and LocalStorage data into the multi-tenant PostgreSQL schema with verified data integrity.

### Security & Audit Logging
- [ ] Authentication employs Argon2/Bcrypt password hashing and secure token/session handling with rate limiting enabled.
- [ ] Cross-tenant access tests confirm complete data isolation across different buildings and tenants.
- [ ] Audit log records every financial change, record mutation, login attempt, and permission adjustment with actor ID, timestamp, and change details.

### RBAC & Future-Ready Groundwork
- [ ] Super-Admin can define sub-managers with customizable, role-based permission sets.
- [ ] Architecture includes modular foundations and API contracts prepared for WebSocket chat and AI receipt verification integration.

### Logic and Calculation Verification
- [ ] Automated test suite verifies all building charge calculation modes (by area, occupants, fixed, or equal share).
- [ ] Expense allocations, payments, debts, and settlement reports produce zero rounding errors or mathematical discrepancies across all test scenarios.
- [ ] All identified computational and logic bugs are resolved and validated by test passes.


## 2026-11-01T13:29:35Z
From: 5e06427b-6332-4e68-9516-df1d31437294
Content:
Use a full team (یه تیم کامل). Build a commercial SaaS-ready, multi-tenant building management platform with a world-class UI/UX featuring 3D elements, a 100% online real-time Node.js and PostgreSQL backend, hardened multi-tenant security, immutable audit logging, granular RBAC, resident portals, future-ready chat/AI foundations, and a fully tested computational core.

Working directory: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui
Integrity mode: development

Requirements & Acceptance Criteria are fully specified in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md
and global project specifications in:
d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md

Current State & Resume Instructions:
1. M1 (Backend Foundation, PostgreSQL + Prisma schema, Core computational accounting engine) is fully completed and verified.
2. M2 (Security Hardening, Argon2id auth, 4-tier RBAC, dual-source tenant isolation, RFC 7807 problem details, rate limiting, and immutable audit logging) was remediated in commit `200d91c` and has passed all M2-R2 Gate agents (Reviewer 1 APPROVE, Challenger 1 APPROVE, Challenger 2 APPROVE, Auditor 1 CLEAN, with 107 server tests and 214 E2E tests passing). Update GATE_STATUS.md to reflect M2 PASS.
3. Resume execution through the remaining milestones per PROJECT.md:
   - Milestone 3: Lossless Data Migration & Real-Time REST/WebSocket API Integration (migrating local IndexedDB/LocalStorage data into PostgreSQL, wiring frontend stores to backend APIs).
   - Milestone 4: World-Class SaaS UI/UX, 3D Visual Elements & Dedicated Resident Portal.
   - Milestone 5: Final Acceptance (Full E2E suite pass, comprehensive accounting calculation verification, adversarial security audit).
4. Follow full team decomposition protocol: Explorers -> Worker -> Reviewers -> Challengers -> Auditor -> Gate evaluation.
5. Strict adherence to AGENTS.md / GEMINI.md git commit and push protocol on origin/main after every file modification.
6. Your working directory is `.agents/teamwork/orchestrator/`.
7. Your parent is Project Sentinel (`5e06427b-6332-4e68-9516-df1d31437294`). Report progress and gate transitions regularly.
