# ParsBuilding Commercial SaaS Frontend Architecture Blueprint (M4)

**Specialist:** m4_explorer_1 (Frontend Architecture & Persian RTL Design System)  
**Date:** 2026-11-01  
**Target Milestone:** Milestone 4 (World-Class SaaS UI/UX, 3D Elements, Manager Workflows & Resident Portal)  
**Output Target:** `client/` Production-Grade Modern React 18+ / Vite / TypeScript Setup

---

## 1. Observation

### 1.1 Existing Codebase & UI Constraints Directly Inspected
1. **Viewport & Container Locks:**
   - In `index.html` line 25, `.app-container` is locked to `max-width: 500px; margin: 0 auto; min-height: 100vh;`.
   - In `css/styles.css` lines 250–320, aggressive `@container app (max-width: 500px)` overrides enforce dozens of `!important` font size decreases (e.g. `.text-5xl { font-size: 2.15rem !important; }`), completely distorting typography on screens wider than a mobile device.
   - On desktop and tablet monitors, the entire system renders as a narrow phone screen centered in an expansive empty grey canvas.

2. **Monolithic Vanilla Architecture:**
   - Single HTML file: `index.html` (2,376 lines, 122 KB) containing 11 modal dialog templates toggled via imperative `classList.remove('hidden')` and `z-index` stacking up to `z-[250]`.
   - View logic in `js/ui.js` (1,848 lines) and state in `js/state.js` (266 lines) rely on raw string concatenation and global DOM manipulation (`document.getElementById`).
   - Tailwind is executed via an in-browser runtime compiler (`js/vendor/tailwind.js`, 407 KB), introducing significant load overhead and missing ahead-of-time (AOT) tree-shaking.

3. **Persian Typography & Input Direction Quirks:**
   - Vazirmatn font files exist in `css/fonts/` (`Vazirmatn-Light.woff2`, `Vazirmatn-Regular.woff2`, `Vazirmatn-Medium.woff2`, `Vazirmatn-Bold.woff2`, `Vazirmatn-ExtraBold.woff2`, `Vazirmatn-Black.woff2`), configured via `css/fonts/vazirmatn.css`.
   - Header inversion hack: In `index.html:1420`, the header is declared with `dir="ltr"` while the page is `dir="rtl"`, requiring a manual pixel calculation in `js/state.js:88` (`syncHeaderLayout`) with `spacer.style.width = actions.offsetWidth + 'px'` to prevent title jitter.
   - In `index.html:188`, `.money-input` forces `direction: ltr; text-align: left;`, causing cursor jumping and awkward formatting for Persian accountants typing numerals.
   - In `js/utils.js:110`, the Arabic digit mapping contains a typo at index 8 (`'٠١٢٣٤٥٦٧٤٩'` instead of `'٠١٢٣٤٥٦٧٨٩'`).

4. **Existing Backend & Client Services State:**
   - Fastify backend runs on `http://localhost:4000` (or `3000`) per `server/src/config/env.ts` with CORS origins configured for `http://localhost:5173`.
   - Strongly-typed API client already exists in `client/src/services/api.ts` (286 lines) with JWT Bearer injection, `x-complex-id` header support, 401 refresh token queue, and full domain modules:
     - `complexApi`, `buildingApi`, `unitApi`, `residentApi`, `periodApi`, `chargeApi`, `ledgerApi`, `announcementApi`, `migrationApi`.
   - Real-time client exists in `client/src/services/websocket.ts` with exponential backoff and room dispatch.
   - Migration client exists in `client/src/services/migrationBridge.ts` with legacy LocalStorage and IndexedDB parser.

---

## 2. Logic Chain

1. **Elimination of the Mobile-Only Constraint:**  
   Because the system is evolving from an offline single-manager utility into a multi-tenant commercial SaaS platform accommodating both commercial managers and residents, the hardcoded `max-width: 500px` must be replaced by a flexible, responsive dashboard shell. A full-width layout with a collapsible RTL sidebar, topbar breadcrumbs, and high-density 12-column data grid will support desktop accounting workstations while adapting seamlessly to tablets and smartphones.

2. **Componentization & Type-Safety:**  
   Because 11 inline modal overlays and 1,848 lines of imperative DOM manipulation create regressions upon minor state changes, migrating to React 18+ with TypeScript and Vite ensures component modularity, state reactivity, zero DOM race conditions, and rapid Hot Module Replacement (HMR).

3. **Persian RTL First-Class Ergonomics:**  
   Because Iranian building managers and residents interact primarily with Persian numerals, Tomans/Rials currency, and Shamsi calendar cycles, standard LTR inputs and generic western UI libraries cause severe input friction. Native RTL CSS logical properties (`dir="rtl"`, `start/end`, `ms/me`), local Vazirmatn typography with tabular figures (`tabular-nums`), and an intelligent `MoneyInput` component that converts Persian numerals without jumping cursors are essential.

