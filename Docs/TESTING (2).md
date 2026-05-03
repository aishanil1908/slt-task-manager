# SLT Task Management — Test Suite Guide

## Files Delivered

```
jest.config.js                        ← Jest configuration (backend)
playwright.config.js                  ← Playwright configuration (frontend)
tests/
  backend/
    setup.env.js                      ← Environment variables for Jest
    api.test.js                       ← All backend API tests (Jest + Supertest)
  frontend/
    dashboard.spec.js                 ← User dashboard UI tests (Playwright)
    admin.spec.js                     ← Admin panel UI tests (Playwright)
```

All files go **at the root of your backend project** (same level as `server.js`).

---

## 1. Backend Tests (Jest + Supertest)

### Install dependencies

```bash
npm install --save-dev jest supertest
```

### Run all backend tests

```bash
npx jest
```

### Run with coverage report

```bash
npx jest --coverage
```

### Run a specific test file

```bash
npx jest tests/backend/api.test.js
```

### What is tested

The database is **fully mocked** — you do NOT need a real PostgreSQL connection to run these.

| Group | Endpoints Covered |
|---|---|
| Auth | `GET /api/health`, `POST /api/login` (pilot + prod mode, errors), `POST /api/logout`, `GET /api/profile` |
| Config | `GET /api/verticals`, `GET /api/categories/:code`, `GET /api/natures/:code`, `GET /api/staff` |
| Dashboard | `GET /api/dashboard/summary`, `GET /api/dashboard/tasks/:status` (all 4 statuses + invalid), `GET /api/dashboard/verticals` |
| Tasks | `POST /api/tasks` (create, validation, subtasks), `GET /api/tasks/:id`, `PUT /api/tasks/:id/stage` (all actions), `POST /api/tasks/:id/proof`, `POST /api/tasks/:id/fulfillment`, `GET /api/tasks/:id/history` |
| Users | `GET /api/users`, `POST /api/users`, `GET /api/users/:id`, `GET /api/users/renewals/upcoming` |
| MIS | `GET /api/mis/counts`, `GET /api/mis/tasks/:code` (with txType filter) |
| Admin — Users | GET, POST, PUT, deactivate, activate, reset password |
| Admin — Job Profiles | GET, POST, PUT, duplicate check |
| Admin — Hierarchy | GET, POST (primary + secondary), DELETE, validation |
| Admin — Verticals | GET, POST, PUT (system guard), toggle |
| Admin — Categories | GET, POST, PUT (system guard), toggle |
| Admin — Natures | GET, POST, PUT (system/custom), toggle, FT/NFT validation |
| Security | 401 on all protected routes without token, 403 for non-System-Admin on /admin/*, 404 for unknown routes |

---

## 2. Frontend Tests (Playwright)

### Install dependencies

```bash
npm install --save-dev @playwright/test
npx playwright install chromium
```

### Run all frontend tests

```bash
npx playwright test
```

### Run with visible browser (for debugging)

```bash
npx playwright test --headed
```

### Run only dashboard tests

```bash
npx playwright test tests/frontend/dashboard.spec.js --headed
```

### Run only admin panel tests

```bash
npx playwright test tests/frontend/admin.spec.js --headed
```

### View HTML report after a run

```bash
npx playwright show-report
```

### What is tested

The backend API is **fully mocked via `page.route()`** — no server needs to be running.

#### `dashboard.spec.js` (slt-dashboard-v3.html)

| Group | Tests |
|---|---|
| Login Page | Renders correctly, logo, role selector, empty-username error, successful login, admin link, API error handling |
| Status Cards | All 4 cards visible, counts from API, clicking each card shows/hides task panel, close button |
| Vertical Cards | All 3 visible, clicking navigates to MIS page |
| Sidebar Nav | All menu items, active states, Dashboard/MIS/Users navigation, Pending/In Progress filters, logout, Settings toast |
| Create Task Modal | Opens from button, 6-step stepper flow (Vertical → Category → Nature → TX Type → Client → Assign), Back/Cancel buttons, full end-to-end submit |
| MIS Page | Visible after navigation, content renders, bubble click drill-down |
| Users Page | Create form fields, role dropdown, users grid, Create User API call |
| Task Detail Modal | Opens on row click, metadata sections, stages bar, close button |

#### `admin.spec.js` (slt-admin-panel.html)

| Group | Tests |
|---|---|
| Admin Login | Renders, badge, back link, successful login, wrong password error, non-sysadmin error, Enter key, user shown in top bar |
| Shell Layout | Top bar, logout, all 6 sidebar nav items, default active section, navigation between all sections |
| User Management | Table headers, users loaded, New User modal (open/close/cancel/fields/roles), Create User API call, search bar, action buttons |
| Job Profiles | Table headers, profiles loaded, New Profile modal (open/close/fields), Create Profile API call |
| Hierarchy | Section visible, Assign Manager modal (fields, priority options), API call, Cancel |
| Verticals | Table headers, data loaded, system badge, New Vertical modal (fields, API call), Cancel |
| Categories | Table headers, data loaded, New Product modal (all fields including PS Template dropdown), API call, Cancel |
| Transaction Types | Table headers, data loaded, New Transaction Type modal (all fields, FT/NFT toggles), toggle interaction, API call, Cancel |
| Master Data Wizard | Opens from sidebar, Step 1 visible, step indicator, Step 1→2 navigation, close button |

---

## Notes

- **Pilot Mode:** The backend tests set `PILOT_MODE=true` by default in `setup.env.js`. Tests that specifically check production-mode password behaviour temporarily set it to `false`.
- **File paths in Playwright:** Tests use `file://` URLs pointing to your HTML files. Make sure `slt-dashboard-v3.html` and `slt-admin-panel.html` are at the project root.
- **DB mocking strategy:** `query` from `../config/db` is mocked with `jest.mock()`. The auth middleware query (`SELECT id... FROM users WHERE id = $1`) is always resolved to return an active test user so protected routes work. Each test then adds its own `mockResolvedValueOnce` calls for route-specific data.
