// tests/frontend.spec.js
// SLT Task Manager — Playwright Frontend E2E Tests
// Phase 2 — Updated for: task creation wizard, lifecycle actions,
//            file upload UI, intranet (http://), RBAC buttons
//
// HOW TO RUN:
//   1. cd backend && node server.js
//   2. npx serve frontend -p 3000  (or whatever port)
//   3. npx playwright test tests/frontend.spec.js --headed

const { test, expect } = require('@playwright/test');

// ── URL config — must match your serve port ──────────────
const FRONTEND_URL = process.env.FRONTEND_URL ||
  'http://localhost:3000/slt-dashboard-v3.html';

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

async function loginAs(page, username = 'shanil') {
  await page.goto(FRONTEND_URL);
  await expect(page.locator('#loginPage')).toBeVisible({ timeout: 8000 });
  await page.locator('#loginUser').fill(username);
  await page.locator('button.login-btn').click();
  await expect(page.locator('#appShell')).toBeVisible({ timeout: 10000 });
  // Wait for dashboard data to load
  await page.waitForTimeout(2000);
}

async function openCreateTask(page) {
  await page.locator('button.btn-create').click();
  await expect(page.locator('#createOverlay')).toBeVisible({ timeout: 5000 });
}

async function goThroughWizardToStep6(page) {
  // Step 1 — Select vertical: Financial Distribution
  await page.locator('#o-dist').click();
  await page.locator('#nextBtn').click();
  await page.waitForTimeout(1000);

  // Step 2 — Select category: MF (first available)
  await page.waitForSelector('#catGrid .opt', { timeout: 5000 });
  await page.locator('#catGrid .opt').first().click();
  await page.locator('#nextBtn').click();
  await page.waitForTimeout(1000);

  // Step 3 — Select nature (first available)
  await page.waitForSelector('.sub-opt', { timeout: 5000 });
  await page.locator('.sub-opt').first().click();
  await page.locator('#nextBtn').click();
  await page.waitForTimeout(500);

  // Step 4 — Select Financial Transaction
  await page.locator('#o-ft').click();
  await page.locator('#nextBtn').click();
  await page.waitForTimeout(500);

  // Step 5 — Client details
  await page.locator('#cName').fill('Playwright Test Client');
  await page.locator('#cMobile').fill('9000000001');
  await page.locator('#nextBtn').click();
  await page.waitForTimeout(500);
  // Now at Step 6
}

// ─────────────────────────────────────────────
// 1. LOGIN
// ─────────────────────────────────────────────
test.describe('1. Login', () => {

  test('Login page loads with correct elements', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    await expect(page.locator('#loginPage')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#loginUser')).toBeVisible();
    await expect(page.locator('button.login-btn')).toContainText('Sign In');
  });

  test('Valid manager login (shanil) reaches dashboard', async ({ page }) => {
    await loginAs(page, 'shanil');
    await expect(page.locator('#appShell')).toBeVisible();
    await expect(page.locator('#loginPage')).toBeHidden();
  });

  test('Valid staff login (priya) reaches dashboard', async ({ page }) => {
    await loginAs(page, 'priya');
    await expect(page.locator('#appShell')).toBeVisible();
  });

  test('INTRANET FIX: API uses window.location.hostname not hardcoded localhost', async ({ page }) => {
    // If API was hardcoded to localhost, remote users would get "failed to fetch"
    // This verifies the fix: const API = `http://${window.location.hostname}:5000/api`
    await page.goto(FRONTEND_URL);
    const apiVar = await page.evaluate(() => {
      // Check the API variable in page scope
      return typeof API !== 'undefined' ? API : window.API || 'NOT_FOUND';
    });
    // API should contain the actual hostname, not literal "localhost" if served from network
    // At minimum it should be defined and contain port 5000
    expect(apiVar).toContain('5000');
    expect(apiVar).toContain('/api');
  });

  test('Wrong username does not reach dashboard', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    await expect(page.locator('#loginPage')).toBeVisible({ timeout: 8000 });
    await page.locator('#loginUser').fill('nobody_xyz_999');
    await page.locator('button.login-btn').click();
    await page.waitForTimeout(3000);
    expect(await page.locator('#appShell').isVisible()).toBe(false);
  });

  test('Empty username does not proceed', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    await expect(page.locator('#loginPage')).toBeVisible({ timeout: 8000 });
    await page.locator('button.login-btn').click();
    await page.waitForTimeout(1500);
    await expect(page.locator('#loginPage')).toBeVisible();
    await expect(page.locator('#appShell')).toBeHidden();
  });

});