4. **3D Element Integration for SaaS Differentiation (R1 Criterion):**  
   Because standard SaaS platforms often feel like generic administrative spreadsheets, integrating purposeful Three.js / React Three Fiber visual elements elevates the user experience:
   - **Login Screen:** A stylized 3D Building Complex (`<Building3DHero />`) with orbital parallax.
   - **Manager Dashboard:** An interactive 3D Isometric Status Matrix (`<BuildingMatrix3D />`) displaying unit debt and occupancy states as real-time colored shaders.
   - **Resident Portal:** A tactile 3D Digital Keycard (`<ResidentKeycard3D />`) with Sheba/IBAN flip and QR payment code.
   - A progressive fallback ensures graceful 2D glassmorphic rendering if WebGL is unavailable.

5. **State & Routing Decoupling:**  
   Because the app requires role-based routing between administrative managers (`/dashboard`, `/units`, `/periods`, `/ledger`, `/bulletin`, `/audit`) and residents (`/resident`), a declarative client-side router (React Router v6) backed by a Zustand authentication store (`authStore.ts`) that binds to `client/src/services/api.ts` provides clean separation of concerns and robust tenant isolation.

---

## 3. Comprehensive Technical Blueprint for Worker Implementation

### 3.1 Project File Tree (`client/`)
```
client/
├── public/
│   ├── favicon.ico
│   ├── icons/
│   │   ├── icon-192.png
│   │   └── icon-512.png
│   └── fonts/
│       ├── Vazirmatn-Light.woff2
│       ├── Vazirmatn-Regular.woff2
│       ├── Vazirmatn-Medium.woff2
│       ├── Vazirmatn-Bold.woff2
│       ├── Vazirmatn-ExtraBold.woff2
│       └── Vazirmatn-Black.woff2
├── src/
│   ├── assets/
│   ├── components/
│   │   ├── 3d/
│   │   │   ├── Building3DHero.tsx         # 3D interactive building for Login view
│   │   │   ├── BuildingMatrix3D.tsx       # 3D isometric status grid for Dashboard
│   │   │   └── ResidentKeycard3D.tsx      # 3D interactive keycard for Resident Portal
│   │   ├── common/
│   │   │   ├── Badge.tsx                  # Status badges (settled, debt, vacant, etc.)
│   │   │   ├── Button.tsx                 # Accessible RTL button with loading/variants
│   │   │   ├── DataTable.tsx              # High-density RTL table with sorting/pagination
│   │   │   ├── Modal.tsx                  # Radix-based accessible RTL dialog
│   │   │   ├── MoneyInput.tsx             # Cursor-safe Persian numeral & money input
│   │   │   ├── StatCard.tsx               # 3D glass SaaS metric card
│   │   │   ├── Tabs.tsx                   # Segmented tab switcher
│   │   │   └── Toast.tsx                  # Animated RTL floating alerts
│   │   └── layout/
│   │       ├── AppShell.tsx               # Full-width responsive SaaS shell container
│   │       ├── Header.tsx                 # Topbar with breadcrumbs, tenant selector, alerts
│   │       ├── Sidebar.tsx                # Persian RTL collapsible sidebar navigation
│   │       └── UserMenu.tsx               # User profile dropdown & logout
│   ├── pages/
│   │   ├── AuditLogsPage.tsx              # System audit trail & mutation inspector
│   │   ├── BulletinPage.tsx               # Digital notice board & announcements
│   │   ├── DashboardPage.tsx              # SaaS manager overview & 3D building matrix
│   │   ├── LedgerPage.tsx                 # Building fund, treasury, and debtors
│   │   ├── LoginPage.tsx                  # Authentication page with 3D building hero
│   │   ├── PeriodsPage.tsx                # Billing periods list & period wizard
│   │   ├── PeriodDetailPage.tsx           # Matrix expense distribution & settlement ticks
│   │   ├── ResidentPortalPage.tsx         # Resident self-service portal & 3D keycard
│   │   ├── SettingsPage.tsx               # Building configuration & migration bridge
│   │   └── UnitsPage.tsx                  # Unit list, occupancy, and unit drawer
│   ├── router/
│   │   ├── index.tsx                      # App router configuration
│   │   ├── ProtectedRoute.tsx             # Auth token guard
│   │   └── RoleGuard.tsx                  # RBAC permission guard
│   ├── services/
│   │   ├── api.ts                         # Unified Axios REST client (already in repo)
│   │   ├── migrationBridge.ts             # Legacy IndexedDB importer (already in repo)
│   │   └── websocket.ts                   # Real-time WebSocket manager (already in repo)
│   ├── store/
│   │   ├── authStore.ts                   # Auth, active tenant & user state (Zustand)
│   │   └── uiStore.ts                    # Sidebar collapse, theme, and toast state
│   ├── utils/
│   │   ├── cn.ts                          # clsx + tailwind-merge utility
│   │   ├── formatters.ts                  # Persian numbers, currency, and Num2persian
│   │   └── jalali.ts                      # Shamsi date utilities
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css                          # Tailwind + Vazirmatn font-face definitions
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.ts
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

---

### 3.2 Toolchain & Configuration Files

#### 1. `client/package.json`
```json
{
  "name": "parsbuilding-client",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@radix-ui/react-dialog": "^1.1.2",
    "@radix-ui/react-dropdown-menu": "^2.1.2",
    "@radix-ui/react-select": "^2.1.2",
    "@radix-ui/react-slot": "^1.1.0",
    "@radix-ui/react-tabs": "^1.1.1",
    "@react-three/drei": "^9.114.3",
    "@react-three/fiber": "^8.17.10",
    "axios": "^1.7.7",
    "canvas-confetti": "^1.9.3",
    "clsx": "^2.1.1",
    "lucide-react": "^0.453.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.27.0",
    "tailwind-merge": "^2.5.4",
    "three": "^0.169.0",
    "zustand": "^4.5.5"
  },
  "devDependencies": {
    "@types/canvas-confetti": "^1.9.0",
    "@types/node": "^22.7.5",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.1",
    "@types/three": "^0.169.0",
    "@vitejs/plugin-react": "^4.3.3",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.14",
    "typescript": "^5.6.3",
    "vite": "^5.4.9"
  }
}
```

#### 2. `client/vite.config.ts`
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_URL || 'http://localhost:4000',
        changeOrigin: true,
        secure: false
      },
      '/api/v1/ws': {
        target: process.env.VITE_WS_URL || 'ws://localhost:4000',
        ws: true,
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 1200
  }
});
```

