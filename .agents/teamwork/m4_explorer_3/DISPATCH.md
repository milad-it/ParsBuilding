# Dispatch: M4 Explorer 3 (Manager Workflows, Resident Portal & Real-Time APIs)

- **Archetype**: `teamwork_explorer`
- **Role**: Domain Workflows & Real-Time Integration Specialist
- **Working Directory**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m4_explorer_3\`
- **Original Request**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\ORIGINAL_REQUEST.md`
- **Project Scope**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\PROJECT.md`
- **API Client Code**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\client\src\services\api.ts`
- **WebSocket Client Code**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\client\src\services\websocket.ts`
- **Legacy Logic & Views**: `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\js\logic.js`, `js\ui.js`, `js\reports.js`

## Mission & Investigation Focus
Investigate and design complete blueprints for friction-free manager workflows and the dedicated resident portal, wiring directly to backend REST endpoints and WebSocket live events:
1. **Manager Workflows**:
   - **Dashboard Overview**: Key metrics (Total treasury fund, total outstanding debt, collection rate %, active period status, unit occupancy status).
   - **Unit & Resident Management**: Interactive units grid/table with quick balance status, resident contact cards, unit details modal (area, occupants, package, owner vs tenant).
   - **Expense Entry & Period Management**:
     - Period creation modal with standard Iranian building expense items (fixed base, water, gas, electricity, incidental, area-based shared, custom units).
     - Calculation preview showing real-time share breakdown per unit before publishing.
     - Period lifecycle: Draft -> Publish (activates period, notifications) -> Close (reconciles payments, debits charges, updates treasury).
   - **Payment Recording & Treasury**: Quick payment dialog with card-to-card, bank transfer, or cash recording, automatic unit credit update, and treasury balance adjustment.
   - **Financial Ledger & Audit Trail**: Tabular ledger view filtering by unit/type/date, and live audit log viewer for super-admin/manager.
2. **Dedicated Resident Portal (`/resident`)**:
   - Resident view with clean, modern layout tailored for mobile/desktop residents:
     - Digital Bulletin Board: Building announcements, notices, general assembly meetings with pin and date.
     - Personal Statement & Ledger: Current balance (Green credit / Red debt), historical charge breakdown per period, payments history with receipt download/share.
     - Online Payment View: "Pay Balance" modal with simulated payment gateway / card-to-card submission.
     - Live Chat / Community channel foundation (WebSocket room `complex:{id}`).
3. **Real-Time WebSocket Integration**:
   - Live updates on payment recording, period publishing, and announcement broadcast using `websocket.ts`.
4. **Output Requirements**:
   - Write your comprehensive workflow blueprint report to:
     `d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\.agents\teamwork\m4_explorer_3\handoff.md`
   - Provide complete component schemas, data fetching hooks, and UI interaction flows ready for the Worker.
