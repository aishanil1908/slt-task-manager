/**
 * SLT Task Management — System Admin Panel Frontend Tests
 * Framework : Playwright
 * File      : slt-admin-panel.html
 *
 * HOW TO RUN
 * ----------
 * npx playwright test tests/frontend/admin.spec.js --headed
 *
 * All API calls to http://localhost:5000/api/* are mocked — no backend needed.
 */

const { test, expect } = require('@playwright/test');
const path = require('path');

// ─── File URL ─────────────────────────────────────────────────────────────────
const ADMIN_URL = `file://${path.resolve(__dirname, '../../frontend/slt-admin-panel.html')}`;

// ─── Mock data fixtures ───────────────────────────────────────────────────────
const MOCK_TOKEN = 'mock-admin-jwt-token';

const MOCK_LOGIN_OK = {
  success: true,
  token: MOCK_TOKEN,
  user: {
    id: 99, username: 'sysadmin', fullName: 'System Administrator',
    email: 'sysadmin@slt.in', role: 'System Admin',
    verticalAccess: [],
  },
  pilotMode: false,
};

const MOCK_USERS = {
  success: true,
  users: [
    {
      id: 1, username: 'priya.sharma', full_name: 'Priya Sharma',
      email: 'priya@slt.in', mobile: '9876543201',
      role: 'Back Office Operator', is_active: true,
      job_profile: 'Senior Associate', primary_manager: 'Rahul Gupta',
      primary_manager_id: 2, secondary_manager: null, secondary_manager_id: null,
      vertical_access: ['ca', 'dist'], last_login: new Date().toISOString(),
    },
    {
      id: 2, username: 'rahul.gupta', full_name: 'Rahul Gupta',
      email: 'rahul@slt.in', mobile: '9876543202',
      role: 'Operations Manager', is_active: true,
      job_profile: 'Manager', primary_manager: null,
      primary_manager_id: null, secondary_manager: null,
      vertical_access: ['ca', 'dist', 'broke'], last_login: new Date().toISOString(),
    },
  ]
};

const MOCK_JOB_PROFILES = {
  success: true,
  jobProfiles: [
    { id: 1, title: 'Senior RM',       description: 'Relationship Manager',  user_count: '3', is_active: true },
    { id: 2, title: 'Junior Associate', description: 'Entry level associate', user_count: '5', is_active: true },
  ]
};

const MOCK_HIERARCHY = {
  success: true,
  hierarchy: [
    { id: 1, full_name: 'Priya Sharma', role: 'Back Office Operator', primary_manager: 'Rahul Gupta', secondary_manager: null, allow_dual_reporting: false }
  ]
};

const MOCK_ADMIN_VERTICALS = {
  success: true,
  verticals: [
    { id: 1, code: 'ca',   name: 'CA Practice',            icon: '🏛️', is_system: true,  is_active: true,  display_order: 1, category_count: '6' },
    { id: 2, code: 'dist', name: 'Financial Distribution', icon: '💹', is_system: true,  is_active: true,  display_order: 2, category_count: '10' },
    { id: 3, code: 'myv',  name: 'My Custom Vertical',     icon: '🏢', is_system: false, is_active: true,  display_order: 4, category_count: '2' },
  ]
};

const MOCK_ADMIN_CATEGORIES = {
  success: true,
  categories: [
    { id: 1, code: 'mf',  name: 'Mutual Funds',    vertical_name: 'Financial Distribution', vertical_code: 'dist', is_system: true,  is_active: true, nature_count: '6' },
    { id: 2, code: 'gst', name: 'GST Returns',      vertical_name: 'CA Practice',           vertical_code: 'ca',   is_system: true,  is_active: true, nature_count: '5' },
    { id: 15,code: 'bonds',name: 'Bonds',           vertical_name: 'Financial Distribution', vertical_code: 'dist', is_system: false, is_active: true, nature_count: '2' },
  ]
};