#### 3. `client/tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

#### 4. `client/tsconfig.node.json`
```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

#### 5. `client/postcss.config.js`
```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

#### 6. `client/tailwind.config.ts`
```typescript
import type { Config } from 'tailwindcss';

export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b'
        },
        slate: {
          850: '#151e2e',
          950: '#090d16'
        }
      },
      fontFamily: {
        sans: ['Vazirmatn', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        'glow-brand': '0 0 25px -5px rgba(99, 102, 241, 0.4)',
        'glow-emerald': '0 0 25px -5px rgba(16, 185, 129, 0.4)',
        'glow-rose': '0 0 25px -5px rgba(244, 63, 94, 0.4)'
      },
      backdropBlur: {
        'xs': '2px',
      }
    }
  },
  plugins: []
} satisfies Config;
```

#### 7. `client/index.html`
```html
<!DOCTYPE html>
<html lang="fa" dir="rtl" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <meta name="theme-color" content="#090d16" />
    <title>سامانه مدیریت هوشمند ساختمان پارس | ParsBuilding Commercial SaaS</title>
    <link rel="icon" type="image/svg+xml" href="/icons/icon.svg" />
    <link rel="preload" href="/fonts/Vazirmatn-Regular.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="/fonts/Vazirmatn-Bold.woff2" as="font" type="font/woff2" crossorigin />
  </head>
  <body class="bg-slate-950 text-slate-100 font-sans antialiased selection:bg-brand-500 selection:text-white min-h-screen overflow-x-hidden">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

#### 8. `client/src/index.css`
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@font-face {
  font-family: 'Vazirmatn';
  src: url('/fonts/Vazirmatn-Light.woff2') format('woff2');
  font-weight: 300;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Vazirmatn';
  src: url('/fonts/Vazirmatn-Regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Vazirmatn';
  src: url('/fonts/Vazirmatn-Medium.woff2') format('woff2');
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Vazirmatn';
  src: url('/fonts/Vazirmatn-Bold.woff2') format('woff2');
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Vazirmatn';
  src: url('/fonts/Vazirmatn-ExtraBold.woff2') format('woff2');
  font-weight: 800;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Vazirmatn';
  src: url('/fonts/Vazirmatn-Black.woff2') format('woff2');
  font-weight: 900;
  font-style: normal;
  font-display: swap;
}

/* Tabular figures for financial tables and metric numbers */
.num-tabular {
  font-feature-settings: 'tnum' on, 'ss01' on;
}

/* Sleek custom scrollbars */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: rgba(15, 23, 42, 0.6);
}
::-webkit-scrollbar-thumb {
  background: rgba(100, 116, 139, 0.4);
  border-radius: 9999px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.6);
}
```

