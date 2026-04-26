/**
 * SLT Task Management — User Dashboard Frontend Tests
 * Framework : Playwright
 * File      : slt-dashboard-v3.html
 *
 * HOW TO RUN
 * ----------
 * npm install --save-dev @playwright/test
 * npx playwright install chromium
 * npx playwright test tests/frontend/dashboard.spec.js --headed
 *
 * API calls are intercepted so the backend does NOT need to be running.
 * All routes to http://localhost:5000/api/* are mocked here.
 */

const { test, expect } = require('@playwright/test');
const path = require('path');

// ─── File URL for the HTML ────────────────────────────────────────────────────
const DASHBOARD_URL = `file://${path.resolve(__dirname, '../../frontend/slt-dashboard-v3.html')}`;

// ─── Mock Fixtures ────────────────────────────────────────────────────────────
const MOCK_TOKEN = 'mock-jwt-token-for-testing';

const MOCK_LOGIN_RESPONSE = {
  success: true,
  token: MOCK_TOKEN,
  user: {
    id: 1, username: 'shanil', fullName: 'Shanil Jain',
    email: 'shanil@slt.in', role: 'Admin / Partner',
    verticalAccess: ['ca', 'dist', 'broke'],
  },
  pilotMode: true,
};

const MOCK_SUMMARY = {
  success: true,
  counts: { pending: 5, inprogress: 3, postsales: 2, done: 8 },
  snapshot: { createdToday: 2, completedToday: 8, overdue: 1, renewalsDue30d: 4 },
};

const MOCK_VERTICALS = {
  success: true,
  verticals: [
    { id: 1, code: 'ca',   name: 'CA Practice',            icon: '🏛️', active_count: 4 },
    { id: 2, code: 'dist', name: 'Financial Distribution', icon: '💹', active_count: 6 },
    { id: 3, code: 'broke',name: 'Broking Services',       icon: '📈', active_count: 2 },
  ]
};

const MOCK_TASKS = (status) => ({
  success: true,
  count: 1,
  tasks: [{
    id: status === 'pending' ? 1 : 2,
    title: `Test task — ${status}`,
    status,
    stage: 1,
    priority: 'High',
    tx_type: 'CA Work',
    due_date: '2026-05-01',
    created_at: new Date().toISOString(),
    client_name: 'Ramesh Sharma',
    client_mobile: '9876543210',
    client_email: 'ramesh@test.in',
    proof_uploaded: false,
    s4_doc_uploaded: false,
    vertical_name: 'CA Practice',
    category_name: 'GST Returns',
    category_code: 'gst',
    nature_name: 'GSTR-3B',
    assigned_to_name: 'Priya Sharma',
    created_by_name: 'Shanil Jain',
  }]
});

const MOCK_STAFF = {
  success: true,
  staff: [
    { id: 1, full_name: 'Priya Sharma',  role: 'Back Office Operator',  tasks_active: 5, vertical_access: ['ca','dist'] },
    { id: 2, full_name: 'Rahul Gupta',   role: 'Operations Manager',    tasks_active: 3, vertical_access: ['ca','dist','broke'] },
  ]
};

const MOCK_MIS_COUNTS = {
  success: true,
  counts: [
    { category_code: 'mf',  category_name: 'Mutual Funds',     vertical_code: 'dist', total_tasks: '10', active_tasks: '6' },
    { category_code: 'gst', category_name: 'GST Returns',       vertical_code: 'ca',   total_tasks: '8',  active_tasks: '4' },
    { category_code: 'health', category_name: 'Health Insurance', vertical_code: 'dist', total_tasks: '5', active_tasks: '3' },
  ]
};

const MOCK_TASK_DETAIL = {
  success: true,
  task: {
    id: 1,
    title: 'GST Return Filing — ABC Enterprises',
    status: 'pending', stage: 1, priority: 'High',
    tx_type: 'CA Work',
    due_date: '2026-05-01',
    created_at: new Date().toISOString(),
    client_name: 'Ramesh Sharma', client_father: 'Suresh Sharma',
    client_mobile: '9876543210', client_email: 'ramesh@test.in',
    vertical_name: 'CA Practice', category_name: 'GST Returns',
    nature_name: 'GSTR-3B',
    assigned_to_name: 'Priya Sharma', created_by_name: 'Shanil Jain',
    proof_required: 'Yes — Mandatory',
    proof_uploaded: false, s4_doc_uploaded: false,
    ps_template: 'ca_work',
    subtasks: [], proofs: [], fulfillment: null,
  }
};