const MOCK_ADMIN_NATURES = {
  success: true,
  natures: [
    { id: 1, code: 'sip',   name: 'SIP Registration', category_name: 'Mutual Funds', vertical_name: 'Financial Distribution', is_system: true,  is_active: true,  ft_allowed: true,  nft_allowed: false },
    { id: 2, code: 'gstr3b',name: 'GSTR-3B',          category_name: 'GST Returns',  vertical_name: 'CA Practice',           is_system: true,  is_active: true,  ft_allowed: false, nft_allowed: true  },
    { id: 30,code: 'stp',   name: 'STP Registration', category_name: 'Mutual Funds', vertical_name: 'Financial Distribution', is_system: false, is_active: true,  ft_allowed: true,  nft_allowed: false },
  ]
};

// ─── Mock helpers ─────────────────────────────────────────────────────────────
async function mockAdminAPIs(page) {
  await page.route('**/api/login', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_LOGIN_OK) })
  );
  await page.route('**/api/logout', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
  );
  await page.route('**/api/admin/users', route => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, userId: 20, username: 'test.user' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USERS) });
  });
  await page.route('**/api/admin/users/**', route => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'Done' }) });
  });
  await page.route('**/api/admin/job-profiles', route => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, id: 5, message: 'Job profile created' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_JOB_PROFILES) });
  });
  await page.route('**/api/admin/job-profiles/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
  );
  await page.route('**/api/admin/hierarchy', route => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'primary reporting line assigned successfully' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_HIERARCHY) });
  });
  await page.route('**/api/admin/hierarchy/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'Reporting line removed' }) })
  );
  await page.route('**/api/admin/verticals', route => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, id: 4 }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ADMIN_VERTICALS) });
  });
  await page.route('**/api/admin/verticals/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
  );
  await page.route('**/api/admin/categories', route => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, id: 15 }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ADMIN_CATEGORIES) });
  });
  await page.route('**/api/admin/categories/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
  );
  await page.route('**/api/admin/natures', route => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, id: 30 }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ADMIN_NATURES) });
  });
  await page.route('**/api/admin/natures/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
  );
}