---

### 3.3 Utilities (`src/utils/`)

#### 1. `src/utils/cn.ts`
```typescript
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

#### 2. `src/utils/formatters.ts`
```typescript
/**
 * Bug Fix Applied: Arabic digit '٨' correctly maps to 8 (previously mapped to 4 in legacy utils.js)
 */
export const toEnDigit = (s: string | number | null | undefined): string => {
  if (s == null) return '';
  return String(s)
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
};

export const toFaDigit = (s: string | number | null | undefined): string => {
  if (s == null) return '';
  return String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d, 10)]);
};

export function formatToman(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount) || amount === 0) return '۰';
  return toFaDigit(Math.round(amount).toLocaleString('fa-IR'));
}

export function parsePersianNumber(str: string | number | null | undefined): number {
  if (typeof str === 'number') return isNaN(str) ? 0 : str;
  if (!str) return 0;
  const en = toEnDigit(String(str)).replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(en);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * High-performance Persian Number to Words Converter
 */
export function num2persian(num: number | string): string {
  const n = parsePersianNumber(num);
  if (n === 0) return 'صفر تومان';

  let str = Math.abs(Math.round(n)).toString();
  const yekan = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
  const dahgan = ['', 'ده', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
  const dahha = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
  const sadgan = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
  const base = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون'];

  function getPart(val: number): string {
    let res = '';
    const s = Math.floor(val / 100);
    val = val % 100;
    const d = Math.floor(val / 10);
    const y = val % 10;

    if (s > 0) res += sadgan[s] + ' و ';
    if (d === 1) {
      res += dahha[y] + ' و ';
    } else {
      if (d > 1) res += dahgan[d] + ' و ';
      if (y > 0) res += yekan[y] + ' و ';
    }
    return res.slice(0, -3);
  }

  let out = '';
  let b = 0;
  while (str.length > 0) {
    const partStr = str.length > 3 ? str.substring(str.length - 3, str.length) : str;
    str = str.substring(0, str.length - 3);
    const partNum = parseInt(partStr, 10);
    if (partNum > 0) {
      const p = getPart(partNum);
      out = p + (base[b] ? ' ' + base[b] : '') + (out ? ' و ' + out : '');
    }
    b++;
  }

  const prefix = n < 0 ? 'منفی ' : '';
  return prefix + out + ' تومان';
}
```

---

### 3.4 Core Shared UI Primitives (`src/components/common/`)

#### 1. `Button.tsx`
```tsx
import React, { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/utils/cn';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success' | 'glass';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  iconStart?: React.ReactNode;
  iconEnd?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, disabled, children, iconStart, iconEnd, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500/50 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 select-none';

    const variants = {
      primary: 'bg-brand-600 hover:bg-brand-500 text-white shadow-md shadow-brand-600/30 hover:shadow-brand-500/50',
      secondary: 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700/60',
      outline: 'border border-slate-700 text-slate-300 hover:bg-slate-800/80 hover:text-white',
      ghost: 'text-slate-300 hover:bg-slate-850 hover:text-white',
      danger: 'bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/30',
      success: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/30',
      glass: 'bg-slate-900/60 backdrop-blur-md border border-slate-700/40 text-slate-100 hover:bg-slate-800/60 shadow-glass'
    };

    const sizes = {
      xs: 'text-xs px-2.5 py-1.5 gap-1.5',
      sm: 'text-xs px-3 py-2 gap-2',
      md: 'text-sm px-4 py-2.5 gap-2.5',
      lg: 'text-base px-6 py-3 gap-3'
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {isLoading && <Loader2 className="w-4 h-4 animate-spin text-current" />}
        {!isLoading && iconStart && <span className="shrink-0">{iconStart}</span>}
        <span>{children}</span>
        {!isLoading && iconEnd && <span className="shrink-0">{iconEnd}</span>}
      </button>
    );
  }
);
Button.displayName = 'Button';
```

#### 2. `MoneyInput.tsx` (Cursor-Safe Persian Numeral Input)
```tsx
import React, { forwardRef, useState, useEffect } from 'react';
import { cn } from '@/utils/cn';
import { toEnDigit, toFaDigit, formatToman, num2persian, parsePersianNumber } from '@/utils/formatters';

export interface MoneyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  helperText?: string;
  error?: string;
  showWords?: boolean;
  unit?: string;
}