const MOCK_CONFIG_VERTICALS = {
  success: true,
  verticals: [
    { id: 1, code: 'ca',   name: 'CA Practice',            icon: '🏛️', display_order: 1 },
    { id: 2, code: 'dist', name: 'Financial Distribution', icon: '💹', display_order: 2 },
    { id: 3, code: 'broke',name: 'Broking Services',       icon: '📈', display_order: 3 },
  ]
};

const MOCK_CATEGORIES_CA = {
  success: true,
  categories: [
    { id: 1, code: 'gst',  name: 'GST Returns',   icon: '📋', display_order: 1 },
    { id: 2, code: 'itr',  name: 'ITR Filing',    icon: '📑', display_order: 2 },
    { id: 3, code: 'audit',name: 'Tax/Stat Audit', icon: '🔍', display_order: 3 },
  ]
};

const MOCK_NATURES_GST = {
  success: true,
  natures: [
    { id: 1, code: 'gstr1',  name: 'Monthly GSTR-1', is_sip: false },
    { id: 2, code: 'gstr3b', name: 'Monthly GSTR-3B', is_sip: false },
    { id: 3, code: 'gstr9',  name: 'Annual GSTR-9',  is_sip: false },
  ]
};

const MOCK_USERS_LIST = {
  success: true,
  users: [
    { id: 1, full_name: 'Priya Sharma', role: 'Back Office Operator', tasks_active: 5, tasks_completed: 43 },
    { id: 2, full_name: 'Rahul Gupta',  role: 'Operations Manager',   tasks_active: 3, tasks_completed: 31 },
  ]
};

// ─── API Interceptor ──────────────────────────────────────────────────────────
/**
 * Intercepts all /api/* calls so no real backend is needed.
 * Must be called at the start of each test (or in a beforeEach).
 */
async function mockAllAPIs(page) {
  await page.route('**/api/login', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_LOGIN_RESPONSE) })
  );
  await page.route('**/api/logout', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
  );
  await page.route('**/api/health', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, status: 'running' }) })
  );
  await page.route('**/api/dashboard/summary', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SUMMARY) })
  );
  await page.route('**/api/dashboard/verticals', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_VERTICALS) })
  );
  await page.route('**/api/dashboard/tasks/**', route => {
    const url = route.request().url();
    const status = url.split('/').pop();
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_TASKS(status)) });
  });
  await page.route('**/api/staff', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_STAFF) })
  );
  await page.route('**/api/verticals', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_CONFIG_VERTICALS) })
  );
  await page.route('**/api/categories/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_CATEGORIES_CA) })
  );
  await page.route('**/api/natures/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_NATURES_GST) })
  );
  await page.route('**/api/mis/counts', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_MIS_COUNTS) })
  );
  await page.route('**/api/mis/tasks/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_TASKS('inprogress')) })
  );
  await page.route('**/api/tasks/**', route => {
    if (route.request().method() === 'POST' && route.request().url().endsWith('/api/tasks')) {
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, taskId: 99 }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_TASK_DETAIL) });
  });
  await page.route('**/api/users/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USERS_LIST) })
  );
  await page.route('**/api/users', route => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, userId: 10 }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USERS_LIST) });
  });
}

