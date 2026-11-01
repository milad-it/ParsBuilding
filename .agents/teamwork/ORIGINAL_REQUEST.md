# Original User Request

## Approved Task Prompt — 2026-10-31T19:32:37Z

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


## Follow-up — 2026-11-01T13:27:18Z

حالا که سهمیه ها ازاد شد طبق روال قبل ادامه بدید.

Earlier approved task and project context:
"""
Use a full team (یه تیم کامل). Build a commercial SaaS-ready, multi-tenant building management platform with a world-class UI/UX featuring 3D elements, a 100% online real-time Node.js and PostgreSQL backend, hardened multi-tenant security, immutable audit logging, granular RBAC, resident portals, future-ready chat/AI foundations, and a fully tested computational core.

Working directory: d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui
Integrity mode: development

Progress State:
Milestones 1 and 2 (Server foundation, PostgreSQL + Prisma multi-tenant schema with strict complexId scoping, Argon2id auth, 4-tier RBAC, immutable audit logging, WebSocket bus, AI receipt verification queue, and 309 passing automated unit & adversarial tests) were fully implemented and committed/pushed to GitHub origin/main up to commit `200d91c`.
The previous run was interrupted by quota limits at the transition to Milestone 3.
Now resume and continue execution through Milestone 3 (Data Migration & Real-Time API integration), Milestone 4 (World-Class 3D UI/UX & Resident Portal), and Milestone 5 (Final Verification).
"""