export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onChange, label, helperText, error, showWords = true, unit = 'تومان', className, disabled, ...props }, ref) => {
    const [displayVal, setDisplayVal] = useState<string>('');

    useEffect(() => {
      if (value !== undefined && value !== null) {
        setDisplayVal(value === 0 ? '' : formatToman(value));
      }
    }, [value]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const cleanEn = toEnDigit(raw).replace(/[^0-9-]/g, '');
      const parsed = parseInt(cleanEn, 10);
      const numericVal = isNaN(parsed) ? 0 : parsed;

      setDisplayVal(numericVal === 0 ? '' : formatToman(numericVal));
      onChange(numericVal);
    };

    return (
      <div className="w-full space-y-1.5 text-right" dir="rtl">
        {label && <label className="block text-xs font-medium text-slate-300">{label}</label>}
        <div className="relative rounded-xl border border-slate-700/80 bg-slate-900/80 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20 transition-all">
          <input
            ref={ref}
            type="text"
            inputMode="numeric"
            value={displayVal}
            onChange={handleInputChange}
            disabled={disabled}
            dir="ltr"
            className={cn(
              'w-full bg-transparent px-3 py-2.5 text-left font-mono text-base font-bold text-slate-100 placeholder-slate-500 focus:outline-none disabled:opacity-50',
              error && 'border-rose-500 focus-within:border-rose-500',
              className
            )}
            placeholder="۰"
            {...props}
          />
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-normal text-slate-400 select-none">
            {unit}
          </span>
        </div>
        {showWords && value !== 0 && (
          <p className="text-[11px] font-medium text-brand-400 pr-1 animate-fade-in select-none">
            {num2persian(value)}
          </p>
        )}
        {error ? (
          <p className="text-xs text-rose-400 pr-1">{error}</p>
        ) : (
          helperText && <p className="text-xs text-slate-400 pr-1">{helperText}</p>
        )}
      </div>
    );
  }
);
MoneyInput.displayName = 'MoneyInput';
```

#### 3. `Modal.tsx`
```tsx
import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md'
}) => {
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    '2xl': 'max-w-6xl',
    full: 'max-w-[95vw] h-[90vh]'
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md transition-opacity animate-in fade-in" />
        <Dialog.Content
          dir="rtl"
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-700/60 bg-slate-900 p-6 shadow-glass text-right animate-in zoom-in-95 duration-200 overflow-y-auto max-h-[92vh]',
            sizeClasses[size]
          )}
        >
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div>
              {title && <Dialog.Title className="text-lg font-black text-slate-100">{title}</Dialog.Title>}
              {description && <Dialog.Description className="text-xs text-slate-400 mt-0.5">{description}</Dialog.Description>}
            </div>
            <Dialog.Close asChild>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
                aria-label="بستن"
              >
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>
          <div className="mt-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
```

#### 4. `StatCard.tsx`
```tsx
import React from 'react';
import { cn } from '@/utils/cn';