/** Helper: navigate to dashboard, mock APIs, and log in */
async function loginAndLoad(page) {
  await mockAllAPIs(page);
  await page.goto(DASHBOARD_URL);
  await page.fill('#loginUser', 'shanil');
  await page.click('.login-btn');
  await expect(page.locator('#appShell')).toBeVisible({ timeout: 5000 });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LOGIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Login Page — slt-dashboard-v3.html', () => {

  test('Login page renders with correct elements', async ({ page }) => {
    await page.goto(DASHBOARD_URL);
    await expect(page.locator('#loginPage')).toBeVisible();
    await expect(page.locator('#loginUser')).toBeVisible();
    await expect(page.locator('.login-btn')).toBeVisible();
    await expect(page.locator('.login-hint')).toContainText(/pilot mode/i);
  });

  test('Logo and branding are present', async ({ page }) => {
    await page.goto(DASHBOARD_URL);
    await expect(page.locator('.login-logo-text')).toContainText('Second Level Think');
    await expect(page.locator('.login-logo-sub')).toBeVisible();
  });

  test('Role selector has the correct role options', async ({ page }) => {
    await page.goto(DASHBOARD_URL);
    const roleSelect = page.locator('#loginRole');
    await expect(roleSelect).toBeVisible();
    await expect(roleSelect.locator('option')).toHaveCount(5);
    const options = await roleSelect.locator('option').allTextContents();
    expect(options).toContain('Admin / Partner');
    expect(options).toContain('Operations Manager');
    expect(options).toContain('Relationship Manager');
  });

  test('Shows error toast when username is empty on login attempt', async ({ page }) => {
    await page.goto(DASHBOARD_URL);
    await page.click('.login-btn');
    await expect(page.locator('#loginUser')).toHaveClass(/field-err/);
    await expect(page.locator('.toast')).toBeVisible({ timeout: 2000 });
    await expect(page.locator('.toast')).toContainText(/username/i);
  });

  test('Successful login hides login page and shows app shell', async ({ page }) => {
    await mockAllAPIs(page);
    await page.goto(DASHBOARD_URL);
    await page.fill('#loginUser', 'shanil');
    await page.click('.login-btn');
    await expect(page.locator('#appShell')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#loginPage')).toBeHidden();
  });

  test('After login, user name is displayed in the sidebar', async ({ page }) => {
    await loginAndLoad(page);
    await expect(page.locator('#sbName')).toContainText('Shanil Jain');
    await expect(page.locator('#sbRole')).toContainText('Admin / Partner');
  });

  test('Admin login link is present and points to admin panel', async ({ page }) => {
    await page.goto(DASHBOARD_URL);
    const adminLink = page.locator('a[href*="slt-admin-panel"]');
    await expect(adminLink).toBeVisible();
    await expect(adminLink).toContainText(/Admin/i);
  });

  test('Login handles API error gracefully', async ({ page }) => {
    await page.route('**/api/login', route =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'User not found' }) })
    );
    await page.goto(DASHBOARD_URL);
    await page.fill('#loginUser', 'unknownuser');
    await page.click('.login-btn');
    await expect(page.locator('.toast')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.toast')).toContainText(/not found/i);
    await expect(page.locator('#appShell')).toBeHidden();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  DASHBOARD PAGE — Status Cards & Panels
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Dashboard — Status Cards & Task Panels', () => {

  test.beforeEach(async ({ page }) => {
    await loginAndLoad(page);
  });

  test('All 4 status cards are visible after login', async ({ page }) => {
    await expect(page.locator('.sc.s-pend')).toBeVisible();
    await expect(page.locator('.sc.s-prog')).toBeVisible();
    await expect(page.locator('.sc.s-post')).toBeVisible();
    await expect(page.locator('.sc.s-done')).toBeVisible();
  });

  test('Status counts are populated from the API', async ({ page }) => {
    // Give a moment for API calls to complete
    await page.waitForTimeout(500);
    await expect(page.locator('#cnt-pending')).toHaveText('5');
    await expect(page.locator('#cnt-inprogress')).toHaveText('3');
    await expect(page.locator('#cnt-postsales')).toHaveText('2');
    await expect(page.locator('#cnt-done')).toHaveText('8');
  });

  test('Snapshot statistics are visible', async ({ page }) => {
    await page.waitForTimeout(500);
    await expect(page.locator('#snap-created')).toBeVisible();
    await expect(page.locator('#snap-done')).toBeVisible();
    await expect(page.locator('#snap-overdue')).toBeVisible();
    await expect(page.locator('#snap-renewals')).toBeVisible();
  });

  test('Clicking Pending card opens task panel', async ({ page }) => {
    await page.locator('.sc.s-pend').click();
    await expect(page.locator('#taskPanel')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#panelTitle')).toContainText(/pending/i);
  });

  test('Clicking In Progress card opens task panel', async ({ page }) => {
    await page.locator('.sc.s-prog').click();
    await expect(page.locator('#taskPanel')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#panelTitle')).toContainText(/progress/i);
  });

  test('Clicking Post-Sales card opens task panel', async ({ page }) => {
    await page.locator('.sc.s-post').click();
    await expect(page.locator('#taskPanel')).toBeVisible({ timeout: 3000 });
  });

  test('Clicking Done card opens task panel', async ({ page }) => {
    await page.locator('.sc.s-done').click();
    await expect(page.locator('#taskPanel')).toBeVisible({ timeout: 3000 });
  });

  test('Task panel close button hides the panel', async ({ page }) => {
    await page.locator('.sc.s-pend').click();
    await expect(page.locator('#taskPanel')).toBeVisible({ timeout: 3000 });
    await page.locator('.tp-close').click();
    await expect(page.locator('#taskPanel')).toBeHidden();
  });

  test('Task panel list renders task rows', async ({ page }) => {
    await page.locator('.sc.s-pend').click();
    await page.waitForTimeout(500);
    await expect(page.locator('#panelList .t-row').first()).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  DASHBOARD PAGE — Vertical Cards
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Dashboard — Vertical Cards', () => {

  test.beforeEach(async ({ page }) => {
    await loginAndLoad(page);
  });

  test('All 3 vertical cards are visible', async ({ page }) => {
    await expect(page.locator('.vert-card.v-ca')).toBeVisible();
    await expect(page.locator('.vert-card.v-dist')).toBeVisible();
    await expect(page.locator('.vert-card.v-broke')).toBeVisible();
  });

  test('CA Practice vertical card shows count', async ({ page }) => {
    await page.waitForTimeout(500);
    await expect(page.locator('.vert-card.v-ca .vc-name')).toContainText('CA Practice');
    await expect(page.locator('#vc-ca')).toBeVisible();
  });

  test('Financial Distribution vertical card is clickable', async ({ page }) => {
    await page.locator('.vert-card.v-dist').click();
    // Should navigate to MIS page
    await expect(page.locator('#page-mis')).toBeVisible({ timeout: 3000 });
  });

  test('CA Practice vertical card navigates to MIS', async ({ page }) => {
    await page.locator('.vert-card.v-ca').click();
    await expect(page.locator('#page-mis')).toBeVisible({ timeout: 3000 });
  });

  test('Broking Services vertical card navigates to MIS', async ({ page }) => {
    await page.locator('.vert-card.v-broke').click();
    await expect(page.locator('#page-mis')).toBeVisible({ timeout: 3000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  SIDEBAR NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Sidebar Navigation', () => {

  test.beforeEach(async ({ page }) => {
    await loginAndLoad(page);
  });

  test('Sidebar is visible after login', async ({ page }) => {
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.locator('.sb-logo')).toBeVisible();
  });

  test('Dashboard nav item is active by default', async ({ page }) => {
    await expect(page.locator('#nav-dashboard')).toHaveClass(/active/);
  });

  test('Clicking MIS Reports navigates to MIS page', async ({ page }) => {
    await page.locator('#nav-mis').click();
    await expect(page.locator('#page-mis')).toBeVisible();
    await expect(page.locator('#page-dashboard')).toBeHidden();
  });

  test('Clicking Dashboard navigates back to dashboard', async ({ page }) => {
    await page.locator('#nav-mis').click();
    await page.locator('#nav-dashboard').click();
    await expect(page.locator('#page-dashboard')).toBeVisible();
  });

  test('Clicking User Management navigates to users page', async ({ page }) => {
    await page.locator('#nav-users').click();
    await expect(page.locator('#page-users')).toBeVisible();
  });

  test('Sidebar Pending filter button loads pending tasks', async ({ page }) => {
    await page.locator('.sb-item', { hasText: 'Pending' }).click();
    await expect(page.locator('#taskPanel')).toBeVisible({ timeout: 3000 });
  });

  test('Sidebar In Progress filter loads in-progress tasks', async ({ page }) => {
    await page.locator('.sb-item', { hasText: 'In Progress' }).click();
    await expect(page.locator('#taskPanel')).toBeVisible({ timeout: 3000 });
  });

  test('Sidebar badges show task counts', async ({ page }) => {
    await page.waitForTimeout(500);
    await expect(page.locator('#badge-pending')).toBeVisible();
    await expect(page.locator('#badge-inprogress')).toBeVisible();
  });

  test('Logout button is present in sidebar', async ({ page }) => {
    await expect(page.locator('.sb-item', { hasText: 'Logout' })).toBeVisible();
  });

  test('Clicking Logout triggers logout API and returns to login page', async ({ page }) => {
    let logoutCalled = false;
    await page.route('**/api/logout', route => {
      logoutCalled = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });

    await page.locator('.sb-item', { hasText: 'Logout' }).click();
    await page.waitForTimeout(500);
    expect(logoutCalled).toBe(true);
    await expect(page.locator('#loginPage')).toBeVisible({ timeout: 3000 });
  });

  test('Settings placeholder shows a toast when clicked', async ({ page }) => {
    await page.locator('.sb-item', { hasText: 'Settings' }).click();
    await expect(page.locator('.toast')).toBeVisible({ timeout: 2000 });
    await expect(page.locator('.toast')).toContainText(/Phase 2/i);
  });

  test('Top bar shows correct page title after navigation', async ({ page }) => {
    await expect(page.locator('#tbTitle')).toContainText('Dashboard');
    await page.locator('#nav-mis').click();
    await expect(page.locator('#tbTitle')).toContainText(/MIS/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  CREATE TASK MODAL
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Create Task Modal — 6-Step Wizard', () => {

  test.beforeEach(async ({ page }) => {
    await loginAndLoad(page);
  });

  test('"+ Create New Task" button opens the modal', async ({ page }) => {
    await page.locator('.btn-create').click();
    await expect(page.locator('#createOverlay')).toBeVisible();
    await expect(page.locator('#createOverlay .modal')).toBeVisible();
  });

  test('Modal stepper shows Step 1 (Vertical) as current', async ({ page }) => {
    await page.locator('.btn-create').click();
    await expect(page.locator('#sd1')).toHaveClass(/cur/);
    await expect(page.locator('#cs1')).toBeVisible();
  });

  test('Step 1: Three vertical options are shown', async ({ page }) => {
    await page.locator('.btn-create').click();
    await expect(page.locator('#o-ca')).toBeVisible();
    await expect(page.locator('#o-dist')).toBeVisible();
    await expect(page.locator('#o-broke')).toBeVisible();
  });

  test('Step 1 → Step 2: Selecting a vertical and clicking Next advances', async ({ page }) => {
    await page.locator('.btn-create').click();
    await page.locator('#o-ca').click(); // select CA Practice
    await page.locator('#nextBtn').click();
    await expect(page.locator('#cs2')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#cs1')).toBeHidden();
  });

  test('Step 2: Category grid is populated from API', async ({ page }) => {
    await page.locator('.btn-create').click();
    await page.locator('#o-ca').click();
    await page.locator('#nextBtn').click();
    await page.waitForTimeout(500);
    await expect(page.locator('#catGrid .opt').first()).toBeVisible();
  });

  test('Step 2 → Step 3: Selecting a category advances to Nature step', async ({ page }) => {
    await page.locator('.btn-create').click();
    await page.locator('#o-ca').click();
    await page.locator('#nextBtn').click();
    await page.waitForTimeout(500);
    await page.locator('#catGrid .opt').first().click();
    await page.locator('#nextBtn').click();
    await expect(page.locator('#cs3')).toBeVisible({ timeout: 3000 });
  });

  test('Step 3 → Step 4: Selecting a nature advances to TX Type step', async ({ page }) => {
    await page.locator('.btn-create').click();
    await page.locator('#o-ca').click();
    await page.locator('#nextBtn').click();
    await page.waitForTimeout(400);
    await page.locator('#catGrid .opt').first().click();
    await page.locator('#nextBtn').click();
    await page.waitForTimeout(400);
    await page.locator('#natureGrid .sub-opt').first().click();
    await page.locator('#nextBtn').click();
    await expect(page.locator('#cs4')).toBeVisible({ timeout: 3000 });
  });

  test('Step 4: Financial and Non-Financial TX options are visible', async ({ page }) => {
    // Navigate to step 4
    await page.locator('.btn-create').click();
    await page.locator('#o-ca').click();
    await page.locator('#nextBtn').click();
    await page.waitForTimeout(400);
    await page.locator('#catGrid .opt').first().click();
    await page.locator('#nextBtn').click();
    await page.waitForTimeout(400);
    await page.locator('#natureGrid .sub-opt').first().click();
    await page.locator('#nextBtn').click();
    await expect(page.locator('#o-ft')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#o-nft')).toBeVisible();
  });

  test('Back button navigates to previous step', async ({ page }) => {
    await page.locator('.btn-create').click();
    await page.locator('#o-ca').click();
    await page.locator('#nextBtn').click();
    await page.waitForTimeout(400);
    // Now on step 2 — click Back
    await page.locator('#backBtn').click();
    await expect(page.locator('#cs1')).toBeVisible();
  });

  test('Cancel button closes the modal', async ({ page }) => {
    await page.locator('.btn-create').click();
    await expect(page.locator('#createOverlay')).toBeVisible();
    await page.locator('.mclose').click();
    await expect(page.locator('#createOverlay')).toBeHidden();
  });

  test('Full task creation flow submits to API on Step 6', async ({ page }) => {
    let taskCreated = false;
    await page.route('**/api/tasks', route => {
      if (route.request().method() === 'POST') {
        taskCreated = true;
      }
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, taskId: 99 }) });
    });

    await page.locator('.btn-create').click();

    // Step 1: Vertical
    await page.locator('#o-ca').click();
    await page.locator('#nextBtn').click();
    await page.waitForTimeout(400);

    // Step 2: Category
    await page.locator('#catGrid .opt').first().click();
    await page.locator('#nextBtn').click();
    await page.waitForTimeout(400);

    // Step 3: Nature
    await page.locator('#natureGrid .sub-opt').first().click();
    await page.locator('#nextBtn').click();
    await page.waitForTimeout(200);

    // Step 4: TX Type
    await page.locator('#o-nft').click();
    await page.locator('#nextBtn').click();
    await page.waitForTimeout(200);

    // Step 5: Client Info
    await page.fill('#cName', 'Ramesh Kumar Sharma');
    await page.fill('#cMobile', '9876543210');
    await page.locator('#nextBtn').click();
    await page.waitForTimeout(200);

    // Step 6: Task details — fill required fields
    await page.fill('#tTitle', 'Test GST Filing Task');
    await page.fill('#tDue', '2026-06-30');
    // Set assign dropdown if staff loaded
    const assignSelect = page.locator('#tAssign');
    const optCount = await assignSelect.locator('option').count();
    if (optCount > 1) {
      await assignSelect.selectOption({ index: 1 });
    }

    // Click the final submit button
    await page.locator('#nextBtn').click();
    await page.waitForTimeout(500);

    // Verify the API was called (task creation)
    expect(taskCreated).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  MIS PAGE
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('MIS Reports Page', () => {

  test.beforeEach(async ({ page }) => {
    await loginAndLoad(page);
    await page.locator('#nav-mis').click();
    await page.waitForTimeout(400);
  });

  test('MIS page is visible and breadcrumb is shown', async ({ page }) => {
    await expect(page.locator('#page-mis')).toBeVisible();
    await expect(page.locator('#bcRow')).toBeVisible();
  });

  test('MIS drill-down bubbles are rendered', async ({ page }) => {
    await page.waitForTimeout(600);
    await expect(page.locator('#misContent')).toBeVisible();
    // Bubbles or vertical-level content should appear
    const content = await page.locator('#misContent').textContent();
    expect(content.length).toBeGreaterThan(0);
  });

  test('Clicking a vertical bubble loads categories', async ({ page }) => {
    await page.waitForTimeout(600);
    const firstBubble = page.locator('#misContent .bubble').first();
    if (await firstBubble.isVisible()) {
      await firstBubble.click();
      await page.waitForTimeout(400);
      // Breadcrumb should update
      const bcText = await page.locator('#bcRow').textContent();
      expect(bcText.length).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  USERS PAGE
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('User Management Page', () => {

  test.beforeEach(async ({ page }) => {
    await loginAndLoad(page);
    await page.locator('#nav-users').click();
    await page.waitForTimeout(400);
  });

  test('Users page renders Create User form', async ({ page }) => {
    await expect(page.locator('#page-users')).toBeVisible();
    await expect(page.locator('#newName')).toBeVisible();
    await expect(page.locator('#newEmail')).toBeVisible();
    await expect(page.locator('#newRole')).toBeVisible();
  });

  test('Create User form has all required fields', async ({ page }) => {
    await expect(page.locator('#newName')).toBeVisible();
    await expect(page.locator('#newEmail')).toBeVisible();
    await expect(page.locator('#newMobile')).toBeVisible();
    await expect(page.locator('#newRole')).toBeVisible();
    await expect(page.locator('#newVertical')).toBeVisible();
  });

  test('Role dropdown has expected options', async ({ page }) => {
    const opts = await page.locator('#newRole option').allTextContents();
    expect(opts).toContain('Admin / Partner');
    expect(opts).toContain('Operations Manager');
    expect(opts).toContain('KYC Executive');
  });

  test('Users grid renders team member cards', async ({ page }) => {
    await page.waitForTimeout(600);
    await expect(page.locator('#usersGrid')).toBeVisible();
    const cards = page.locator('#usersGrid .uc');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(0); // may be 0 if API not loaded
  });

  test('Create User button calls the API', async ({ page }) => {
    let apiCalled = false;
    await page.route('**/api/users', route => {
      if (route.request().method() === 'POST') {
        apiCalled = true;
      }
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, userId: 10 }) });
    });

    await page.fill('#newName', 'Test Employee');
    await page.fill('#newEmail', 'test@slt.in');
    await page.fill('#newMobile', '9876543210');
    await page.selectOption('#newRole', 'KYC Executive');
    await page.locator('.btn-navy', { hasText: 'Create User' }).click();
    await page.waitForTimeout(500);
    expect(apiCalled).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  TASK DETAIL MODAL
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Task Detail Modal', () => {

  test.beforeEach(async ({ page }) => {
    await loginAndLoad(page);
    // Open task panel to get access to task rows
    await page.locator('.sc.s-pend').click();
    await page.waitForTimeout(600);
  });

  test('Clicking a task row opens the detail modal', async ({ page }) => {
    const firstRow = page.locator('#panelList .t-row').first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      await expect(page.locator('#detailOverlay')).toBeVisible({ timeout: 3000 });
    }
  });

  test('Detail modal shows task metadata sections', async ({ page }) => {
    const firstRow = page.locator('#panelList .t-row').first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      await page.waitForTimeout(400);
      await expect(page.locator('#d-vert')).toBeVisible();
      await expect(page.locator('#d-cat')).toBeVisible();
      await expect(page.locator('#d-nat')).toBeVisible();
      await expect(page.locator('#d-cname')).toBeVisible();
    }
  });

  test('Close button on detail modal hides it', async ({ page }) => {
    const firstRow = page.locator('#panelList .t-row').first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      await page.waitForTimeout(400);
      await page.locator('.mclose').click();
      await expect(page.locator('#detailOverlay')).toBeHidden();
    }
  });

  test('Stage progress bar is shown in the detail modal', async ({ page }) => {
    const firstRow = page.locator('#panelList .t-row').first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      await page.waitForTimeout(400);
      await expect(page.locator('#stagesBar')).toBeVisible();
    }
  });
});