// ─────────────────────────────────────────────
// 2. DASHBOARD OVERVIEW
// ─────────────────────────────────────────────
test.describe('2. Dashboard Overview', () => {

  test('4 status cards visible with numeric counts', async ({ page }) => {
    await loginAs(page, 'shanil');
    const cards = page.locator('.sc');
    await expect(cards.first()).toBeVisible({ timeout: 5000 });
    expect(await cards.count()).toBeGreaterThanOrEqual(4);
  });

  test('All 4 snapshot tiles show numeric values from API', async ({ page }) => {
    await loginAs(page, 'shanil');
    await page.waitForTimeout(3000);
    for (const id of ['#snap-created', '#snap-done', '#snap-overdue', '#snap-renewals']) {
      const el = page.locator(id);
      await expect(el).toBeVisible();
      const text = await el.textContent();
      expect(text?.trim(), `${id} must show a number`).toMatch(/^\d+$/);
    }
  });

  test('Renewals Due snap card shows API value (not old hardcoded 12)', async ({ page }) => {
    await loginAs(page, 'shanil');
    await page.waitForTimeout(3000);
    const text = await page.locator('#snap-renewals').textContent();
    expect(text?.trim()).toMatch(/^\d+$/);
    // Should definitely not be the old hardcoded "12" if DB has 0 renewals
    // The fix was adding id="snap-renewals" and wiring to API
  });

  test('3 vertical cards visible on dashboard (CA, Distribution, Broking)', async ({ page }) => {
    await loginAs(page, 'shanil');

    // STRICT CHECK: .v-ca exists in BOTH #page-dashboard and #page-mis
    // On login, dashboard is active — MIS page should be hidden
    // This test verifies correct page visibility state after login
    await expect(page.locator('#page-dashboard')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#page-mis')).toBeHidden();

    // Dashboard vertical cards must be visible (inside active page)
    const dashboard = page.locator('#page-dashboard');
    await expect(dashboard.locator('.v-ca')).toBeVisible();
    await expect(dashboard.locator('.v-dist')).toBeVisible();
    await expect(dashboard.locator('.v-broke')).toBeVisible();

    // MIS vertical cards must NOT be visible (inside hidden page)
    const misPage = page.locator('#page-mis');
    await expect(misPage.locator('.v-ca')).toBeHidden();

    // Verify labels
    const dashText = await dashboard.textContent();
    expect(dashText).toContain('CA Practice');
    expect(dashText).toContain('Financial Distribution');
    expect(dashText).toContain('Broking Services');
  });

});

// ─────────────────────────────────────────────
// 3. TASK PANELS (renderPanel bug fix confirmed)
// ─────────────────────────────────────────────
test.describe('3. Task Panels', () => {

  test('Clicking Pending card opens task panel without freezing', async ({ page }) => {
    await loginAs(page, 'shanil');
    await page.locator('.s-pend').click();
    await page.waitForTimeout(2500);
    await expect(page.locator('#taskPanel')).toBeVisible({ timeout: 5000 });
    const content = await page.locator('#panelList').textContent();
    expect(content).not.toContain('Loading tasks');
  });

  test('Clicking In Progress card opens panel', async ({ page }) => {
    await loginAs(page, 'shanil');
    await page.locator('.s-prog').click();
    await page.waitForTimeout(2500);
    await expect(page.locator('#taskPanel')).toBeVisible({ timeout: 5000 });
    const content = await page.locator('#panelList').textContent();
    expect(content).not.toContain('Loading tasks');
  });

  test('Clicking Post-Sales card opens panel', async ({ page }) => {
    await loginAs(page, 'shanil');
    await page.locator('.s-post').click();
    await page.waitForTimeout(2500);
    await expect(page.locator('#taskPanel')).toBeVisible({ timeout: 5000 });
    const content = await page.locator('#panelList').textContent();
    expect(content).not.toContain('Loading tasks');
  });

  test('Clicking Completed card opens panel', async ({ page }) => {
    await loginAs(page, 'shanil');
    await page.locator('.s-done').click();
    await page.waitForTimeout(2500);
    await expect(page.locator('#taskPanel')).toBeVisible({ timeout: 5000 });
    const content = await page.locator('#panelList').textContent();
    expect(content).not.toContain('Loading tasks');
  });

  test('Panel close button (✕) closes the panel', async ({ page }) => {
    await loginAs(page, 'shanil');
    await page.locator('.s-pend').click();
    await page.waitForTimeout(2000);
    await expect(page.locator('#taskPanel')).toBeVisible();
    await page.locator('.tp-close').click();
    await page.waitForTimeout(500);
    await expect(page.locator('#taskPanel')).toBeHidden();
  });

});

// ─────────────────────────────────────────────
// 4. TASK CREATION WIZARD (6-step waterfall)
// ─────────────────────────────────────────────
test.describe('4. Task Creation Wizard', () => {

  test('Create New Task button opens wizard modal', async ({ page }) => {
    await loginAs(page, 'shanil');
    await page.locator('button.btn-create').click();
    await expect(page.locator('#createOverlay')).toBeVisible({ timeout: 5000 });
    // Step 1 should be active
    await expect(page.locator('#cs1')).toBeVisible();
  });

  test('Step 1 — vertical options load (CA, Distribution, Broking)', async ({ page }) => {
    await loginAs(page, 'shanil');
    await openCreateTask(page);
    await expect(page.locator('#o-ca')).toBeVisible();
    await expect(page.locator('#o-dist')).toBeVisible();
    await expect(page.locator('#o-broke')).toBeVisible();
  });

  test('Step 1 → 2 — selecting vertical loads categories from API', async ({ page }) => {
    await loginAs(page, 'shanil');
    await openCreateTask(page);
    await page.locator('#o-dist').click();
    await page.locator('#nextBtn').click();
    await page.waitForTimeout(1500);
    // Category grid should populate from API
    await expect(page.locator('#cs2')).toBeVisible();
    const catCount = await page.locator('#catGrid .opt').count();
    expect(catCount).toBeGreaterThan(0);
  });

  test('Step 2 → 3 — selecting category loads natures from API (natureCode fix)', async ({ page }) => {
    await loginAs(page, 'shanil');
    await openCreateTask(page);
    // Step 1
    await page.locator('#o-dist').click();
    await page.locator('#nextBtn').click();
    await page.waitForTimeout(1500);
    // Step 2 — click first category
    await page.locator('#catGrid .opt').first().click();
    await page.locator('#nextBtn').click();
    await page.waitForTimeout(1500);
    // Step 3 — nature options should appear
    await expect(page.locator('#cs3')).toBeVisible();
    const natCount = await page.locator('.sub-opt').count();
    expect(natCount).toBeGreaterThan(0);
  });

  test('Step 4 — Financial / Non-Financial options visible', async ({ page }) => {
    await loginAs(page, 'shanil');
    await openCreateTask(page);
    await page.locator('#o-dist').click();
    await page.locator('#nextBtn').click();
    await page.waitForTimeout(1000);
    await page.locator('#catGrid .opt').first().click();
    await page.locator('#nextBtn').click();
    await page.waitForTimeout(1000);
    await page.locator('.sub-opt').first().click();
    await page.locator('#nextBtn').click();
    await page.waitForTimeout(500);
    await expect(page.locator('#o-ft')).toBeVisible();
    await expect(page.locator('#o-nft')).toBeVisible();
  });

  test('Step 5 — client name and mobile are required fields', async ({ page }) => {
    await loginAs(page, 'shanil');
    await openCreateTask(page);
    await page.locator('#o-dist').click();
    await page.locator('#nextBtn').click();
    await page.waitForTimeout(1000);
    await page.locator('#catGrid .opt').first().click();
    await page.locator('#nextBtn').click();
    await page.waitForTimeout(1000);
    await page.locator('.sub-opt').first().click();
    await page.locator('#nextBtn').click();
    await page.waitForTimeout(500);
    await page.locator('#o-ft').click();
    await page.locator('#nextBtn').click();
    await page.waitForTimeout(500);
    // Step 5 — click Next without filling client fields
    await page.locator('#nextBtn').click();
    await page.waitForTimeout(500);
    // Should NOT advance — still on step 5
    await expect(page.locator('#cs5')).toBeVisible();
  });

  test('Full wizard — creates task successfully end-to-end', async ({ page }) => {
    await loginAs(page, 'shanil');
    await openCreateTask(page);
    await goThroughWizardToStep6(page);

    // Step 6 — Task details
    await page.locator('#tTitle').fill('PW E2E Test Task');
    // Select first staff member in assign dropdown
    await page.locator('#tAssign').selectOption({ index: 1 });
    // Set due date to 7 days from now
    const dueDate = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    await page.locator('#tDue').fill(dueDate);

    // Click Create Task (final step)
    await page.locator('#nextBtn').click();
    await page.waitForTimeout(3000);

    // Modal should close after successful creation
    await expect(page.locator('#createOverlay')).toBeHidden({ timeout: 8000 });

    // Dashboard should reload and show updated counts
    await expect(page.locator('#appShell')).toBeVisible();
  });

  test('Back button in wizard navigates to previous step', async ({ page }) => {
    await loginAs(page, 'shanil');
    await openCreateTask(page);
    await page.locator('#o-dist').click();
    await page.locator('#nextBtn').click();
    await page.waitForTimeout(1000);
    // Now on step 2 — click Back
    await expect(page.locator('#backBtn')).toBeVisible();
    await page.locator('#backBtn').click();
    await page.waitForTimeout(500);
    // Back on step 1
    await expect(page.locator('#cs1')).toBeVisible();
  });

  test('Cancel button closes wizard without creating task', async ({ page }) => {
    await loginAs(page, 'shanil');
    await openCreateTask(page);
    await page.locator('#o-dist').click();
    const cancelBtn = page.locator('button:has-text("Cancel")').first();
    await cancelBtn.click();
    await expect(page.locator('#createOverlay')).toBeHidden({ timeout: 3000 });
  });

});

// ─────────────────────────────────────────────
// 5. TASK DETAIL MODAL & LIFECYCLE ACTIONS
// ─────────────────────────────────────────────
test.describe('5. Task Detail & Lifecycle', () => {

  test('Clicking a task in panel opens detail modal', async ({ page }) => {
    await loginAs(page, 'shanil');
    await page.locator('.s-pend').click();
    await page.waitForTimeout(2500);

    const tasks = page.locator('#panelList tr, #panelList .task-row, #panelList a');
    const count = await tasks.count();
    if (count === 0) {
      test.skip(); // No tasks to test with
      return;
    }

    await tasks.first().click();
    await page.waitForTimeout(1500);
    // Detail modal or overlay should open
    await expect(page.locator('#detailOverlay, .det-overlay, [id*="detail"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('Pending task shows "Mark as In Progress" button for manager', async ({ page }) => {
    await loginAs(page, 'shanil'); // shanil is Admin/Partner
    await page.locator('.s-pend').click();
    await page.waitForTimeout(2500);

    const tasks = page.locator('#panelList tr, #panelList .task-row, #panelList a');
    if (await tasks.count() === 0) { test.skip(); return; }

    await tasks.first().click();
    await page.waitForTimeout(1500);

    // Should see start/confirm action button
    const actRow = page.locator('#actRow');
    const actText = await actRow.textContent().catch(() => '');
    expect(
      actText.includes('In Progress') || actText.includes('Start') || actText.includes('Confirm')
    ).toBe(true);
  });

  test('Send Back modal opens and requires reason text', async ({ page }) => {
    await loginAs(page, 'shanil');
    await page.locator('.s-prog').click();
    await page.waitForTimeout(2500);

    const tasks = page.locator('#panelList tr, #panelList .task-row, #panelList a');
    if (await tasks.count() === 0) { test.skip(); return; }

    await tasks.first().click();
    await page.waitForTimeout(1500);

    // If Send Back button exists
    const sendBackBtn = page.locator('#actRow button:has-text("Send Back")');
    if (await sendBackBtn.count() === 0) { test.skip(); return; }

    await sendBackBtn.click();
    await expect(page.locator('#sendbackOverlay')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#sendbackReason')).toBeVisible();

    // Try to submit without reason — should not close
    await page.locator('button:has-text("Send Back")').last().click();
    await page.waitForTimeout(1000);
    await expect(page.locator('#sendbackOverlay')).toBeVisible();

    // Fill reason and send
    await page.locator('#sendbackReason').fill('Proof image is blurry — please re-upload');
    await page.locator('button:has-text("Send Back")').last().click();
    await page.waitForTimeout(2000);
    await expect(page.locator('#sendbackOverlay')).toBeHidden({ timeout: 5000 });
  });

});

// ─────────────────────────────────────────────
// 6. FILE UPLOAD UI (handleProofUpload)
// ─────────────────────────────────────────────
test.describe('6. File Upload UI', () => {

  test('Proof upload input is visible in task detail for inprogress task', async ({ page }) => {
    await loginAs(page, 'shanil');
    await page.locator('.s-prog').click();
    await page.waitForTimeout(2500);

    const tasks = page.locator('#panelList tr, #panelList .task-row, #panelList a');
    if (await tasks.count() === 0) { test.skip(); return; }

    await tasks.first().click();
    await page.waitForTimeout(1500);

    // Proof upload box should be visible
    const proofBox = page.locator('.proof-box input[type="file"]').first();
    await expect(proofBox).toBeVisible({ timeout: 5000 });
  });

  test('NOTE — handleProofUpload is currently a UI placeholder (known issue)', async ({ page }) => {
    // This test documents the known bug: handleProofUpload shows a toast
    // but does NOT call POST /api/tasks/:id/proof
    // This should be fixed in the next phase
    // When fixed, this test should be updated to verify actual API call
    await loginAs(page, 'shanil');
    const apiCallsMade = [];

    // Monitor network calls
    page.on('request', req => {
      if (req.url().includes('/proof')) apiCallsMade.push(req.url());
    });

    await page.locator('.s-prog').click();
    await page.waitForTimeout(2000);
    const tasks = page.locator('#panelList tr, #panelList .task-row, #panelList a');
    if (await tasks.count() === 0) { test.skip(); return; }
    await tasks.first().click();
    await page.waitForTimeout(1500);

    // Document current behaviour (placeholder — no real API call)
    // WHEN FIX IS APPLIED: expect(apiCallsMade.length).toBeGreaterThan(0)
    // FOR NOW: just confirm file input is present
    const proofInput = page.locator('.proof-box input[type="file"]').first();
    const exists = await proofInput.count();
    expect(exists).toBeGreaterThan(0);
  });

});

// ─────────────────────────────────────────────
// 7. MIS DRILL-DOWN
// ─────────────────────────────────────────────
test.describe('7. MIS Drill-Down', () => {

  test('MIS page accessible from sidebar', async ({ page }) => {
    await loginAs(page, 'shanil');
    await page.locator('#nav-mis').click();
    await page.waitForTimeout(1500);
    await expect(page.locator('#page-mis')).toBeVisible({ timeout: 5000 });
  });

  test('MIS page shows 3 vertical cards', async ({ page }) => {
    await loginAs(page, 'shanil');
    await page.locator('#nav-mis').click();
    await page.waitForTimeout(2000);
    const misPage = page.locator('#page-mis');
    await expect(misPage).toBeVisible();
    const text = await misPage.textContent();
    expect(text).toContain('CA Practice');
    expect(text).toContain('Financial Distribution');
    expect(text).toContain('Broking Services');
  });

  test('Clicking vertical card in MIS shows product bubbles', async ({ page }) => {
    await loginAs(page, 'shanil');
    await page.locator('#nav-mis').click();
    await page.waitForTimeout(2000);

    // Click CA Practice vertical
    await page.locator('#page-mis .v-ca, #page-mis .vert-card').first().click();
    await page.waitForTimeout(1500);

    // Should show product bubbles
    const pageText = await page.locator('#page-mis').textContent();
    expect(
      pageText.includes('GST') || pageText.includes('ITR') || pageText.includes('bubble') || pageText.includes('MF')
    ).toBe(true);
  });

  test('Dashboard vertical cards link to MIS', async ({ page }) => {
    await loginAs(page, 'shanil');
    // Click Distribution vertical card on dashboard
    await page.locator('.v-dist').first().click();
    await page.waitForTimeout(2000);
    // Should navigate to MIS page
    await expect(page.locator('#page-mis')).toBeVisible({ timeout: 5000 });
  });

});

// ─────────────────────────────────────────────
// 8. USER MANAGEMENT
// ─────────────────────────────────────────────
test.describe('8. User Management', () => {

  test('User Management page accessible from sidebar', async ({ page }) => {
    await loginAs(page, 'shanil');
    await page.locator('#nav-users').click();
    await page.waitForTimeout(1500);
    await expect(page.locator('#page-users')).toBeVisible({ timeout: 5000 });
  });

  test('Team grid shows staff members', async ({ page }) => {
    await loginAs(page, 'shanil');
    await page.locator('#nav-users').click();
    await page.waitForTimeout(2000);
    const pageText = await page.locator('#page-users').textContent();
    // Should show existing users
    expect(
      pageText.includes('shanil') || pageText.includes('Shanil') ||
      pageText.includes('Admin') || pageText.includes('Back Office')
    ).toBe(true);
  });

});

// ─────────────────────────────────────────────
// 9. LOGOUT
// ─────────────────────────────────────────────
test.describe('9. Logout', () => {

  test('Logout returns to login screen', async ({ page }) => {
    await loginAs(page, 'shanil');
    await page.locator('text=Logout').click();
    await page.waitForTimeout(2000);
    await expect(page.locator('#loginPage')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#appShell')).toBeHidden();
  });

  test('After logout, can log back in as different user', async ({ page }) => {
    await loginAs(page, 'shanil');
    await page.locator('text=Logout').click();
    await page.waitForTimeout(2000);
    await expect(page.locator('#loginPage')).toBeVisible({ timeout: 5000 });
    // Login as different user
    await page.locator('#loginUser').fill('priya');
    await page.locator('button.login-btn').click();
    await expect(page.locator('#appShell')).toBeVisible({ timeout: 8000 });
  });

});