async function adminLoginAndLoad(page) {
  await mockAdminAPIs(page);
  await page.goto(ADMIN_URL);
  await page.fill('#adminUser', 'sysadmin');
  await page.fill('#adminPass', 'AdminPass123');
  await page.click('.login-btn');
  await expect(page.locator('#adminShell')).toBeVisible({ timeout: 5000 });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ADMIN LOGIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Admin Login Page — slt-admin-panel.html', () => {

  test('Admin login page renders with correct elements', async ({ page }) => {
    await page.goto(ADMIN_URL);
    await expect(page.locator('#loginPage')).toBeVisible();
    await expect(page.locator('#adminUser')).toBeVisible();
    await expect(page.locator('#adminPass')).toBeVisible();
    await expect(page.locator('.login-btn')).toBeVisible();
    await expect(page.locator('.login-btn')).toContainText(/Admin Console/i);
  });

  test('Page title badge shows "System Administration"', async ({ page }) => {
    await page.goto(ADMIN_URL);
    await expect(page.locator('.login-badge')).toContainText(/System Administration/i);
  });

  test('Back link to main dashboard is visible', async ({ page }) => {
    await page.goto(ADMIN_URL);
    const backLink = page.locator('.back-link');
    await expect(backLink).toBeVisible();
    await expect(backLink).toContainText(/Back to main dashboard/i);
  });

  test('Successful admin login shows admin shell', async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto(ADMIN_URL);
    await page.fill('#adminUser', 'sysadmin');
    await page.fill('#adminPass', 'AdminPass123');
    await page.click('.login-btn');
    await expect(page.locator('#adminShell')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#loginPage')).toBeHidden();
  });

  test('Login error is shown for invalid credentials', async ({ page }) => {
    await page.route('**/api/login', route =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Incorrect password' }) })
    );
    await page.goto(ADMIN_URL);
    await page.fill('#adminUser', 'sysadmin');
    await page.fill('#adminPass', 'wrongpassword');
    await page.click('.login-btn');
    await expect(page.locator('#loginErr')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#loginErr')).toContainText(/incorrect password/i);
  });

  test('Login error is shown for non-sysadmin user', async ({ page }) => {
    await page.route('**/api/login', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true, token: 'tok',
          user: { id: 1, username: 'priya', fullName: 'Priya', role: 'Back Office Operator' },
        })
      })
    );
    await page.goto(ADMIN_URL);
    await page.fill('#adminUser', 'priya');
    await page.fill('#adminPass', 'anypass');
    await page.click('.login-btn');
    await expect(page.locator('#loginErr')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#loginErr')).toContainText(/System Admin/i);
  });

  test('Enter key on password field triggers login', async ({ page }) => {
    await mockAdminAPIs(page);
    await page.goto(ADMIN_URL);
    await page.fill('#adminUser', 'sysadmin');
    await page.fill('#adminPass', 'AdminPass123');
    await page.keyboard.press('Enter');
    await expect(page.locator('#adminShell')).toBeVisible({ timeout: 5000 });
  });

  test('Logged-in user name is shown in top bar', async ({ page }) => {
    await adminLoginAndLoad(page);
    await expect(page.locator('#topUser')).toContainText('System Administrator');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  ADMIN SHELL — TOP BAR & SIDEBAR
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Admin Shell — Layout & Navigation', () => {

  test.beforeEach(async ({ page }) => {
    await adminLoginAndLoad(page);
  });

  test('Top bar shows "Admin Console" badge and title', async ({ page }) => {
    await expect(page.locator('.top-badge')).toContainText('Admin');
    await expect(page.locator('.top-bar-title')).toContainText('Second Level Think');
  });

  test('Logout button is present in the top bar', async ({ page }) => {
    await expect(page.locator('.logout-btn')).toBeVisible();
  });

  test('Clicking Logout triggers API and returns to login', async ({ page }) => {
    let logoutCalled = false;
    await page.route('**/api/logout', route => {
      logoutCalled = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });
    await page.locator('.logout-btn').click();
    await page.waitForTimeout(500);
    expect(logoutCalled).toBe(true);
    await expect(page.locator('#loginPage')).toBeVisible({ timeout: 3000 });
  });

  test('Sidebar has all 6 navigation items', async ({ page }) => {
    await expect(page.locator('#nav-users')).toBeVisible();
    await expect(page.locator('#nav-jobprofiles')).toBeVisible();
    await expect(page.locator('#nav-hierarchy')).toBeVisible();
    await expect(page.locator('#nav-verticals')).toBeVisible();
    await expect(page.locator('#nav-categories')).toBeVisible();
    await expect(page.locator('#nav-natures')).toBeVisible();
  });

  test('Users section is active by default', async ({ page }) => {
    await expect(page.locator('#nav-users')).toHaveClass(/active/);
    await expect(page.locator('#sec-users')).toBeVisible();
  });

  test('Clicking Job Profiles nav shows that section', async ({ page }) => {
    await page.locator('#nav-jobprofiles').click();
    await expect(page.locator('#sec-jobprofiles')).toBeVisible();
    await expect(page.locator('#sec-users')).toBeHidden();
  });

  test('Clicking Hierarchy nav shows that section', async ({ page }) => {
    await page.locator('#nav-hierarchy').click();
    await expect(page.locator('#sec-hierarchy')).toBeVisible();
  });

  test('Clicking Verticals nav shows that section', async ({ page }) => {
    await page.locator('#nav-verticals').click();
    await expect(page.locator('#sec-verticals')).toBeVisible();
  });

  test('Clicking Products (Categories) nav shows that section', async ({ page }) => {
    await page.locator('#nav-categories').click();
    await expect(page.locator('#sec-categories')).toBeVisible();
  });

  test('Clicking Transaction Types (Natures) nav shows that section', async ({ page }) => {
    await page.locator('#nav-natures').click();
    await expect(page.locator('#sec-natures')).toBeVisible();
  });

  test('The "+ Add via Wizard" button is present in sidebar', async ({ page }) => {
    await expect(page.locator('.sidebar .btn-primary', { hasText: /Wizard/i })).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  USER MANAGEMENT SECTION
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Admin — User Management', () => {

  test.beforeEach(async ({ page }) => {
    await adminLoginAndLoad(page);
    // Ensure Users section is visible
    await page.locator('#nav-users').click();
    await page.waitForTimeout(400);
  });

  test('User table has correct column headers', async ({ page }) => {
    const headers = await page.locator('#sec-users thead th').allTextContents();
    expect(headers).toContain('Name');
    expect(headers).toContain('Role');
    expect(headers).toContain('Status');
    expect(headers).toContain('Actions');
  });

  test('Users are loaded and rendered in the table', async ({ page }) => {
    await page.waitForTimeout(500);
    const rows = page.locator('#usersBody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('"+ New User" button opens the Create User modal', async ({ page }) => {
    await page.locator('#sec-users .btn-primary', { hasText: /New User/i }).click();
    await expect(page.locator('#userModal')).toBeVisible();
    await expect(page.locator('#userModalTitle')).toContainText('Create User');
  });

  test('Create User modal has all required fields', async ({ page }) => {
    await page.locator('#sec-users .btn-primary', { hasText: /New User/i }).click();
    await expect(page.locator('#u_fullName')).toBeVisible();
    await expect(page.locator('#u_email')).toBeVisible();
    await expect(page.locator('#u_mobile')).toBeVisible();
    await expect(page.locator('#u_role')).toBeVisible();
    await expect(page.locator('#u_jobProfile')).toBeVisible();
    await expect(page.locator('#u_password')).toBeVisible();
  });

  test('Role dropdown in Create User modal has all expected roles', async ({ page }) => {
    await page.locator('#sec-users .btn-primary', { hasText: /New User/i }).click();
    const opts = await page.locator('#u_role option').allTextContents();
    expect(opts).toContain('Admin / Partner');
    expect(opts).toContain('Operations Manager');
    expect(opts).toContain('Relationship Manager');
    expect(opts).toContain('Back Office Operator');
    expect(opts).toContain('KYC Executive');
    expect(opts).toContain('CA / Tax Specialist');
  });

  test('Create User modal Cancel button closes it', async ({ page }) => {
    await page.locator('#sec-users .btn-primary', { hasText: /New User/i }).click();
    await expect(page.locator('#userModal')).toBeVisible();
    await page.locator('#userModal .btn-ghost', { hasText: /Cancel/i }).click();
    await expect(page.locator('#userModal')).toBeHidden();
  });

  test('Create User modal close (✕) button works', async ({ page }) => {
    await page.locator('#sec-users .btn-primary', { hasText: /New User/i }).click();
    await page.locator('#userModal .modal-close').click();
    await expect(page.locator('#userModal')).toBeHidden();
  });

  test('Creating a user submits to the API', async ({ page }) => {
    let apiCalled = false;
    await page.route('**/api/admin/users', route => {
      if (route.request().method() === 'POST') apiCalled = true;
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, userId: 20, username: 'test.user' }) });
    });

    await page.locator('#sec-users .btn-primary', { hasText: /New User/i }).click();
    await page.fill('#u_fullName', 'Test User');
    await page.fill('#u_email', 'test.user@slt.in');
    await page.fill('#u_mobile', '9876543210');
    await page.selectOption('#u_role', 'KYC Executive');
    await page.fill('#u_password', 'Password123');
    await page.locator('#saveUserBtn').click();
    await page.waitForTimeout(600);
    expect(apiCalled).toBe(true);
  });

  test('User search bar is visible and interactive', async ({ page }) => {
    await expect(page.locator('#userSearch')).toBeVisible();
    await page.fill('#userSearch', 'Priya');
    // Search should filter the table
    await page.waitForTimeout(300);
  });

  test('User table row shows Edit, Deactivate, and Reset Password action buttons', async ({ page }) => {
    await page.waitForTimeout(500);
    const firstRow = page.locator('#usersBody tr').first();
    if (await firstRow.isVisible()) {
      const actionBtns = firstRow.locator('.btn');
      const count = await actionBtns.count();
      expect(count).toBeGreaterThan(0);
    }
  });

  test('Password Reset modal opens from user row action', async ({ page }) => {
    await page.waitForTimeout(500);
    const firstRow = page.locator('#usersBody tr').first();
    if (await firstRow.isVisible()) {
      // Find the Reset Password button (text varies; try btn-warn)
      const resetBtn = firstRow.locator('.btn-warn, .btn-sm').filter({ hasText: /pwd|pass|reset/i });
      if (await resetBtn.count() > 0) {
        await resetBtn.first().click();
        await expect(page.locator('#pwdModal')).toBeVisible({ timeout: 2000 });
        await page.locator('#pwdModal .modal-close').click();
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  JOB PROFILES SECTION
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Admin — Job Profiles', () => {

  test.beforeEach(async ({ page }) => {
    await adminLoginAndLoad(page);
    await page.locator('#nav-jobprofiles').click();
    await page.waitForTimeout(400);
  });

  test('Job Profiles table is visible', async ({ page }) => {
    await expect(page.locator('#sec-jobprofiles')).toBeVisible();
    await expect(page.locator('#sec-jobprofiles table')).toBeVisible();
  });

  test('Table headers show correct columns', async ({ page }) => {
    const headers = await page.locator('#sec-jobprofiles thead th').allTextContents();
    expect(headers).toContain('Title');
    expect(headers).toContain('Users');
    expect(headers).toContain('Status');
    expect(headers).toContain('Actions');
  });

  test('Job profiles are loaded and rendered', async ({ page }) => {
    await page.waitForTimeout(500);
    const rows = page.locator('#jobProfilesBody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('"+ New Profile" button opens the Job Profile modal', async ({ page }) => {
    await page.locator('#sec-jobprofiles .btn-primary', { hasText: /New Profile/i }).click();
    await expect(page.locator('#jobProfileModal')).toBeVisible();
    await expect(page.locator('#jpModalTitle')).toContainText('Create Job Profile');
  });

  test('Job Profile modal has Title and Description fields', async ({ page }) => {
    await page.locator('#sec-jobprofiles .btn-primary', { hasText: /New Profile/i }).click();
    await expect(page.locator('#jp_title')).toBeVisible();
    await expect(page.locator('#jp_desc')).toBeVisible();
  });

  test('Creating a job profile calls the API', async ({ page }) => {
    let apiCalled = false;
    await page.route('**/api/admin/job-profiles', route => {
      if (route.request().method() === 'POST') apiCalled = true;
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, id: 5 }) });
    });

    await page.locator('#sec-jobprofiles .btn-primary', { hasText: /New Profile/i }).click();
    await page.fill('#jp_title', 'Senior CA Specialist');
    await page.fill('#jp_desc', 'Handles complex tax filings and audits');
    await page.locator('#saveJpBtn').click();
    await page.waitForTimeout(500);
    expect(apiCalled).toBe(true);
  });

  test('Job Profile modal Cancel button closes it', async ({ page }) => {
    await page.locator('#sec-jobprofiles .btn-primary', { hasText: /New Profile/i }).click();
    await page.locator('#jobProfileModal .btn-ghost', { hasText: /Cancel/i }).click();
    await expect(page.locator('#jobProfileModal')).toBeHidden();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  REPORTING HIERARCHY SECTION
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Admin — Reporting Hierarchy', () => {

  test.beforeEach(async ({ page }) => {
    await adminLoginAndLoad(page);
    await page.locator('#nav-hierarchy').click();
    await page.waitForTimeout(400);
  });

  test('Hierarchy section is visible', async ({ page }) => {
    await expect(page.locator('#sec-hierarchy')).toBeVisible();
    await expect(page.locator('#hierarchyTree')).toBeVisible();
  });

  test('"+ Assign Manager" button opens the hierarchy modal', async ({ page }) => {
    await page.locator('#sec-hierarchy .btn-primary', { hasText: /Assign Manager/i }).click();
    await expect(page.locator('#hierarchyModal')).toBeVisible();
  });

  test('Hierarchy modal has Employee, Manager, and Priority fields', async ({ page }) => {
    await page.locator('#sec-hierarchy .btn-primary', { hasText: /Assign Manager/i }).click();
    await expect(page.locator('#h_employee')).toBeVisible();
    await expect(page.locator('#h_manager')).toBeVisible();
    await expect(page.locator('#h_priority')).toBeVisible();
  });

  test('Priority dropdown has Primary and Secondary options', async ({ page }) => {
    await page.locator('#sec-hierarchy .btn-primary', { hasText: /Assign Manager/i }).click();
    const opts = await page.locator('#h_priority option').allTextContents();
    const allText = opts.join(' ');
    expect(allText).toMatch(/primary/i);
    expect(allText).toMatch(/secondary/i);
  });

  test('Assigning a manager calls the hierarchy API', async ({ page }) => {
    let apiCalled = false;
    await page.route('**/api/admin/hierarchy', route => {
      if (route.request().method() === 'POST') apiCalled = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });

    await page.locator('#sec-hierarchy .btn-primary', { hasText: /Assign Manager/i }).click();

    // Populate selects if options are loaded
    const empSelect = page.locator('#h_employee');
    const mgrSelect = page.locator('#h_manager');
    const empCount  = await empSelect.locator('option').count();
    const mgrCount  = await mgrSelect.locator('option').count();

    if (empCount > 1) await empSelect.selectOption({ index: 1 });
    if (mgrCount > 1) await mgrSelect.selectOption({ index: 1 });

    await page.locator('#hierarchyModal .btn-primary', { hasText: /Assign/i }).click();
    await page.waitForTimeout(500);
    expect(apiCalled).toBe(true);
  });

  test('Hierarchy modal Cancel button closes it', async ({ page }) => {
    await page.locator('#sec-hierarchy .btn-primary', { hasText: /Assign Manager/i }).click();
    await page.locator('#hierarchyModal .btn-ghost', { hasText: /Cancel/i }).click();
    await expect(page.locator('#hierarchyModal')).toBeHidden();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  VERTICALS (MASTER DATA)
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Admin — Verticals (Master Data)', () => {

  test.beforeEach(async ({ page }) => {
    await adminLoginAndLoad(page);
    await page.locator('#nav-verticals').click();
    await page.waitForTimeout(400);
  });

  test('Verticals table is visible with correct headers', async ({ page }) => {
    await expect(page.locator('#sec-verticals table')).toBeVisible();
    const headers = await page.locator('#sec-verticals thead th').allTextContents();
    expect(headers).toContain('Code');
    expect(headers).toContain('Name');
    expect(headers).toContain('Type');
    expect(headers).toContain('Status');
  });

  test('Verticals are loaded from the API', async ({ page }) => {
    await page.waitForTimeout(500);
    const rows = page.locator('#verticalsBody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('System verticals show "System" badge', async ({ page }) => {
    await page.waitForTimeout(500);
    await expect(page.locator('.badge-system').first()).toBeVisible();
  });

  test('"+ New Vertical" button opens the Vertical modal', async ({ page }) => {
    await page.locator('#sec-verticals .btn-primary', { hasText: /New Vertical/i }).click();
    await expect(page.locator('#verticalModal')).toBeVisible();
    await expect(page.locator('#vertModalTitle')).toContainText('New Vertical');
  });

  test('Vertical modal has Code, Name, Icon and Order fields', async ({ page }) => {
    await page.locator('#sec-verticals .btn-primary', { hasText: /New Vertical/i }).click();
    await expect(page.locator('#vert_code')).toBeVisible();
    await expect(page.locator('#vert_name')).toBeVisible();
    await expect(page.locator('#vert_icon')).toBeVisible();
    await expect(page.locator('#vert_order')).toBeVisible();
  });

  test('Creating a vertical calls the API', async ({ page }) => {
    let apiCalled = false;
    await page.route('**/api/admin/verticals', route => {
      if (route.request().method() === 'POST') apiCalled = true;
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, id: 4 }) });
    });

    await page.locator('#sec-verticals .btn-primary', { hasText: /New Vertical/i }).click();
    await page.fill('#vert_code', 'wealth');
    await page.fill('#vert_name', 'Wealth Management');
    await page.fill('#vert_icon', '💼');
    await page.locator('#saveVertBtn').click();
    await page.waitForTimeout(500);
    expect(apiCalled).toBe(true);
  });

  test('Vertical modal Cancel button closes it', async ({ page }) => {
    await page.locator('#sec-verticals .btn-primary', { hasText: /New Vertical/i }).click();
    await page.locator('#verticalModal .btn-ghost', { hasText: /Cancel/i }).click();
    await expect(page.locator('#verticalModal')).toBeHidden();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  PRODUCTS / CATEGORIES (MASTER DATA)
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Admin — Products / Categories (Master Data)', () => {

  test.beforeEach(async ({ page }) => {
    await adminLoginAndLoad(page);
    await page.locator('#nav-categories').click();
    await page.waitForTimeout(400);
  });

  test('Categories table is visible with correct headers', async ({ page }) => {
    await expect(page.locator('#sec-categories table')).toBeVisible();
    const headers = await page.locator('#sec-categories thead th').allTextContents();
    expect(headers).toContain('Code');
    expect(headers).toContain('Name');
    expect(headers).toContain('Vertical');
    expect(headers).toContain('Status');
  });

  test('Categories are loaded from the API', async ({ page }) => {
    await page.waitForTimeout(500);
    const rows = page.locator('#categoriesBody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('"+ New Product" button opens the Category modal', async ({ page }) => {
    await page.locator('#sec-categories .btn-primary', { hasText: /New Product/i }).click();
    await expect(page.locator('#categoryModal')).toBeVisible();
    await expect(page.locator('#catModalTitle')).toContainText('New Product');
  });

  test('Category modal has Vertical, Code, Name, Icon, and PS Template fields', async ({ page }) => {
    await page.locator('#sec-categories .btn-primary', { hasText: /New Product/i }).click();
    await expect(page.locator('#cat_vertical')).toBeVisible();
    await expect(page.locator('#cat_code')).toBeVisible();
    await expect(page.locator('#cat_name')).toBeVisible();
    await expect(page.locator('#cat_icon')).toBeVisible();
    await expect(page.locator('#cat_psTemplate')).toBeVisible();
  });

  test('PS Template dropdown has the expected options', async ({ page }) => {
    await page.locator('#sec-categories .btn-primary', { hasText: /New Product/i }).click();
    const opts = await page.locator('#cat_psTemplate option').allTextContents();
    expect(opts).toContain('None');
    expect(opts).toContain('MF Purchase');
    expect(opts).toContain('Insurance');
    expect(opts).toContain('Fixed Deposit');
  });

  test('Creating a category calls the API', async ({ page }) => {
    let apiCalled = false;
    await page.route('**/api/admin/categories', route => {
      if (route.request().method() === 'POST') apiCalled = true;
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, id: 15 }) });
    });

    await page.locator('#sec-categories .btn-primary', { hasText: /New Product/i }).click();
    const vertSelect = page.locator('#cat_vertical');
    const optCount = await vertSelect.locator('option').count();
    if (optCount > 1) await vertSelect.selectOption({ index: 1 });
    await page.fill('#cat_code', 'bonds');
    await page.fill('#cat_name', 'Bonds & Debentures');
    await page.locator('#saveCatBtn').click();
    await page.waitForTimeout(500);
    expect(apiCalled).toBe(true);
  });

  test('Category modal Cancel button closes it', async ({ page }) => {
    await page.locator('#sec-categories .btn-primary', { hasText: /New Product/i }).click();
    await page.locator('#categoryModal .btn-ghost', { hasText: /Cancel/i }).click();
    await expect(page.locator('#categoryModal')).toBeHidden();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  TRANSACTION TYPES / NATURES (MASTER DATA)
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Admin — Transaction Types / Natures (Master Data)', () => {

  test.beforeEach(async ({ page }) => {
    await adminLoginAndLoad(page);
    await page.locator('#nav-natures').click();
    await page.waitForTimeout(400);
  });

  test('Natures table is visible with correct headers', async ({ page }) => {
    await expect(page.locator('#sec-natures table')).toBeVisible();
    const headers = await page.locator('#sec-natures thead th').allTextContents();
    expect(headers).toContain('Code');
    expect(headers).toContain('Name');
    expect(headers).toContain('Product');
    expect(headers).toContain('FT');
    expect(headers).toContain('NFT');
    expect(headers).toContain('Status');
  });

  test('Transaction types are loaded from the API', async ({ page }) => {
    await page.waitForTimeout(500);
    const rows = page.locator('#naturesBody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('"+ New Type" button opens the Nature modal', async ({ page }) => {
    await page.locator('#sec-natures .btn-primary', { hasText: /New Type/i }).click();
    await expect(page.locator('#natureModal')).toBeVisible();
    await expect(page.locator('#natModalTitle')).toContainText('New Transaction Type');
  });

  test('Nature modal has Product, Code, Name, Icon, Description fields', async ({ page }) => {
    await page.locator('#sec-natures .btn-primary', { hasText: /New Type/i }).click();
    await expect(page.locator('#nat_category')).toBeVisible();
    await expect(page.locator('#nat_code')).toBeVisible();
    await expect(page.locator('#nat_name')).toBeVisible();
    await expect(page.locator('#nat_icon')).toBeVisible();
    await expect(page.locator('#nat_desc')).toBeVisible();
  });

  test('Nature modal has FT and NFT toggle switches', async ({ page }) => {
    await page.locator('#sec-natures .btn-primary', { hasText: /New Type/i }).click();
    await expect(page.locator('#nat_ftToggle')).toBeVisible();
    await expect(page.locator('#nat_nftToggle')).toBeVisible();
  });

  test('FT toggle can be turned off', async ({ page }) => {
    await page.locator('#sec-natures .btn-primary', { hasText: /New Type/i }).click();
    const toggle = page.locator('#nat_ftToggle');
    await expect(toggle).toHaveClass(/on/); // starts as ON
    await toggle.click();
    await expect(toggle).not.toHaveClass(/on/);
  });

  test('Creating a transaction nature calls the API', async ({ page }) => {
    let apiCalled = false;
    await page.route('**/api/admin/natures', route => {
      if (route.request().method() === 'POST') apiCalled = true;
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, id: 30 }) });
    });

    await page.locator('#sec-natures .btn-primary', { hasText: /New Type/i }).click();
    const catSelect = page.locator('#nat_category');
    const optCount = await catSelect.locator('option').count();
    if (optCount > 1) await catSelect.selectOption({ index: 1 });
    await page.fill('#nat_code', 'stp');
    await page.fill('#nat_name', 'STP Registration');
    await page.locator('#saveNatBtn').click();
    await page.waitForTimeout(500);
    expect(apiCalled).toBe(true);
  });

  test('Nature modal Cancel button closes it', async ({ page }) => {
    await page.locator('#sec-natures .btn-primary', { hasText: /New Type/i }).click();
    await page.locator('#natureModal .btn-ghost', { hasText: /Cancel/i }).click();
    await expect(page.locator('#natureModal')).toBeHidden();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  MASTER DATA WIZARD
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Admin — Master Data Wizard', () => {

  test.beforeEach(async ({ page }) => {
    await adminLoginAndLoad(page);
  });

  test('Clicking "+ Add via Wizard" opens the wizard modal', async ({ page }) => {
    await page.locator('.sidebar .btn-primary', { hasText: /Wizard/i }).click();
    await expect(page.locator('#masterWizard')).toBeVisible();
  });

  test('Wizard Step 1 shows the Vertical section', async ({ page }) => {
    await page.locator('.sidebar .btn-primary', { hasText: /Wizard/i }).click();
    await expect(page.locator('#wiz-step-1')).toBeVisible();
    await expect(page.locator('#wiz_vertCode')).toBeVisible();
    await expect(page.locator('#wiz_vertName')).toBeVisible();
  });

  test('Wizard step indicator shows step 1 as active', async ({ page }) => {
    await page.locator('.sidebar .btn-primary', { hasText: /Wizard/i }).click();
    const dot1 = page.locator('#wiz-dot-1');
    await expect(dot1).toBeVisible();
    // Step 1 dot should have the accent background
    const style = await dot1.getAttribute('style');
    expect(style).toMatch(/background:var\(--accent\)/);
  });

  test('Clicking Next in Step 1 advances to Step 2', async ({ page }) => {
    await page.locator('.sidebar .btn-primary', { hasText: /Wizard/i }).click();
    // Either select existing vertical or create new
    const existingSelect = page.locator('#wiz_existingVert');
    const optCount = await existingSelect.locator('option').count();
    if (optCount > 1) {
      await existingSelect.selectOption({ index: 1 });
    } else {
      await page.fill('#wiz_vertCode', 'testv');
      await page.fill('#wiz_vertName', 'Test Vertical');
    }
    await page.locator('#masterWizard .btn-primary', { hasText: /Next: Add Product/i }).click();
    await page.waitForTimeout(400);
    await expect(page.locator('#wiz-step-2')).toBeVisible();
    await expect(page.locator('#wiz-step-1')).toBeHidden();
  });

  test('Wizard close (✕) button closes the modal', async ({ page }) => {
    await page.locator('.sidebar .btn-primary', { hasText: /Wizard/i }).click();
    await page.locator('#masterWizard .modal-close').first().click();
    await expect(page.locator('#masterWizard')).toBeHidden();
  });
});