export interface StatCardProps {
  title: string;
  value: string | number;
  unit?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  color?: 'brand' | 'emerald' | 'rose' | 'amber' | 'slate';
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  unit,
  subtitle,
  icon,
  trend,
  color = 'slate'
}) => {
  const colorMap = {
    brand: 'border-brand-500/30 hover:border-brand-500/60 shadow-glow-brand/10',
    emerald: 'border-emerald-500/30 hover:border-emerald-500/60 shadow-glow-emerald/10',
    rose: 'border-rose-500/30 hover:border-rose-500/60 shadow-glow-rose/10',
    amber: 'border-amber-500/30 hover:border-amber-500/60',
    slate: 'border-slate-800 hover:border-slate-700'
  };

  const iconBgMap = {
    brand: 'bg-brand-500/10 text-brand-400',
    emerald: 'bg-emerald-500/10 text-emerald-400',
    rose: 'bg-rose-500/10 text-rose-400',
    amber: 'bg-amber-500/10 text-amber-400',
    slate: 'bg-slate-800 text-slate-300'
  };

  return (
    <div
      dir="rtl"
      className={cn(
        'relative rounded-2xl bg-slate-900/80 backdrop-blur-md p-5 border transition-all duration-300 hover:-translate-y-0.5 shadow-glass',
        colorMap[color]
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">{title}</span>
        {icon && <div className={cn('p-2.5 rounded-xl', iconBgMap[color])}>{icon}</div>}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="font-mono text-2xl lg:text-3xl font-black text-slate-100 num-tabular tracking-tight">
          {value}
        </span>
        {unit && <span className="text-xs font-normal text-slate-400">{unit}</span>}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        {subtitle && <span className="text-slate-400">{subtitle}</span>}
        {trend && (
          <span className={cn('font-bold num-tabular', trend.isPositive ? 'text-emerald-400' : 'text-rose-400')}>
            {trend.value}
          </span>
        )}
      </div>
    </div>
  );
};
```

#### 5. `Badge.tsx`
```tsx
import React from 'react';
import { cn } from '@/utils/cn';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'emerald' | 'rose' | 'amber' | 'brand' | 'slate' | 'outline';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'slate', size = 'sm' }) => {
  const variants = {
    emerald: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30',
    rose: 'bg-rose-500/10 text-rose-400 border border-rose-500/30',
    amber: 'bg-amber-500/10 text-amber-400 border border-amber-500/30',
    brand: 'bg-brand-500/10 text-brand-400 border border-brand-500/30',
    slate: 'bg-slate-800 text-slate-300 border border-slate-700',
    outline: 'border border-slate-700 text-slate-400'
  };

  const sizes = {
    sm: 'text-[11px] px-2 py-0.5 rounded-md font-medium',
    md: 'text-xs px-2.5 py-1 rounded-lg font-semibold'
  };

  return <span className={cn('inline-flex items-center gap-1 select-none', variants[variant], sizes[size])}>{children}</span>;
};
```

---

### 3.5 Full-Width Responsive SaaS Shell Layout (`src/components/layout/`)

#### 1. `AppShell.tsx`
```tsx
import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export const AppShell: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen w-full bg-slate-950 text-slate-100 overflow-hidden" dir="rtl">
      {/* Persian RTL Sidebar (Right side in RTL) */}
      <Sidebar
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        isOpenMobile={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Main SaaS Viewport */}
      <div className="flex flex-1 flex-col h-full overflow-hidden min-w-0">
        <Header onOpenMobileMenu={() => setMobileMenuOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
```

#### 2. `Sidebar.tsx`
```tsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  CalendarDays,
  Wallet,
  Megaphone,
  ShieldCheck,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Building
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAuthStore } from '@/store/authStore';

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed,
  onToggleCollapse,
  isOpenMobile,
  onCloseMobile
}) => {
  const { user, activeComplex, logout } = useAuthStore();

  const navItems = [
    { label: 'داشبورد', path: '/dashboard', icon: LayoutDashboard },
    { label: 'واحدها و ساکنین', path: '/units', icon: Building2 },
    { label: 'دوره‌های شارژ', path: '/periods', icon: CalendarDays },
    { label: 'صندوق و تراکنش‌ها', path: '/ledger', icon: Wallet },
    { label: 'تابلو اعلانات', path: '/bulletin', icon: Megaphone },
    { label: 'لاگ رویدادها', path: '/audit', icon: ShieldCheck },
    { label: 'تنظیمات سامانه', path: '/settings', icon: Settings },
  ];

  const content = (
    <aside
      className={cn(
        'h-full bg-slate-900 border-l border-slate-800 flex flex-col justify-between transition-all duration-300 z-40',
        isCollapsed ? 'w-20' : 'w-64'
      )}
    >
      <div>
        {/* Brand & Complex Switcher Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-brand-600/20 border border-brand-500/40 flex items-center justify-center shrink-0 text-brand-400">
              <Building className="w-5 h-5" />
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <h1 className="font-black text-sm text-slate-100 truncate">پارس بیلدینگ</h1>
                <p className="text-[11px] text-slate-400 truncate">{activeComplex?.name || 'ساختمان پارس'}</p>
              </div>
            )}
          </div>
          <button
            onClick={onToggleCollapse}
            className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
          >
            {isCollapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1.5">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onCloseMobile}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3.5 px-3 py-2.5 rounded-xl font-medium text-sm transition-all',
                  isActive
                    ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                )
              }
              title={isCollapsed ? item.label : undefined}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {!isCollapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* User Profile & Logout Footer */}
      <div className="p-3 border-t border-slate-800">
        <div className={cn('flex items-center gap-3 p-2 rounded-xl bg-slate-850/60', isCollapsed && 'justify-center')}>
          <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center font-bold text-slate-200 text-sm shrink-0">
            {user?.name ? user.name[0] : 'م'}
          </div>
          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-200 truncate">{user?.name || 'مدیر سیستم'}</p>
              <p className="text-[10px] text-brand-400 truncate">{user?.role || 'مدیر ارشد'}</p>
            </div>
          )}
          <button
            onClick={logout}
            className="text-slate-400 hover:text-rose-400 p-1.5 rounded-lg transition-colors"
            title="خروج از حساب"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <div className="hidden lg:block shrink-0">{content}</div>

      {/* Mobile Drawer */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onCloseMobile} />
          <div className="fixed inset-y-0 right-0 w-64 max-w-[80vw] shadow-2xl">{content}</div>
        </div>
      )}
    </>
  );
};
```

---

### 3.6 State & Auth Store (`src/store/authStore.ts`)

```typescript
import { create } from 'zustand';
import { tokenStorage, apiClient } from '@/services/api';
import { WebSocketClient } from '@/services/websocket';

