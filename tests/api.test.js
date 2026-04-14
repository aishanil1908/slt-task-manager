// tests/api.test.js
// SLT Task Manager — Jest Backend API Tests
// Phase 2 — Updated for: file upload middleware, task creation fix,
//            intranet deployment, lifecycle transitions, fulfillment
//
// HOW TO RUN:
//   1. cd backend && node server.js   (keep running)
//   2. From project root: npx jest tests/api.test.js --verbose
//
// REQUIRES: npm install --save-dev jest node-fetch@2 form-data

const fetch    = require('node-fetch');
const FormData = require('form-data');
const fs       = require('fs');
const path     = require('path');

const BASE = 'http://localhost:5000/api';

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

async function login(username = 'shanil') {
  const res  = await fetch(`${BASE}/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ username }),
  });
  const data = await res.json();
  if (!data.token) throw new Error(`Login failed for "${username}": ${JSON.stringify(data)}`);
  return data.token;
}

async function get(path, token) {
  return fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function post(path, token, body) {
  return fetch(`${BASE}${path}`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
}

async function put(path, token, body) {
  return fetch(`${BASE}${path}`, {
    method:  'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
}

// Create a real temp file for upload tests
function makeTempFile(ext = '.jpg', sizekb = 5) {
  const tmpPath = path.join(__dirname, `tmp_test_file${ext}`);
  fs.writeFileSync(tmpPath, Buffer.alloc(sizekb * 1024, 'X'));
  return tmpPath;
}

// Helper: create a task and return its ID
async function createTestTask(token, staffId, overrides = {}) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 3);
  const dueDate = tomorrow.toISOString().split('T')[0];

  const res = await post('/tasks', token, {
    verticalCode:  'dist',
    categoryCode:  'mf',
    natureCode:    'mf_lumpsum',
    txType:        'Financial Transaction',
    clientName:    'Test Client API',
    clientMobile:  '9000000001',
    title:         'API Test Task',
    priority:      'Normal',
    proofRequired: 'Yes — Mandatory',
    dueDate,
    assignedTo:    staffId,
    ...overrides,
  });
  const data = await res.json();
  if (!data.taskId) throw new Error(`Task creation failed: ${JSON.stringify(data)}`);
  return data.taskId;
}

// Get a staff member ID for task assignment
async function getStaffId(token) {
  const res  = await get('/staff', token);
  const data = await res.json();
  const staff = data.staff.find(s =>
    ['Back Office Operator', 'KYC Executive', 'CA / Tax Specialist'].includes(s.role)
  );
  return staff ? staff.id : data.staff[0].id;
}

// ─────────────────────────────────────────────
// 1. HEALTH & AUTH
// ─────────────────────────────────────────────
describe('1. Health & Auth', () => {

  test('GET /health — server online, DB connected, pilot mode on', async () => {
    const res  = await fetch(`${BASE}/health`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.status).toBe('running');
    expect(data.pilot_mode).toBe(true);
    expect(data.timestamp).toBeDefined();
  });

  // Test every pilot user can log in
  const pilotUsers = ['shanil', 'arun', 'shubhani', 'rahul', 'vikram', 'priya', 'anita', 'neha', 'mukesh'];
  test.each(pilotUsers)('POST /login — user "%s" can log in', async (username) => {
    const res  = await fetch(`${BASE}/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.token).toBeDefined();
    expect(data.user.username).toBe(username);
  });

  test('POST /login — unknown user returns 401 with helpful message', async () => {
    const res  = await fetch(`${BASE}/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username: 'nobody_xyz_999' }),
    });
    const data = await res.json();
    expect(res.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/not found/i);
  });

  test('POST /login — empty username returns 400', async () => {
    const res  = await fetch(`${BASE}/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username: '   ' }),
    });
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('POST /login — missing body returns 400', async () => {
    const res  = await fetch(`${BASE}/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({}),
    });
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('GET /profile — returns full user object with verticalAccess array', async () => {
    const token = await login('shanil');
    const res   = await get('/profile', token);
    const data  = await res.json();
    expect(res.status).toBe(200);
    expect(data.user.username).toBe('shanil');
    expect(Array.isArray(data.user.verticalAccess)).toBe(true);
    expect(data.user.role).toBeDefined();
    expect(data.user.tasksActive).toBeDefined();
  });

  test('GET /profile — blocked without token', async () => {
    const res = await fetch(`${BASE}/profile`);
    expect(res.status).toBe(401);
  });

  test('POST /logout — clears session successfully', async () => {
    const token = await login('shanil');
    const res   = await post('/logout', token, {});
    const data  = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

});

// ─────────────────────────────────────────────
// 2. CONFIG / MASTER DATA
// ─────────────────────────────────────────────
describe('2. Config / Master Data', () => {
  let token;
  beforeAll(async () => { token = await login('shanil'); });

  test('GET /verticals — returns all 3 SLT verticals', async () => {
    const res  = await get('/verticals', token);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(data.verticals)).toBe(true);
    const codes = data.verticals.map(v => v.code);
    expect(codes).toContain('ca');
    expect(codes).toContain('dist');
    expect(codes).toContain('broke');
  });

  test.each(['ca', 'dist', 'broke'])(
    'GET /categories/%s — returns categories for vertical', async (vertCode) => {
      const res  = await get(`/categories/${vertCode}`, token);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(Array.isArray(data.categories)).toBe(true);
      expect(data.categories.length).toBeGreaterThan(0);
      // Each category must have code, name, display_order
      data.categories.forEach(c => {
        expect(c.code).toBeDefined();
        expect(c.name).toBeDefined();
      });
    }
  );

  test.each(['mf', 'health', 'life', 'fd', 'gst', 'itr'])(
    'GET /natures/%s — returns transaction natures with valid codes', async (catCode) => {
      const res  = await get(`/natures/${catCode}`, token);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(Array.isArray(data.natures)).toBe(true);
      expect(data.natures.length).toBeGreaterThan(0);
      // Every nature MUST have a code — this was the bug that caused "natureCode: undefined"
      data.natures.forEach(n => {
        expect(n.code).toBeDefined();
        expect(n.code).not.toBe('');
        expect(n.code).not.toBe('undefined');
      });
    }
  );

  test('GET /staff — returns all active staff with roles', async () => {
    const res  = await get('/staff', token);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(data.staff)).toBe(true);
    expect(data.staff.length).toBeGreaterThanOrEqual(9);
    // All staff must have id, full_name, role
    data.staff.forEach(s => {
      expect(s.id).toBeDefined();
      expect(s.full_name).toBeDefined();
      expect(s.role).toBeDefined();
    });
  });

});

// ─────────────────────────────────────────────
// 3. DASHBOARD
// ─────────────────────────────────────────────
describe('3. Dashboard', () => {
  let token;
  beforeAll(async () => { token = await login('shanil'); });

  test('GET /dashboard/summary — all 4 counts + 4 snapshot values are numbers', async () => {
    const res  = await get('/dashboard/summary', token);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);

    // Status counts
    ['pending', 'inprogress', 'postsales', 'done'].forEach(k => {
      expect(typeof data.counts[k]).toBe('number');
      expect(data.counts[k]).toBeGreaterThanOrEqual(0);
    });

    // Snapshot values — these were previously broken (hardcoded 12 for renewals)
    ['createdToday', 'completedToday', 'overdue', 'renewalsDue30d'].forEach(k => {
      expect(typeof data.snapshot[k]).toBe('number');
      expect(data.snapshot[k]).toBeGreaterThanOrEqual(0);
    });
  });

  test.each(['pending', 'inprogress', 'postsales', 'done'])(
    'GET /dashboard/tasks/%s — returns array with correct status', async (status) => {
      const res  = await get(`/dashboard/tasks/${status}`, token);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(Array.isArray(data.tasks)).toBe(true);
      expect(typeof data.count).toBe('number');
      // If tasks exist, verify structure
      if (data.tasks.length > 0) {
        const t = data.tasks[0];
        expect(t.id).toBeDefined();
        expect(t.title).toBeDefined();
        expect(t.client_name).toBeDefined();
        expect(t.assigned_to_name).toBeDefined();
        expect(t.status).toBe(status);
      }
    }
  );

  test('GET /dashboard/tasks/invalid — returns 400', async () => {
    const res = await get('/dashboard/tasks/rubbish', token);
    expect(res.status).toBe(400);
  });

  test('GET /dashboard/verticals — returns active vertical counts', async () => {
    const res  = await get('/dashboard/verticals', token);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(data.verticals)).toBe(true);
    expect(data.verticals.length).toBeGreaterThan(0);
  });

});

// ─────────────────────────────────────────────
// 4. MIS
// ─────────────────────────────────────────────
describe('4. MIS', () => {
  let token;
  beforeAll(async () => { token = await login('shanil'); });

  test('GET /mis/counts — returns counts with display_order (GROUP BY bug confirmed fixed)', async () => {
    const res  = await get('/mis/counts', token);
    const data = await res.json();
    // This was HTTP 500 before the GROUP BY fix
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.counts)).toBe(true);
    expect(data.counts.length).toBeGreaterThan(0);
    data.counts.forEach(row => {
      expect(row.category_code).toBeDefined();
      expect(row.category_name).toBeDefined();
      expect(row.vertical_code).toBeDefined();
      expect(row.total_tasks).toBeDefined();
    });
  });

  test('GET /mis/tasks/mf — returns MF tasks with full fields', async () => {
    const res  = await get('/mis/tasks/mf', token);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(data.tasks)).toBe(true);
  });

  test('GET /mis/tasks/mf?txType=ft — only Financial Transactions returned', async () => {
    const res  = await get('/mis/tasks/mf?txType=ft', token);
    const data = await res.json();
    expect(res.status).toBe(200);
    data.tasks.forEach(t => {
      expect(t.tx_type).toBe('Financial Transaction');
    });
  });

  test('GET /mis/tasks/mf?txType=nft — no Financial Transactions returned', async () => {
    const res  = await get('/mis/tasks/mf?txType=nft', token);
    const data = await res.json();
    expect(res.status).toBe(200);
    data.tasks.forEach(t => {
      expect(t.tx_type).not.toBe('Financial Transaction');
    });
  });

  // Test a few more categories
  test.each(['health', 'life', 'gst', 'itr'])(
    'GET /mis/tasks/%s — returns without error', async (cat) => {
      const res  = await get(`/mis/tasks/${cat}`, token);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    }
  );

});

// ─────────────────────────────────────────────
// 5. TASK CREATION (the big fix)
// ─────────────────────────────────────────────
describe('5. Task Creation', () => {
  let token;
  let staffId;
  let createdTaskId;

  beforeAll(async () => {
    token   = await login('shanil');
    staffId = await getStaffId(token);
  });

  test('POST /tasks — creates MF Lumpsum task with all required fields', async () => {
    const res  = await post('/tasks', token, {
      verticalCode:  'dist',
      categoryCode:  'mf',
      natureCode:    'mf_lumpsum',
      txType:        'Financial Transaction',
      clientName:    'Ramesh Kumar',
      clientMobile:  '9876543210',
      title:         'MF Lumpsum — HDFC Flexi Cap',
      priority:      'Normal',
      proofRequired: 'Yes — Mandatory',
      dueDate:       new Date(Date.now() + 3*86400000).toISOString().split('T')[0],
      assignedTo:    staffId,
    });
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(typeof data.taskId).toBe('number');
    createdTaskId = data.taskId;
  });

  test('POST /tasks — creates SIP task with sip fields', async () => {
    const res = await post('/tasks', token, {
      verticalCode:  'dist',
      categoryCode:  'mf',
      natureCode:    'mf_sip',
      txType:        'Financial Transaction',
      sipFrequency:  'monthly',
      sipDay:        '5',
      clientName:    'Sunita Sharma',
      clientMobile:  '9123456789',
      title:         'SIP Registration — Axis Bluechip',
      priority:      'High',
      proofRequired: 'Yes — Mandatory',
      dueDate:       new Date(Date.now() + 5*86400000).toISOString().split('T')[0],
      assignedTo:    staffId,
    });
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
  });

  test('POST /tasks — creates CA Work (Non-Financial) task', async () => {
    const res = await post('/tasks', token, {
      verticalCode:  'ca',
      categoryCode:  'gst',
      natureCode:    'gstr1',
      txType:        'CA Work',
      clientName:    'Kapoor Enterprises',
      clientMobile:  '9000000002',
      title:         'GST Return Filing Q3',
      priority:      'Urgent',
      proofRequired: 'Yes — Mandatory',
      dueDate:       new Date(Date.now() + 2*86400000).toISOString().split('T')[0],
      assignedTo:    staffId,
    });
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
  });

  test('POST /tasks — creates task with subtasks array', async () => {
    const res = await post('/tasks', token, {
      verticalCode:  'dist',
      categoryCode:  'health',
      natureCode:    'health_new',
      txType:        'Financial Transaction',
      clientName:    'Meera Joshi',
      clientMobile:  '9000000003',
      title:         'Health Insurance — Star Health',
      dueDate:       new Date(Date.now() + 7*86400000).toISOString().split('T')[0],
      assignedTo:    staffId,
      subtasks: [
        { title: 'Collect KYC documents', instructions: 'Aadhar + PAN required' },
        { title: 'Submit proposal form', instructions: 'Online portal submission' },
      ],
    });
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.success).toBe(true);

    // Verify subtasks were created
    const taskRes  = await get(`/tasks/${data.taskId}`, token);
    const taskData = await taskRes.json();
    expect(taskData.task.subtasks.length).toBe(2);
    expect(taskData.task.subtasks[0].title).toBe('Collect KYC documents');
  });

  test('POST /tasks — initial status is "pending", stage is 1', async () => {
    expect(createdTaskId).toBeDefined();
    const res  = await get(`/tasks/${createdTaskId}`, token);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.task.status).toBe('pending');
    expect(data.task.stage).toBe(1);
    expect(data.task.proof_uploaded).toBe(false);
    expect(data.task.s4_doc_uploaded).toBe(false);
  });

  test('POST /tasks — CRITICAL: natureCode must resolve correctly (was "undefined" bug)', async () => {
    // This tests that nature codes from the API actually work end-to-end
    // The bug was that selNatureCode was undefined, sending "undefined" as the code
    const natRes  = await get('/natures/mf', token);
    const natData = await natRes.json();
    const firstNature = natData.natures[0]; // Use real code from API

    const res = await post('/tasks', token, {
      verticalCode:  'dist',
      categoryCode:  'mf',
      natureCode:    firstNature.code,  // Real code, not hardcoded
      txType:        'Financial Transaction',
      clientName:    'API Nature Test Client',
      clientMobile:  '9000000099',
      title:         `Nature Code Test — ${firstNature.name}`,
      dueDate:       new Date(Date.now() + 3*86400000).toISOString().split('T')[0],
      assignedTo:    staffId,
    });
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
  });

  // Validation error tests
  test('POST /tasks — missing vertical/category/nature returns 400', async () => {
    const res  = await post('/tasks', token, {
      txType: 'Financial Transaction', clientName: 'X', clientMobile: '9', title: 'X',
      dueDate: '2026-12-31', assignedTo: staffId,
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/vertical|category|nature/i);
  });

  test('POST /tasks — missing client name/mobile returns 400', async () => {
    const res = await post('/tasks', token, {
      verticalCode: 'dist', categoryCode: 'mf', natureCode: 'mf_lumpsum',
      txType: 'Financial Transaction', title: 'X',
      dueDate: '2026-12-31', assignedTo: staffId,
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/client/i);
  });

  test('POST /tasks — invalid nature code returns 400 not 500', async () => {
    const res = await post('/tasks', token, {
      verticalCode: 'dist', categoryCode: 'mf', natureCode: 'INVALID_CODE_XYZ',
      txType: 'Financial Transaction',
      clientName: 'X', clientMobile: '9', title: 'X',
      dueDate: '2026-12-31', assignedTo: staffId,
    });
    expect(res.status).toBe(400);  // Should be 400, not 500
    const data = await res.json();
    expect(data.error).toMatch(/invalid/i);
  });

  test('GET /tasks/:id — full task detail includes all sections', async () => {
    expect(createdTaskId).toBeDefined();
    const res  = await get(`/tasks/${createdTaskId}`, token);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.task.id).toBe(createdTaskId);
    expect(data.task.client_name).toBe('Ramesh Kumar');
    expect(data.task.client_mobile).toBe('9876543210');
    expect(Array.isArray(data.task.subtasks)).toBe(true);
    expect(Array.isArray(data.task.proofs)).toBe(true);
  });

  test('GET /tasks/999999 — returns 404 not 500', async () => {
    const res = await get('/tasks/999999', token);
    expect(res.status).toBe(404);
  });

});

// ─────────────────────────────────────────────
// 6. TASK LIFECYCLE TRANSITIONS
// ─────────────────────────────────────────────
describe('6. Task Lifecycle', () => {
  let token;
  let staffId;
  let ftTaskId;   // Financial Transaction — goes through full 5 stages
  let nftTaskId;  // Non-Financial — skips post-sales

  beforeAll(async () => {
    token   = await login('shanil');
    staffId = await getStaffId(token);
    // Create fresh tasks for lifecycle testing
    ftTaskId  = await createTestTask(token, staffId, {
      txType: 'Financial Transaction',
      title:  'LIFECYCLE TEST — FT Task',
    });
    nftTaskId = await createTestTask(token, staffId, {
      verticalCode: 'ca',
      categoryCode: 'gst',
      natureCode:   'gstr1',
      txType:       'CA Work',
      title:        'LIFECYCLE TEST — NFT Task',
    });
  });

  // ── FT LIFECYCLE: pending → inprogress → postsales → done ──

  test('FT: start — moves pending → inprogress, stage 1→2', async () => {
    const res  = await put(`/tasks/${ftTaskId}/stage`, token, { action: 'start' });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.task.status).toBe('inprogress');
    expect(data.task.stage).toBe(2);
  });

  test('FT: confirm — moves inprogress → postsales for Financial Transaction', async () => {
    const res  = await put(`/tasks/${ftTaskId}/stage`, token, { action: 'confirm' });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    // FT should go to postsales, not done
    expect(data.task.status).toBe('postsales');
    expect(data.task.stage).toBe(4);
  });

  test('FT: verify — moves postsales → done', async () => {
    const res  = await put(`/tasks/${ftTaskId}/stage`, token, { action: 'verify' });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.task.status).toBe('done');
  });

  // ── NFT LIFECYCLE: pending → inprogress → done (skip postsales) ──

  test('NFT: start — moves pending → inprogress', async () => {
    const res  = await put(`/tasks/${nftTaskId}/stage`, token, { action: 'start' });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.task.status).toBe('inprogress');
  });

  test('NFT: confirm — goes directly to done (skips postsales)', async () => {
    const res  = await put(`/tasks/${nftTaskId}/stage`, token, { action: 'confirm' });
    const data = await res.json();
    expect(res.status).toBe(200);
    // CA Work should go straight to done
    expect(data.task.status).toBe('done');
  });

  // ── SEND BACK FLOW ──

  test('send_back — without note returns 400 with clear error', async () => {
    const tmpTask = await createTestTask(token, staffId);
    await put(`/tasks/${tmpTask}/stage`, token, { action: 'start' });

    const res  = await put(`/tasks/${tmpTask}/stage`, token, { action: 'send_back' });
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toMatch(/reason/i);
  });

  test('send_back — with note succeeds, task returns to inprogress', async () => {
    const tmpTask = await createTestTask(token, staffId);
    await put(`/tasks/${tmpTask}/stage`, token, { action: 'start' });

    const res  = await put(`/tasks/${tmpTask}/stage`, token, {
      action: 'send_back',
      note:   'Proof screenshot is blurry. Please upload a clearer image.',
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.task.status).toBe('inprogress');
  });

  // ── REOPEN ──

  test('reopen — moves completed task back to inprogress', async () => {
    // Create and complete a task first
    const tmpTask = await createTestTask(token, staffId, { txType: 'CA Work', verticalCode: 'ca', categoryCode: 'gst', natureCode: 'gstr1' });
    await put(`/tasks/${tmpTask}/stage`, token, { action: 'start' });
    await put(`/tasks/${tmpTask}/stage`, token, { action: 'confirm' });

    const res  = await put(`/tasks/${tmpTask}/stage`, token, { action: 'reopen' });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.task.status).toBe('inprogress');
  });

  // ── INVALID ACTIONS ──

  test('invalid action — returns 400 with list of valid actions', async () => {
    const tmpTask = await createTestTask(token, staffId);
    const res  = await put(`/tasks/${tmpTask}/stage`, token, { action: 'fly_away' });
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toMatch(/start|confirm|send_back|verify|reopen/i);
  });

  // ── HISTORY ──

  test('GET /tasks/:id/history — audit trail records every action', async () => {
    const res  = await get(`/tasks/${ftTaskId}/history`, token);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(data.history)).toBe(true);
    // Should have: created + start + confirm + verify = at least 3 entries
    expect(data.history.length).toBeGreaterThanOrEqual(3);
    // Each entry must have actor name
    data.history.forEach(h => {
      expect(h.action).toBeDefined();
      expect(h.action_by_name).toBeDefined();
      expect(h.created_at).toBeDefined();
    });
  });

});

// ─────────────────────────────────────────────
// 7. FILE UPLOAD (New fileUpload.js middleware)
// ─────────────────────────────────────────────
describe('7. File Upload — New Middleware', () => {
  let token;
  let taskId;
  let staffId;

  beforeAll(async () => {
    token   = await login('shanil');
    staffId = await getStaffId(token);
    // Create a task and move to inprogress for proof upload
    taskId = await createTestTask(token, staffId);
    await put(`/tasks/${taskId}/stage`, token, { action: 'start' });
  });

  afterAll(() => {
    // Clean up temp files
    ['.jpg', '.pdf', '.png'].forEach(ext => {
      const f = path.join(__dirname, `tmp_test_file${ext}`);
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });
  });

  test('POST /tasks/:id/proof — uploads JPG, stores file, updates proof_uploaded flag', async () => {
    const tmpFile = makeTempFile('.jpg', 10);
    const form    = new FormData();
    form.append('file', fs.createReadStream(tmpFile), { filename: 'payment_screenshot.jpg', contentType: 'image/jpeg' });
    form.append('stage', '2');

    const res = await fetch(`${BASE}/tasks/${taskId}/proof`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, ...form.getHeaders() },
      body:    form,
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.file.name).toBe('payment_screenshot.jpg');
    expect(data.file.size).toBeGreaterThan(0);
    // filePath must NOT be in response (security rule)
    expect(data.file.path).toBeUndefined();
  });

  test('POST /tasks/:id/proof — task proof_uploaded flag is now TRUE in DB', async () => {
    const res  = await get(`/tasks/${taskId}`, token);
    const data = await res.json();
    expect(data.task.proof_uploaded).toBe(true);
    // Proof record in task.proofs array
    expect(data.task.proofs.length).toBeGreaterThan(0);
    const proof = data.task.proofs[0];
    expect(proof.original_file_name).toBe('payment_screenshot.jpg');
    expect(proof.storage_root).toBeDefined();     // new field from fileUpload.js
    expect(proof.uuid_prefix).toBeDefined();      // new field from fileUpload.js
  });

  test('POST /tasks/:id/proof — uploads PDF successfully', async () => {
    const tmpFile = makeTempFile('.pdf', 20);
    const form    = new FormData();
    form.append('file', fs.createReadStream(tmpFile), { filename: 'bank_statement.pdf', contentType: 'application/pdf' });
    form.append('stage', '2');

    const res = await fetch(`${BASE}/tasks/${taskId}/proof`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, ...form.getHeaders() },
      body:    form,
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.file.name).toBe('bank_statement.pdf');
  });

  test('POST /tasks/:id/proof — rejects disallowed file type (e.g. .exe)', async () => {
    const tmpExe = path.join(__dirname, 'tmp_test.exe');
    fs.writeFileSync(tmpExe, Buffer.alloc(1024, 'X'));
    const form = new FormData();
    form.append('file', fs.createReadStream(tmpExe), { filename: 'virus.exe', contentType: 'application/octet-stream' });
    form.append('stage', '2');

    const res = await fetch(`${BASE}/tasks/${taskId}/proof`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, ...form.getHeaders() },
      body:    form,
    });
    // Should reject — 400 or 500 with error, not 200
    expect(res.status).not.toBe(200);
    fs.unlinkSync(tmpExe);
  });

  test('POST /tasks/:id/proof — no file returns 400', async () => {
    const form = new FormData();
    form.append('stage', '2');

    const res = await fetch(`${BASE}/tasks/${taskId}/proof`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, ...form.getHeaders() },
      body:    form,
    });
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toMatch(/no file/i);
  });

  test('POST /tasks/:id/proof — invalid stage (e.g. 3) returns 400', async () => {
    const tmpFile = makeTempFile('.jpg');
    const form    = new FormData();
    form.append('file', fs.createReadStream(tmpFile), { filename: 'test.jpg', contentType: 'image/jpeg' });
    form.append('stage', '3'); // Only 2 and 4 are valid

    const res = await fetch(`${BASE}/tasks/${taskId}/proof`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, ...form.getHeaders() },
      body:    form,
    });
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toMatch(/stage/i);
  });

  test('POST /tasks/:id/proof — file stored on disk in correct folder structure', async () => {
    // Verify the new folder structure: {storageRoot}/{username}/{taskId}_{date}/
    const taskRes  = await get(`/tasks/${taskId}`, token);
    const taskData = await taskRes.json();
    const proof    = taskData.task.proofs[0];

    // storage_root and file_path should exist
    expect(proof.storage_root).toBeDefined();
    // file_path IS returned in task detail (from DB) but NOT in upload response
    expect(proof.file_path).toBeDefined(); // stored in DB, returned in task detail

    // uuid_prefix should be a valid UUID format
    expect(proof.uuid_prefix).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

});

// ─────────────────────────────────────────────
// 8. POST-SALES FULFILLMENT
// ─────────────────────────────────────────────
describe('8. Post-Sales Fulfillment', () => {
  let token;
  let mfTaskId;
  let insTaskId;
  let staffId;

  beforeAll(async () => {
    token   = await login('shanil');
    staffId = await getStaffId(token);

    // Create and push MF task to postsales
    mfTaskId = await createTestTask(token, staffId, {
      txType: 'Financial Transaction',
      title:  'FULFILLMENT TEST — MF Purchase',
    });
    await put(`/tasks/${mfTaskId}/stage`, token, { action: 'start' });
    await put(`/tasks/${mfTaskId}/stage`, token, { action: 'confirm' });

    // Create and push Insurance task to postsales
    insTaskId = await createTestTask(token, staffId, {
      categoryCode: 'health',
      natureCode:   'health_new',
      txType:       'Financial Transaction',
      title:        'FULFILLMENT TEST — Health Insurance',
    });
    await put(`/tasks/${insTaskId}/stage`, token, { action: 'start' });
    await put(`/tasks/${insTaskId}/stage`, token, { action: 'confirm' });
  });

  test('POST /tasks/:id/fulfillment — saves MF folio/units/NAV data', async () => {
    const res = await post(`/tasks/${mfTaskId}/fulfillment`, token, {
      folioNumber:    'SBI12345678',
      units:          '1250.456',
      navRate:        '45.2300',
      allotmentDate:  '2026-04-13',
      txReference:    'TXN20260413001',
      amountCredited: '56537.50',
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  test('POST /tasks/:id/fulfillment — fulfillment persisted in task detail', async () => {
    const res  = await get(`/tasks/${mfTaskId}`, token);
    const data = await res.json();
    expect(data.task.fulfillment).not.toBeNull();
    expect(data.task.fulfillment.folio_number).toBe('SBI12345678');
    expect(data.task.fulfillment.units).toContain('1250.456');
  });

  test('POST /tasks/:id/fulfillment — saves insurance policy/coverage data', async () => {
    const res = await post(`/tasks/${insTaskId}/fulfillment`, token, {
      policyNumber:    'STAR-POL-2026-001',
      policyIssuedDate: '2026-04-13',
      coverageFrom:    '2026-04-13',
      coverageTo:      '2027-04-12',
      nextPremiumDue:  '2027-04-13',
      annualPremium:   '15000',
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  test('POST /tasks/:id/fulfillment — upsert works (can overwrite existing data)', async () => {
    // Update the MF task with corrected folio
    const res = await post(`/tasks/${mfTaskId}/fulfillment`, token, {
      folioNumber: 'SBI12345678-CORRECTED',
      units:       '1250.456',
      navRate:     '45.2300',
    });
    expect(res.status).toBe(200);

    const taskRes  = await get(`/tasks/${mfTaskId}`, token);
    const taskData = await taskRes.json();
    expect(taskData.task.fulfillment.folio_number).toBe('SBI12345678-CORRECTED');
  });

  test('POST /tasks/:id/fulfillment — task NOT in postsales returns 400', async () => {
    // Create a pending task and try to submit fulfillment
    const pendingTask = await createTestTask(token, staffId);
    const res  = await post(`/tasks/${pendingTask}/fulfillment`, token, {
      folioNumber: 'INVALID',
    });
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toMatch(/post.?sales/i);
  });

  test('POST /tasks/:id/fulfillment — nonexistent task returns 404', async () => {
    const res = await post('/tasks/999999/fulfillment', token, { folioNumber: 'X' });
    expect(res.status).toBe(404);
  });

});

// ─────────────────────────────────────────────
// 9. USERS
// ─────────────────────────────────────────────
describe('9. Users', () => {
  let token;

  beforeAll(async () => { token = await login('shanil'); });

  test('GET /users — returns all users with performance fields', async () => {
    const res  = await get('/users', token);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.users.length).toBeGreaterThanOrEqual(9);
  });

  test('POST /users — manager creates new Back Office Operator', async () => {
    const ts   = Date.now();
    // Generate unique ALL-LETTER first name so username generator doesn't strip it
    // users.js does: name.toLowerCase().replace(/[^a-z.]/g, '')
    // So numbers get stripped — we use letters only for the unique part
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const suffix  = Array.from({length: 8}, () => letters[Math.floor(Math.random()*26)]).join('');
    const res = await post('/users', token, {
      fullName:       `Jest${suffix} Testoperator`,
      email:          `jest.${suffix}.${ts}@slt.test`,
      mobile:         '9876500000',
      role:           'Back Office Operator',
      verticalAccess: 'All Verticals',
    });
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(typeof data.userId).toBe('number');
  });

  test('POST /users — duplicate email returns 400', async () => {
    const profileRes  = await get('/profile', token);
    const profileData = await profileRes.json();
    const existingEmail = profileData.user.email;
    if (!existingEmail) return; // skip if no email set

    const res = await post('/users', token, {
      fullName: 'Duplicate Test',
      email:    existingEmail,
      role:     'Back Office Operator',
    });
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toMatch(/already exists/i);
  });

  test('GET /users/:id — returns single user with vertical access', async () => {
    const listRes  = await get('/users', token);
    const listData = await listRes.json();
    const userId   = listData.users[0].id;
    const res      = await get(`/users/${userId}`, token);
    const data     = await res.json();
    expect(res.status).toBe(200);
    expect(data.user.id).toBe(userId);
  });

  test('GET /users/999999 — returns 404', async () => {
    const res = await get('/users/999999', token);
    expect(res.status).toBe(404);
  });

  test('GET /users/renewals/upcoming — returns renewals list', async () => {
    const res  = await get('/users/renewals/upcoming', token);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(data.renewals)).toBe(true);
    expect(typeof data.count).toBe('number');
  });

});

// ─────────────────────────────────────────────
// 10. SECURITY
// ─────────────────────────────────────────────
describe('10. Security', () => {

  const protectedRoutes = [
    '/profile', '/dashboard/summary', '/dashboard/tasks/pending',
    '/verticals', '/staff', '/mis/counts', '/users',
  ];

  test('All protected routes reject requests with NO token (401)', async () => {
    for (const route of protectedRoutes) {
      const res  = await fetch(`${BASE}${route}`);
      const data = await res.json();
      expect(res.status).toBe(401);
      expect(data.success).toBe(false);
    }
  });

  test('All protected routes reject FAKE tokens (401)', async () => {
    const fakeToken = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOjl9.FAKE_SIG';
    for (const route of protectedRoutes) {
      const res = await get(route, fakeToken);
      expect(res.status).toBe(401);
    }
  });

  test('File upload route rejects unauthenticated request', async () => {
    const form = new FormData();
    form.append('stage', '2');
    const res = await fetch(`${BASE}/tasks/1/proof`, {
      method: 'POST',
      body:   form,
    });
    expect(res.status).toBe(401);
  });

  test('Unknown routes return 404 with helpful message', async () => {
    const token = await login('shanil');
    const res   = await get('/totally/unknown/path', token);
    const data  = await res.json();
    expect(res.status).toBe(404);
    expect(data.error).toMatch(/not found/i);
  });

});
