# SLT Task Manager — Testing Guide

## What's in here

| File | What it does |
|------|-------------|
| `tests/api.test.js` | Jest — tests all 27 backend API endpoints |
| `tests/frontend.spec.js` | Playwright — tests the dashboard in a real browser |
| `jest.config.js` | Jest settings |
| `playwright.config.js` | Playwright settings |

---

## STEP 1 — Install test dependencies

Open a terminal in your project root folder (`D:\financial-task-manager\`):

```
npm install
```

This installs `jest` and `node-fetch` (needed for API tests).

Then install the Playwright browser (one-time only):

```
npx playwright install chromium
```

---

## STEP 2 — Start your backend server

In a separate terminal window:

```
cd backend
node server.js
```

You should see:
```
✅ Database connected — slt_taskmanager
Server running on http://localhost:5000
```

**Both test suites need the server running.**

---

## STEP 3 — Run the API tests (Jest)

```
npm run test:api
```

This tests all 27 backend endpoints automatically. Takes about 30-60 seconds.

**What you'll see:**

```
✓ Auth Endpoints
  ✓ GET /health — server is online
  ✓ POST /login — valid username returns token
  ✓ POST /login — employee login (riddhi) works
  ✓ POST /login — unknown username returns 401
  ...

✓ Dashboard Endpoints
  ✓ GET /dashboard/summary — returns 4 status counts
  ✓ GET /dashboard/tasks/pending — returns pending list
  ...

✓ MIS Endpoints
  ✓ GET /mis/counts — returns counts (GROUP BY fix confirmed)
  ...

Tests: 35 passed, 0 failed
```

---

## STEP 4 — Run the Frontend tests (Playwright)

First, update the file path in `tests/frontend.spec.js` line 20:

```js
const FRONTEND_URL = 'file:///D:/financial-task-manager/frontend/slt-dashboard-v3.html';
```

Change `D:/financial-task-manager/` to wherever your project folder is.

Then run:

```
npm run test:frontend
```

This opens Chrome, logs in, clicks through the dashboard, and checks everything works.

**What you'll see:** A real Chrome window opening and doing things automatically.

---

## STEP 5 — Run both together

```
npm run test:all
```

---

## Understanding test results

### ✅ PASS — Everything working
```
✓ GET /mis/counts — returns task counts per category (fixed GROUP BY bug)
```

### ❌ FAIL — Something broken
```
✗ GET /dashboard/summary — returns 4 status counts
  Expected: 200
  Received: 500
```
This tells you exactly which endpoint broke and what the expected vs actual response was.

---

## Common issues

**"Cannot connect to localhost:5000"**
→ Your backend server is not running. Run `cd backend && node server.js` first.

**"User shanil not found"**
→ Database is not connected or test users were deleted. Check pgAdmin.

**Playwright "Target closed" error**
→ Update `FRONTEND_URL` in `frontend.spec.js` to the correct path on your machine.

**Jest "Cannot find module 'node-fetch'"**
→ Run `npm install` in the project root first.

---

## What each test suite covers

### Jest (API Tests) — 35 tests across 7 groups
1. **Auth** — login, logout, profile, error cases
2. **Config** — verticals, categories, natures, staff dropdowns
3. **Dashboard** — summary counts, all 4 task panels, verticals
4. **MIS** — category counts (GROUP BY fix), task filtering by txType
5. **Tasks** — create, read, stage transitions, validation errors
6. **Users** — list, create, single user, renewals, duplicate check
7. **Security** — all protected routes reject missing/fake tokens

### Playwright (Frontend Tests) — 18 tests across 5 groups
1. **Login Screen** — page loads, valid login, wrong username, empty field
2. **Dashboard Overview** — 4 status cards visible, snapshot values are numbers
3. **Task Panels** — all 4 panels load (renderPanel bug fix confirmed)
4. **MIS Bubbles** — vertical section visible, labels present
5. **Logout** — returns to login screen