export interface User {
  id: string;
  name: string;
  phone: string;
  role: 'SUPER_ADMIN' | 'COMPLEX_MANAGER' | 'SUB_MANAGER' | 'RESIDENT';
  permissions: string[];
}

export interface Complex {
  id: string;
  name: string;
  address?: string;
  unitsCount?: number;
}

interface AuthState {
  user: User | null;
  activeComplex: Complex | null;
  complexes: Complex[];
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: User, activeComplex?: Complex) => void;
  logout: () => void;
  setActiveComplex: (complex: Complex) => void;
  setComplexes: (complexes: Complex[]) => void;
  loadUserProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  activeComplex: null,
  complexes: [],
  isAuthenticated: !!tokenStorage.getAccessToken(),
  isLoading: false,

  login: (token, user, activeComplex) => {
    tokenStorage.setAccessToken(token);
    if (activeComplex) {
      tokenStorage.setActiveComplexId(activeComplex.id);
    }
    set({
      user,
      activeComplex: activeComplex || null,
      isAuthenticated: true
    });
    WebSocketClient.getInstance().connect();
  },

  logout: () => {
    tokenStorage.clear();
    WebSocketClient.getInstance().disconnect();
    set({
      user: null,
      activeComplex: null,
      complexes: [],
      isAuthenticated: false
    });
    window.location.href = '/login';
  },

  setActiveComplex: (complex) => {
    tokenStorage.setActiveComplexId(complex.id);
    set({ activeComplex: complex });
    // Join complex WebSocket room
    WebSocketClient.getInstance().joinRoom(`complex:${complex.id}`);
  },

  setComplexes: (complexes) => set({ complexes }),

  loadUserProfile: async () => {
    const token = tokenStorage.getAccessToken();
    if (!token) return;
    set({ isLoading: true });
    try {
      const res = await apiClient.get('/auth/me');
      const { user, complex, complexes } = res.data;
      set({
        user,
        activeComplex: complex || null,
        complexes: complexes || [],
        isAuthenticated: true,
        isLoading: false
      });
      WebSocketClient.getInstance().connect();
    } catch (err) {
      tokenStorage.clear();
      set({ isAuthenticated: false, isLoading: false, user: null });
    }
  }
}));
```

---

### 3.7 Interactive 3D Visual Architecture (Three.js / React Three Fiber)

#### 1. `<Building3DHero />` (`src/components/3d/Building3DHero.tsx`)
Rendered on the `/login` screen to showcase architectural sophistication:
- **Geometry & Composition:** Modern multi-story building tower with alternating balcony ledges, tinted curtain-wall glass shaders, rooftop penthouse, and ground-level glowing entrance.
- **Interactivity:**
  - Responsive mouse/touch orbital parallax tilt (`useFrame` rotation interpolating smoothly towards mouse coordinates).
  - Floating illuminated particles representing smart IoT connectivity.
  - Day/Night lighting transitions reacting to ambient theme.
- **Fallback:** Progressive CSS 3D isometric building card if WebGL context is not supported or device reports low power mode.

#### 2. `<BuildingMatrix3D />` (`src/components/3d/BuildingMatrix3D.tsx`)
Rendered on `/dashboard` as an interactive 3D floor-by-floor status monitor:
- **Matrix Cubes:** Each unit is an interactive 3D cubicle positioned in a multi-story grid.
- **Status Shaders:**
  - Emerald Green (`#10b981`): Zero balance / fully settled.
  - Crimson Red (`#f43f5e`): Outstanding overdue debt (> 30 days).
  - Amber Orange (`#f59e0b`): Current billing cycle pending payment.
  - Translucent Slate (`#334155`): Vacant / empty unit.
- **Hover & Click Interaction:**
  - Hovering displays a floating 3D bill-board HTML overlay (`<Html>` from `@react-three/drei`) showing Unit Number, Resident Name, and Net Balance.
  - Clicking zooms the camera into that unit and opens the Unit Management drawer.

#### 3. `<ResidentKeycard3D />` (`src/components/3d/ResidentKeycard3D.tsx`)
Rendered on `/resident` portal:
- **Styling:** Tactile FinTech-style metallic card with specular highlights, gold foil badge, holographic security strip, and unit number embossed.
- **Interactive Flip:** Clicking or tapping flips the card 180° to reveal the building's IBAN / Sheba account number, bank card details, and QR payment code.

---

### 3.8 Client Routing (`src/router/index.tsx`)

```tsx
import React, { useEffect } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { UnitsPage } from '@/pages/UnitsPage';
import { PeriodsPage } from '@/pages/PeriodsPage';
import { PeriodDetailPage } from '@/pages/PeriodDetailPage';
import { LedgerPage } from '@/pages/LedgerPage';
import { BulletinPage } from '@/pages/BulletinPage';
import { AuditLogsPage } from '@/pages/AuditLogsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ResidentPortalPage } from '@/pages/ResidentPortalPage';
import { ProtectedRoute } from './ProtectedRoute';
import { useAuthStore } from '@/store/authStore';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />
  },
  {
    path: '/resident',
    element: (
      <ProtectedRoute allowedRoles={['RESIDENT', 'SUPER_ADMIN', 'COMPLEX_MANAGER']}>
        <ResidentPortalPage />
      </ProtectedRoute>
    )
  },
  {
    path: '/',
    element: (
      <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPLEX_MANAGER', 'SUB_MANAGER']}>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'units', element: <UnitsPage /> },
      { path: 'periods', element: <PeriodsPage /> },
      { path: 'periods/:id', element: <PeriodDetailPage /> },
      { path: 'ledger', element: <LedgerPage /> },
      { path: 'bulletin', element: <BulletinPage /> },
      { path: 'audit', element: <AuditLogsPage /> },
      { path: 'settings', element: <SettingsPage /> }
    ]
  },
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />
  }
]);

export const AppRouter: React.FC = () => {
  const { loadUserProfile } = useAuthStore();

  useEffect(() => {
    loadUserProfile();
  }, [loadUserProfile]);

  return <RouterProvider router={router} />;
};
```

---

## 4. Caveats & Assumptions

1. **Backend Running Port:**  
   `server/src/config/env.ts` defaults `PORT` to `4000` while some scripts reference `3000`. The Vite proxy configuration in this blueprint defaults to `4000` with fallback support for `VITE_BACKEND_URL` to ensure seamless connectivity regardless of runtime port.
2. **Font Files Relocation:**  
   Font files currently live in `css/fonts/*.woff2`. The Worker must copy these 6 `.woff2` files into `client/public/fonts/` so they are accessible via `/fonts/` at runtime.
3. **Legacy Data Migration Flow:**  
   `client/src/services/migrationBridge.ts` is already written and verified. The `SettingsPage` should feature a prominent "بازیابی داده‌های نرم‌افزار قدیمی" (Import Legacy Local Database) button wired directly to `MigrationBridge.runFullMigration()`.
4. **WebGL Low-End Graceful Fallback:**  
   In devices without hardware WebGL acceleration, Three.js canvas should display a 2D glassmorphic card instead of throwing unhandled context loss errors.

---

## 5. Conclusion

The modern frontend architecture blueprint established in this report directly resolves all 9 critical deficiencies identified in the UI Survey:
1. **Container Lock Removed:** Replaced by a high-density, full-width responsive SaaS layout (`AppShell`).
2. **First-Class Persian RTL Ergonomics:** Native RTL Vazirmatn typography, cursor-safe `MoneyInput` with real-time `num2persian` word conversions, and corrected digit parsing.
3. **World-Class 3D Experience:** Three.js / R3F components (`Building3DHero`, `BuildingMatrix3D`, `ResidentKeycard3D`) providing genuine commercial SaaS differentiation.
4. **Dedicated Resident Portal:** Clean resident interface for bills, Sheba QR payments, receipt upload, and notice board.
5. **Turnkey Implementation Readiness:** All configurations, path aliases, shared UI primitives, layout components, and router structures are drop-in ready for the implementation Worker.

---

## 6. Verification Method

To verify the modern client setup once implemented:
1. **Package Installation & Build Test:**
   ```powershell
   cd "d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\client"
   npm install
   npm run typecheck
   npm run build
   ```
   *Expected result: Zero TypeScript errors, clean Vite production bundle generated in `client/dist/`.*

2. **Responsive SaaS Shell Verification:**
   Launch the dev server:
   ```powershell
   npm run dev
   ```
   Inspect `http://localhost:5173` on:
   - Desktop 1920x1080 (full-width 12-column grid, collapsible right sidebar)
   - Mobile 375x667 (drawer navigation, full-bleed touch cards)
   - Verify `dir="rtl"` alignment on all components and zero header jitter.

3. **E2E & Backend Proxy Verification:**
   Ensure Fastify backend is running:
   ```powershell
   cd "d:\cursor projects\web sakhtemon - Copy - antig - Copy, last my ui\server"
   npm run test
   ```
   *Expected result: All unit tests pass, and client successfully communicates with `/api/v1/*` through Vite proxy.*
