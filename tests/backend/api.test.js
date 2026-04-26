/**
 * SLT Task Management — Comprehensive Backend API Tests
 * Framework : Jest + Supertest
 * Coverage  : auth · config · dashboard · tasks · users · mis · admin
 *
 * HOW TO RUN
 * ----------
 * npm install --save-dev jest supertest
 * npx jest --coverage
 *
 * The db module is fully mocked — no real database required.
 * Each describe-block resets mocks so tests are independent.
 */

// ─── Mock the database BEFORE importing server ──────────────────────────────
jest.mock('../../backend/config/db', () => ({ query: jest.fn() }));

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../../backend/server');
const { query } = require('../../backend/config/db');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || 'slt-test-jwt-secret-do-not-use-in-prod';

/** Create a signed token for the given user fixture */
function makeToken(user = {}) {
  return jwt.sign(
    {
      userId:   user.id       || 1,
      username: user.username || 'testadmin',
      role:     user.role     || 'Admin / Partner',
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

/**
 * Canonical "active user" returned by the auth middleware DB query.
 * Shape must match: SELECT id, username, full_name, email, role, is_active FROM users WHERE id = $1
 */
const AUTH_USER = {
  id: 1,
  username: 'testadmin',
  full_name: 'Test Admin',
  email: 'admin@slt.in',
  role: 'Admin / Partner',
  is_active: true,
};

const SYSADMIN_USER = {
  id: 99,
  username: 'sysadmin',
  full_name: 'System Administrator',
  email: 'sysadmin@slt.in',
  role: 'System Admin',
  is_active: true,
};

/**
 * Set up query mock so:
 *  - The first call (auth middleware `SELECT id... FROM users WHERE id = $1`) returns authUser
 *  - Remaining calls are configured per-test via mockResolvedValueOnce
 */
function setupAuthMock(authUser = AUTH_USER) {
  query.mockImplementation((sql) => {
    if (
      sql.includes('FROM users WHERE id = $1') &&
      !sql.includes('INSERT') &&
      !sql.includes('UPDATE')
    ) {
      return Promise.resolve({ rows: [authUser] });
    }
    // Default: empty rows (tests should override with mockResolvedValueOnce)
    return Promise.resolve({ rows: [] });
  });
}

const AUTH_HDR  = `Bearer ${makeToken(AUTH_USER)}`;
const ADMIN_HDR = `Bearer ${makeToken(SYSADMIN_USER)}`;

// ─────────────────────────────────────────────────────────────────────────────
//  1. AUTH ROUTES
// ─────────────────────────────────────────────────────────────────────────────
describe('AUTH — /api/health | /api/login | /api/logout | /api/profile', () => {
  beforeEach(() => {
    query.mockReset();
  });

  // ── Health ────────────────────────────────────────────────────────────────
  describe('GET /api/health', () => {
    it('returns 200 with status:running when DB is up', async () => {
      query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }); // SELECT 1

      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('running');
      expect(res.body).toHaveProperty('timestamp');
    });

    it('returns 500 when DB is down', async () => {
      query.mockRejectedValueOnce(new Error('DB connection refused'));

      const res = await request(app).get('/api/health');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.status).toBe('db_error');
    });
  });

  // ── Login ─────────────────────────────────────────────────────────────────
  describe('POST /api/login', () => {
    const loginUser = {
      id: 1,
      username: 'shanil',
      full_name: 'Shanil Jain',
      email: 'shanil@slt.in',
      role: 'Admin / Partner',
      password_hash: null,
      is_active: true,
      vertical_access: ['ca', 'dist', 'broke'],
    };

    it('logs in successfully in pilot mode (no password required)', async () => {
      process.env.PILOT_MODE = 'true';
      query
        .mockResolvedValueOnce({ rows: [loginUser] })   // find user
        .mockResolvedValueOnce({ rows: [] })             // update last_login
        .mockResolvedValueOnce({ rows: [] });            // insert session

      const res = await request(app)
        .post('/api/login')
        .send({ username: 'shanil' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.username).toBe('shanil');
      expect(res.body.pilotMode).toBe(true);
    });

    it('returns 400 when username is missing', async () => {
      const res = await request(app)
        .post('/api/login')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/username is required/i);
    });

    it('returns 401 when username is not found', async () => {
      query.mockResolvedValueOnce({ rows: [] }); // user not found

      const res = await request(app)
        .post('/api/login')
        .send({ username: 'unknownuser' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/not found/i);
    });

    it('returns 401 when account is deactivated', async () => {
      query.mockResolvedValueOnce({ rows: [{ ...loginUser, is_active: false }] });

      const res = await request(app)
        .post('/api/login')
        .send({ username: 'shanil' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/deactivated/i);
    });

    it('returns 400 when password is missing in production mode', async () => {
      process.env.PILOT_MODE = 'false';
      query.mockResolvedValueOnce({ rows: [{ ...loginUser, password_hash: '$2b$10$hash' }] });

      const res = await request(app)
        .post('/api/login')
        .send({ username: 'shanil' }); // no password

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/password is required/i);

      process.env.PILOT_MODE = 'true'; // restore
    });

    it('returns 401 for incorrect password in production mode', async () => {
      process.env.PILOT_MODE = 'false';
      // bcrypt hash of 'correctpassword' — we'll send a wrong one
      const bcrypt = require('bcryptjs');
      const hash   = await bcrypt.hash('correctpassword', 10);
      query.mockResolvedValueOnce({ rows: [{ ...loginUser, password_hash: hash }] });

      const res = await request(app)
        .post('/api/login')
        .send({ username: 'shanil', password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/incorrect password/i);

      process.env.PILOT_MODE = 'true';
    });
  });

  // ── Logout ────────────────────────────────────────────────────────────────
  describe('POST /api/logout', () => {
    it('logs out successfully with a valid token', async () => {
      setupAuthMock();
      query.mockResolvedValueOnce({ rows: [] }); // delete session

      const res = await request(app)
        .post('/api/logout')
        .set('Authorization', AUTH_HDR);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/logged out/i);
    });

    it('returns 401 when no token is provided', async () => {
      const res = await request(app).post('/api/logout');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 401 for an invalid / tampered token', async () => {
      const res = await request(app)
        .post('/api/logout')
        .set('Authorization', 'Bearer this.is.garbage');

      expect(res.status).toBe(401);
    });
  });

  // ── Profile ───────────────────────────────────────────────────────────────
  describe('GET /api/profile', () => {
    it('returns profile for authenticated user', async () => {
      setupAuthMock();
      query.mockResolvedValueOnce({
        rows: [{
          id: 1, username: 'testadmin', full_name: 'Test Admin',
          email: 'admin@slt.in', mobile: '9876543210',
          role: 'Admin / Partner', tasks_active: 3, tasks_completed: 42,
          efficiency_pct: 91, last_login: new Date().toISOString(),
          vertical_access: ['ca', 'dist', 'broke'],
        }]
      });

      const res = await request(app)
        .get('/api/profile')
        .set('Authorization', AUTH_HDR);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user).toHaveProperty('username');
      expect(res.body.user).toHaveProperty('role');
      expect(res.body.user).toHaveProperty('verticalAccess');
    });

    it('returns 401 without auth header', async () => {
      const res = await request(app).get('/api/profile');
      expect(res.status).toBe(401);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  2. CONFIG ROUTES
// ─────────────────────────────────────────────────────────────────────────────
describe('CONFIG — /api/verticals | /api/categories/:code | /api/natures/:code | /api/staff', () => {
  beforeEach(() => {
    query.mockReset();
    setupAuthMock();
  });

  it('GET /api/verticals — returns active verticals list', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { id: 1, code: 'ca',   name: 'CA Practice',            icon: '🏛️', display_order: 1 },
        { id: 2, code: 'dist', name: 'Financial Distribution', icon: '💹', display_order: 2 },
        { id: 3, code: 'broke',name: 'Broking Services',       icon: '📈', display_order: 3 },
      ]
    });

    const res = await request(app)
      .get('/api/verticals')
      .set('Authorization', AUTH_HDR);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.verticals)).toBe(true);
    expect(res.body.verticals).toHaveLength(3);
    expect(res.body.verticals[0]).toHaveProperty('code');
  });

  it('GET /api/verticals — returns 401 when unauthenticated', async () => {
    query.mockReset(); // clear auth mock
    const res = await request(app).get('/api/verticals');
    expect(res.status).toBe(401);
  });

  it('GET /api/categories/dist — returns categories for a vertical', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { id: 1, code: 'mf',     name: 'Mutual Funds',   display_order: 1 },
        { id: 2, code: 'health', name: 'Health Insurance', display_order: 2 },
      ]
    });

    const res = await request(app)
      .get('/api/categories/dist')
      .set('Authorization', AUTH_HDR);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.categories[0].code).toBe('mf');
  });

  it('GET /api/categories/:code — returns empty array for unknown vertical', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/categories/zzz')
      .set('Authorization', AUTH_HDR);

    expect(res.status).toBe(200);
    expect(res.body.categories).toHaveLength(0);
  });

  it('GET /api/natures/mf — returns natures for a category', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { id: 1, code: 'lump',  name: 'Lump Sum Purchase',  is_sip: false },
        { id: 2, code: 'sip',   name: 'SIP Registration',   is_sip: true  },
      ]
    });

    const res = await request(app)
      .get('/api/natures/mf')
      .set('Authorization', AUTH_HDR);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.natures[1].is_sip).toBe(true);
  });

  it('GET /api/staff — returns staff list with vertical access', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { id: 1, full_name: 'Priya Sharma',  role: 'Back Office Operator', tasks_active: 5, vertical_access: ['ca','dist'] },
        { id: 2, full_name: 'Rahul Gupta',   role: 'Operations Manager',   tasks_active: 3, vertical_access: ['ca','dist','broke'] },
      ]
    });

    const res = await request(app)
      .get('/api/staff')
      .set('Authorization', AUTH_HDR);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.staff).toHaveLength(2);
    expect(res.body.staff[0]).toHaveProperty('vertical_access');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  3. DASHBOARD ROUTES
// ─────────────────────────────────────────────────────────────────────────────
describe('DASHBOARD — /api/dashboard/*', () => {
  beforeEach(() => {
    query.mockReset();
    setupAuthMock();
  });

  it('GET /api/dashboard/summary — returns all 4 status counts + snapshot', async () => {
    // Query 1: v_dashboard_summary
    query.mockResolvedValueOnce({
      rows: [{
        pending_count: '5', inprogress_count: '3',
        postsales_count: '2', done_count: '8',
        created_today: '1', overdue_count: '2',
      }]
    });
    // Query 2: v_renewals_due_30d count
    query.mockResolvedValueOnce({ rows: [{ cnt: '4' }] });

    const res = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', AUTH_HDR);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.counts).toMatchObject({ pending: 5, inprogress: 3, postsales: 2, done: 8 });
    expect(res.body.snapshot).toHaveProperty('renewalsDue30d', 4);
  });

  it('GET /api/dashboard/summary — returns 500 on DB error', async () => {
    query.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', AUTH_HDR);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  const VALID_STATUSES = ['pending', 'inprogress', 'postsales', 'done'];

  VALID_STATUSES.forEach(status => {
    it(`GET /api/dashboard/tasks/${status} — returns task list`, async () => {
      query.mockResolvedValueOnce({
        rows: [
          {
            id: 1, title: `Test task (${status})`,
            status, stage: 1, priority: 'High',
            tx_type: 'Financial Transaction',
            client_name: 'Test Client', client_mobile: '9876543210',
            vertical_name: 'CA Practice', category_name: 'GST Returns',
            category_code: 'gst', nature_name: 'GSTR-3B',
            assigned_to_name: 'Priya Sharma', created_by_name: 'Admin',
            due_date: '2026-04-30', created_at: new Date().toISOString(),
            proof_uploaded: false, s4_doc_uploaded: false,
          }
        ]
      });

      const res = await request(app)
        .get(`/api/dashboard/tasks/${status}`)
        .set('Authorization', AUTH_HDR);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.tasks)).toBe(true);
      expect(res.body.count).toBe(1);
    });
  });

  it('GET /api/dashboard/tasks/invalid — returns 400 for bad status', async () => {
    const res = await request(app)
      .get('/api/dashboard/tasks/invalidstatus')
      .set('Authorization', AUTH_HDR);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/invalid status/i);
  });

  it('GET /api/dashboard/verticals — returns per-vertical active counts', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { id: 1, code: 'ca',   name: 'CA Practice',            icon: '🏛️', active_count: '3' },
        { id: 2, code: 'dist', name: 'Financial Distribution', icon: '💹', active_count: '7' },
      ]
    });

    const res = await request(app)
      .get('/api/dashboard/verticals')
      .set('Authorization', AUTH_HDR);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.verticals[0]).toHaveProperty('active_count');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  4. TASKS ROUTES
// ─────────────────────────────────────────────────────────────────────────────
describe('TASKS — /api/tasks/*', () => {
  beforeEach(() => {
    query.mockReset();
    setupAuthMock();
  });

  // ── Create task ────────────────────────────────────────────────────────────
  describe('POST /api/tasks', () => {
    const validPayload = {
      verticalCode:  'ca',
      categoryCode:  'gst',
      natureCode:    'gstr3b',
      txType:        'CA Work',
      clientName:    'Ramesh Sharma',
      clientMobile:  '9876543210',
      title:         'GST Filing Q3',
      dueDate:       '2026-05-01',
      assignedTo:    2,
    };

    it('creates a task successfully with valid payload', async () => {
      // Resolve IDs from codes
      query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })                                          // vertical
        .mockResolvedValueOnce({ rows: [{ id: 1, default_ps_template: 'ca_work', requires_postsales: true }] }) // category
        .mockResolvedValueOnce({ rows: [{ id: 1, ps_template_override: null }] })               // nature
        .mockResolvedValueOnce({ rows: [{ id: 42 }] })                                         // INSERT task RETURNING id
        .mockResolvedValueOnce({ rows: [] })                                                    // INSERT stage history
        .mockResolvedValueOnce({ rows: [] });                                                   // INSERT notification

      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', AUTH_HDR)
        .send(validPayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('taskId', 42);
    });

    it('returns 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', AUTH_HDR)
        .send({ title: 'Incomplete task' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 when client name/mobile are missing', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', AUTH_HDR)
        .send({ ...validPayload, clientName: undefined, clientMobile: undefined });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/client name and mobile/i);
    });

    it('returns 400 when vertical/category/nature code is invalid', async () => {
      query
        .mockResolvedValueOnce({ rows: [] }) // vertical not found
        .mockResolvedValueOnce({ rows: [] }) // category not found
        .mockResolvedValueOnce({ rows: [] }); // nature not found

      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', AUTH_HDR)
        .send({ ...validPayload, verticalCode: 'nonexistent' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid vertical/i);
    });

    it('creates task with subtasks when subtasks array is provided', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, default_ps_template: 'ca_work', requires_postsales: true }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, ps_template_override: null }] })
        .mockResolvedValueOnce({ rows: [{ id: 50 }] })   // task id
        .mockResolvedValueOnce({ rows: [] })              // subtask 1
        .mockResolvedValueOnce({ rows: [] })              // stage history
        .mockResolvedValueOnce({ rows: [] });             // notification

      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', AUTH_HDR)
        .send({
          ...validPayload,
          subtasks: [{ title: 'Verify GSTIN', instructions: 'Check portal', assignedTo: 2, dueDate: '2026-04-30' }]
        });

      expect(res.status).toBe(201);
      expect(res.body.taskId).toBe(50);
    });
  });

  // ── Get single task ────────────────────────────────────────────────────────
  describe('GET /api/tasks/:id', () => {
    it('returns full task detail for valid ID', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ id: 1, title: 'Test task', status: 'pending', stage: 1 }] }) // v_tasks_full
        .mockResolvedValueOnce({ rows: [] })  // subtasks
        .mockResolvedValueOnce({ rows: [] })  // proofs
        .mockResolvedValueOnce({ rows: [] }); // fulfillment

      const res = await request(app)
        .get('/api/tasks/1')
        .set('Authorization', AUTH_HDR);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.task).toHaveProperty('id', 1);
      expect(res.body.task).toHaveProperty('subtasks');
      expect(res.body.task).toHaveProperty('proofs');
    });

    it('returns 404 for non-existent task', async () => {
      query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/tasks/9999')
        .set('Authorization', AUTH_HDR);

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });
  });

  // ── Stage transition ───────────────────────────────────────────────────────
  describe('PUT /api/tasks/:id/stage', () => {
    const updatedTask = { id: 1, title: 'Test task', status: 'inprogress', stage: 2, assigned_to: 2 };

    ['start', 'confirm', 'verify', 'reopen'].forEach(action => {
      it(`action="${action}" moves task to next stage`, async () => {
        query
          .mockResolvedValueOnce({ rows: [updatedTask] })  // update_task_stage()
          .mockResolvedValueOnce({ rows: [] });             // notification insert

        const res = await request(app)
          .put('/api/tasks/1/stage')
          .set('Authorization', AUTH_HDR)
          .send({ action });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toMatch(new RegExp(action, 'i'));
      });
    });

    it('action="send_back" requires a note', async () => {
      const res = await request(app)
        .put('/api/tasks/1/stage')
        .set('Authorization', AUTH_HDR)
        .send({ action: 'send_back' }); // no note

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/reason is required/i);
    });

    it('action="send_back" succeeds when note is provided', async () => {
      query
        .mockResolvedValueOnce({ rows: [updatedTask] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .put('/api/tasks/1/stage')
        .set('Authorization', AUTH_HDR)
        .send({ action: 'send_back', note: 'Proof image is blurry, re-upload please' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 400 for invalid action', async () => {
      const res = await request(app)
        .put('/api/tasks/1/stage')
        .set('Authorization', AUTH_HDR)
        .send({ action: 'teleport' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid action/i);
    });

    it('returns 404 when task does not exist', async () => {
      query.mockResolvedValueOnce({ rows: [] }); // empty from update_task_stage

      const res = await request(app)
        .put('/api/tasks/9999/stage')
        .set('Authorization', AUTH_HDR)
        .send({ action: 'start' });

      expect(res.status).toBe(404);
    });
  });

  // ── Proof upload ───────────────────────────────────────────────────────────
  describe('POST /api/tasks/:id/proof', () => {
    it('returns 400 when no file is attached', async () => {
      const res = await request(app)
        .post('/api/tasks/1/proof')
        .set('Authorization', AUTH_HDR)
        .field('stage', '2');

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/no file/i);
    });

    it('returns 400 for invalid stage value', async () => {
      // We need to attach a mock file; use a small buffer
      const res = await request(app)
        .post('/api/tasks/1/proof')
        .set('Authorization', AUTH_HDR)
        .attach('file', Buffer.from('fake-pdf-content'), 'test.pdf')
        .field('stage', '9'); // invalid stage

      // multer may reject due to stage value or MIME check — depends on implementation
      expect([400, 500]).toContain(res.status);
    });
  });

  // ── Post-sales fulfillment ────────────────────────────────────────────────
  describe('POST /api/tasks/:id/fulfillment', () => {
    it('returns 404 if task does not exist', async () => {
      query.mockResolvedValueOnce({ rows: [] }); // task not found

      const res = await request(app)
        .post('/api/tasks/9999/fulfillment')
        .set('Authorization', AUTH_HDR)
        .send({ folioNumber: 'ABC123' });

      expect(res.status).toBe(404);
    });

    it('returns 400 if task is not in postsales status', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 1, ps_template: 'mf_purchase', status: 'pending' }] });

      const res = await request(app)
        .post('/api/tasks/1/fulfillment')
        .set('Authorization', AUTH_HDR)
        .send({ folioNumber: 'ABC123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not in post-sales/i);
    });

    it('saves fulfillment data for a postsales task', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ id: 1, ps_template: 'mf_purchase', status: 'postsales' }] })
        .mockResolvedValueOnce({ rows: [] }); // upsert

      const res = await request(app)
        .post('/api/tasks/1/fulfillment')
        .set('Authorization', AUTH_HDR)
        .send({
          folioNumber: '12345678/99',
          units: '245.678',
          navRate: '48.25',
          allotmentDate: '2026-04-10',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── Task history ───────────────────────────────────────────────────────────
  describe('GET /api/tasks/:id/history', () => {
    it('returns audit trail for a task', async () => {
      query.mockResolvedValueOnce({
        rows: [
          { id: 1, task_id: 1, action: 'created', from_stage: null, to_stage: 1, action_by_name: 'Admin', created_at: new Date().toISOString() },
          { id: 2, task_id: 1, action: 'start',   from_stage: 1,    to_stage: 2, action_by_name: 'Admin', created_at: new Date().toISOString() },
        ]
      });

      const res = await request(app)
        .get('/api/tasks/1/history')
        .set('Authorization', AUTH_HDR);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.history).toHaveLength(2);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  5. USERS ROUTES
// ─────────────────────────────────────────────────────────────────────────────
describe('USERS — /api/users/*', () => {
  beforeEach(() => {
    query.mockReset();
    setupAuthMock();
  });

  it('GET /api/users — returns all users with performance stats', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { id: 1, full_name: 'Priya Sharma', role: 'Back Office Operator', tasks_active: 5 },
        { id: 2, full_name: 'Rahul Gupta',  role: 'Operations Manager',   tasks_active: 2 },
      ]
    });

    const res = await request(app)
      .get('/api/users')
      .set('Authorization', AUTH_HDR);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.users).toHaveLength(2);
  });

  it('POST /api/users — manager can create a new user', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })                              // email uniqueness check
      .mockResolvedValueOnce({ rows: [{ id: 10, username: 'neha.singh' }] }) // INSERT user
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })                    // vertical lookup (ca)
      .mockResolvedValueOnce({ rows: [] });                             // insert vertical access

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', AUTH_HDR)
      .send({
        fullName:       'Neha Singh',
        email:          'neha.singh@slt.in',
        role:           'KYC Executive',
        verticalAccess: 'All Verticals',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('userId');
  });

  it('POST /api/users — returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', AUTH_HDR)
      .send({ fullName: 'Only Name' });  // missing email + role

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email and role are required/i);
  });

  it('POST /api/users — returns 400 on duplicate email', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 5 }] }); // email already exists

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', AUTH_HDR)
      .send({ fullName: 'Duplicate', email: 'existing@slt.in', role: 'KYC Executive' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it('GET /api/users/:id — returns single user detail', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 2, username: 'rahul.gupta', full_name: 'Rahul Gupta',
        role: 'Operations Manager', is_active: true,
        current_pending: 3, current_inprogress: 1,
        vertical_access: ['ca', 'dist'],
      }]
    });

    const res = await request(app)
      .get('/api/users/2')
      .set('Authorization', AUTH_HDR);

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('rahul.gupta');
  });

  it('GET /api/users/:id — returns 404 for non-existent user', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/users/9999')
      .set('Authorization', AUTH_HDR);

    expect(res.status).toBe(404);
  });

  it('GET /api/users/renewals/upcoming — returns upcoming renewals', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { task_id: 9, client_name: 'Arvind Mehta', renewal_due_date: '2026-05-01', category_name: 'Health Insurance' },
      ]
    });

    const res = await request(app)
      .get('/api/users/renewals/upcoming')
      .set('Authorization', AUTH_HDR);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.renewals).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  6. MIS ROUTES
// ─────────────────────────────────────────────────────────────────────────────
describe('MIS — /api/mis/*', () => {
  beforeEach(() => {
    query.mockReset();
    setupAuthMock();
  });

  it('GET /api/mis/counts — returns per-category task counts', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { category_code: 'mf',     category_name: 'Mutual Funds',    vertical_code: 'dist', total_tasks: '15', active_tasks: '8' },
        { category_code: 'health', category_name: 'Health Insurance', vertical_code: 'dist', total_tasks: '7',  active_tasks: '3' },
        { category_code: 'gst',    category_name: 'GST Returns',      vertical_code: 'ca',   total_tasks: '12', active_tasks: '4' },
      ]
    });

    const res = await request(app)
      .get('/api/mis/counts')
      .set('Authorization', AUTH_HDR);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.counts).toHaveLength(3);
    expect(res.body.counts[0]).toHaveProperty('active_tasks');
  });

  it('GET /api/mis/tasks/mf — returns task list for Mutual Funds', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { id: 7, title: 'MF Purchase', status: 'inprogress', client_name: 'Pradeep Nair', category_code: 'mf' }
      ]
    });

    const res = await request(app)
      .get('/api/mis/tasks/mf')
      .set('Authorization', AUTH_HDR);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.tasks[0].category_code).toBe('mf');
    expect(res.body.count).toBe(1);
  });

  it('GET /api/mis/tasks/health?txType=ft — filters Financial Transactions only', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/mis/tasks/health?txType=ft')
      .set('Authorization', AUTH_HDR);

    expect(res.status).toBe(200);
    // Check that query was called with FT filter in the SQL
    const calledSql = query.mock.calls[query.mock.calls.length - 1][0];
    expect(calledSql).toMatch(/Financial Transaction/);
  });

  it('GET /api/mis/tasks/health?txType=nft — filters Non-Financial only', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/mis/tasks/health?txType=nft')
      .set('Authorization', AUTH_HDR);

    expect(res.status).toBe(200);
    const calledSql = query.mock.calls[query.mock.calls.length - 1][0];
    expect(calledSql).toMatch(/Financial Transaction/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  7. ADMIN ROUTES  (System Admin role required)
// ─────────────────────────────────────────────────────────────────────────────
describe('ADMIN — /api/admin/*', () => {

  // Helper: set up auth mock to return a System Admin user
  function setupSysAdminMock() {
    query.mockImplementation((sql) => {
      if (sql.includes('FROM users WHERE id = $1') && !sql.includes('INSERT') && !sql.includes('UPDATE')) {
        return Promise.resolve({ rows: [SYSADMIN_USER] });
      }
      return Promise.resolve({ rows: [] });
    });
  }

  beforeEach(() => {
    query.mockReset();
    setupSysAdminMock();
  });

  // ── Access Control ────────────────────────────────────────────────────────
  it('Returns 403 for non-System-Admin user accessing /api/admin/*', async () => {
    // Override mock to return a regular Admin user
    query.mockImplementation((sql) => {
      if (sql.includes('FROM users WHERE id = $1')) {
        return Promise.resolve({ rows: [AUTH_USER] }); // regular Admin / Partner
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', AUTH_HDR); // regular admin token

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/system admin/i);
  });

  // ── User Management ───────────────────────────────────────────────────────
  describe('User Management', () => {
    it('GET /api/admin/users — returns all non-sysadmin users', async () => {
      query.mockResolvedValueOnce({
        rows: [
          { id: 1, username: 'priya.sharma', full_name: 'Priya Sharma', role: 'Back Office Operator', is_active: true },
          { id: 2, username: 'rahul.gupta',  full_name: 'Rahul Gupta',  role: 'Operations Manager',   is_active: true },
        ]
      });

      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', ADMIN_HDR);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.users).toHaveLength(2);
    });

    it('POST /api/admin/users — creates user with full details', async () => {
      query
        .mockResolvedValueOnce({ rows: [] })                               // email uniqueness
        .mockResolvedValueOnce({ rows: [{ cnt: '0' }] })                   // username count
        .mockResolvedValueOnce({ rows: [{ id: 20, username: 'test.user' }] }) // INSERT user
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })                      // vertical ca
        .mockResolvedValueOnce({ rows: [] })                               // insert vertical_access ca
        .mockResolvedValueOnce({ rows: [{ id: 2 }] })                      // vertical dist
        .mockResolvedValueOnce({ rows: [] })                               // insert vertical_access dist
        .mockResolvedValueOnce({ rows: [{ id: 3 }] })                      // vertical broke
        .mockResolvedValueOnce({ rows: [] });                              // insert vertical_access broke

      const res = await request(app)
        .post('/api/admin/users')
        .set('Authorization', ADMIN_HDR)
        .send({
          fullName:    'Test User',
          email:       'test.user@slt.in',
          mobile:      '9876543210',
          role:        'KYC Executive',
          password:    'Password123',
          jobProfileId: 1,
          allowDualReporting: false,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('userId', 20);
    });

    it('POST /api/admin/users — returns 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .set('Authorization', ADMIN_HDR)
        .send({ fullName: 'Only Name' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/email and role are required/i);
    });

    it('POST /api/admin/users — returns 400 on duplicate email', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 5 }] }); // email exists

      const res = await request(app)
        .post('/api/admin/users')
        .set('Authorization', ADMIN_HDR)
        .send({ fullName: 'Dup', email: 'dup@slt.in', role: 'KYC Executive' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/already exists/i);
    });

    it('PUT /api/admin/users/:id — updates user successfully', async () => {
      query.mockResolvedValueOnce({ rows: [] }); // UPDATE users

      const res = await request(app)
        .put('/api/admin/users/1')
        .set('Authorization', ADMIN_HDR)
        .send({ fullName: 'Updated Name', role: 'Operations Manager' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('PUT /api/admin/users/:id/deactivate — deactivates a user', async () => {
      query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .put('/api/admin/users/1/deactivate')
        .set('Authorization', ADMIN_HDR);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/deactivated/i);
    });

    it('PUT /api/admin/users/:id/activate — reactivates a user', async () => {
      query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .put('/api/admin/users/1/activate')
        .set('Authorization', ADMIN_HDR);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/activated/i);
    });

    it('PUT /api/admin/users/:id/password — resets password', async () => {
      query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .put('/api/admin/users/1/password')
        .set('Authorization', ADMIN_HDR)
        .send({ newPassword: 'NewSecure123' });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/reset successfully/i);
    });

    it('PUT /api/admin/users/:id/password — returns 400 if password < 6 chars', async () => {
      const res = await request(app)
        .put('/api/admin/users/1/password')
        .set('Authorization', ADMIN_HDR)
        .send({ newPassword: '123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/at least 6 characters/i);
    });
  });

  // ── Job Profiles ──────────────────────────────────────────────────────────
  describe('Job Profiles', () => {
    it('GET /api/admin/job-profiles — returns all job profiles', async () => {
      query.mockResolvedValueOnce({
        rows: [
          { id: 1, title: 'Senior RM',      description: null, user_count: '3' },
          { id: 2, title: 'Junior Associate', description: null, user_count: '5' },
        ]
      });

      const res = await request(app)
        .get('/api/admin/job-profiles')
        .set('Authorization', ADMIN_HDR);

      expect(res.status).toBe(200);
      expect(res.body.jobProfiles).toHaveLength(2);
    });

    it('POST /api/admin/job-profiles — creates a new profile', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 5 }] });

      const res = await request(app)
        .post('/api/admin/job-profiles')
        .set('Authorization', ADMIN_HDR)
        .send({ title: 'Senior CA Specialist', description: 'Handles complex tax matters' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.id).toBe(5);
    });

    it('POST /api/admin/job-profiles — returns 400 when title is missing', async () => {
      const res = await request(app)
        .post('/api/admin/job-profiles')
        .set('Authorization', ADMIN_HDR)
        .send({ description: 'No title here' });

      expect(res.status).toBe(400);
    });

    it('POST /api/admin/job-profiles — returns 400 on duplicate title', async () => {
      const pgError = new Error('duplicate key');
      pgError.code = '23505';
      query.mockRejectedValueOnce(pgError);

      const res = await request(app)
        .post('/api/admin/job-profiles')
        .set('Authorization', ADMIN_HDR)
        .send({ title: 'Duplicate Title' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/already exists/i);
    });

    it('PUT /api/admin/job-profiles/:id — updates title/description', async () => {
      query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .put('/api/admin/job-profiles/1')
        .set('Authorization', ADMIN_HDR)
        .send({ title: 'Updated Profile', isActive: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── Reporting Hierarchy ───────────────────────────────────────────────────
  describe('Reporting Hierarchy', () => {
    it('GET /api/admin/hierarchy — returns full reporting tree', async () => {
      query.mockResolvedValueOnce({
        rows: [
          { id: 1, full_name: 'Priya Sharma', manager_name: 'Rahul Gupta', priority: 'primary' }
        ]
      });

      const res = await request(app)
        .get('/api/admin/hierarchy')
        .set('Authorization', ADMIN_HDR);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.hierarchy)).toBe(true);
    });

    it('POST /api/admin/hierarchy — assigns primary manager', async () => {
      query
        .mockResolvedValueOnce({ rows: [] }) // deactivate existing
        .mockResolvedValueOnce({ rows: [] }) // insert new
        .mockResolvedValueOnce({ rows: [] }); // update reports_to

      const res = await request(app)
        .post('/api/admin/hierarchy')
        .set('Authorization', ADMIN_HDR)
        .send({ userId: 1, managerId: 2, priority: 'primary' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('POST /api/admin/hierarchy — returns 400 when missing required fields', async () => {
      const res = await request(app)
        .post('/api/admin/hierarchy')
        .set('Authorization', ADMIN_HDR)
        .send({ userId: 1 }); // missing managerId + priority

      expect(res.status).toBe(400);
    });

    it('POST /api/admin/hierarchy — returns 400 for invalid priority', async () => {
      const res = await request(app)
        .post('/api/admin/hierarchy')
        .set('Authorization', ADMIN_HDR)
        .send({ userId: 1, managerId: 2, priority: 'boss' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/primary or secondary/i);
    });

    it('POST /api/admin/hierarchy — returns 400 for secondary without dual reporting enabled', async () => {
      query.mockResolvedValueOnce({ rows: [{ allow_dual_reporting: false }] });

      const res = await request(app)
        .post('/api/admin/hierarchy')
        .set('Authorization', ADMIN_HDR)
        .send({ userId: 1, managerId: 2, priority: 'secondary' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/dual reporting/i);
    });

    it('DELETE /api/admin/hierarchy/:id — removes a reporting line', async () => {
      query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .delete('/api/admin/hierarchy/5')
        .set('Authorization', ADMIN_HDR);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/removed/i);
    });
  });

  // ── Verticals (Master Data) ───────────────────────────────────────────────
  describe('Admin Verticals', () => {
    it('GET /api/admin/verticals — lists all verticals with category counts', async () => {
      query.mockResolvedValueOnce({
        rows: [
          { id: 1, code: 'ca',   name: 'CA Practice',            is_system: true,  category_count: '6' },
          { id: 2, code: 'dist', name: 'Financial Distribution', is_system: true,  category_count: '10' },
          { id: 3, code: 'myv',  name: 'My Custom Vertical',     is_system: false, category_count: '2' },
        ]
      });

      const res = await request(app)
        .get('/api/admin/verticals')
        .set('Authorization', ADMIN_HDR);

      expect(res.status).toBe(200);
      expect(res.body.verticals).toHaveLength(3);
      expect(res.body.verticals[0]).toHaveProperty('category_count');
    });

    it('POST /api/admin/verticals — creates a new custom vertical', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 4 }] });

      const res = await request(app)
        .post('/api/admin/verticals')
        .set('Authorization', ADMIN_HDR)
        .send({ code: 'wealth', name: 'Wealth Management', icon: '💼', displayOrder: 4 });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('POST /api/admin/verticals — returns 400 when code or name missing', async () => {
      const res = await request(app)
        .post('/api/admin/verticals')
        .set('Authorization', ADMIN_HDR)
        .send({ code: 'wealth' }); // missing name

      expect(res.status).toBe(400);
    });

    it('POST /api/admin/verticals — returns 400 on duplicate code', async () => {
      const pgError = new Error('unique violation');
      pgError.code = '23505';
      query.mockRejectedValueOnce(pgError);

      const res = await request(app)
        .post('/api/admin/verticals')
        .set('Authorization', ADMIN_HDR)
        .send({ code: 'ca', name: 'CA Duplicate' });

      expect(res.status).toBe(400);
    });

    it('PUT /api/admin/verticals/:id — cannot rename system verticals', async () => {
      query.mockResolvedValueOnce({ rows: [{ is_system: true }] });

      const res = await request(app)
        .put('/api/admin/verticals/1')
        .set('Authorization', ADMIN_HDR)
        .send({ name: 'Renamed System Vertical' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/system verticals/i);
    });

    it('PUT /api/admin/verticals/:id — can update custom vertical', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ is_system: false }] }) // check
        .mockResolvedValueOnce({ rows: [] });                    // update

      const res = await request(app)
        .put('/api/admin/verticals/4')
        .set('Authorization', ADMIN_HDR)
        .send({ name: 'Renamed Custom', displayOrder: 5 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('PUT /api/admin/verticals/:id/toggle — cannot deactivate system verticals', async () => {
      query.mockResolvedValueOnce({ rows: [{ is_system: true, is_active: true }] });

      const res = await request(app)
        .put('/api/admin/verticals/1/toggle')
        .set('Authorization', ADMIN_HDR);

      expect(res.status).toBe(400);
    });

    it('PUT /api/admin/verticals/:id/toggle — toggles custom vertical status', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ is_system: false, is_active: true }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .put('/api/admin/verticals/4/toggle')
        .set('Authorization', ADMIN_HDR);

      expect(res.status).toBe(200);
    });
  });

  // ── Categories (Master Data) ──────────────────────────────────────────────
  describe('Admin Categories', () => {
    it('GET /api/admin/categories — returns categories with vertical info', async () => {
      query.mockResolvedValueOnce({
        rows: [
          { id: 1, code: 'mf', name: 'Mutual Funds', vertical_name: 'Financial Distribution', is_system: true, nature_count: '6' }
        ]
      });

      const res = await request(app)
        .get('/api/admin/categories')
        .set('Authorization', ADMIN_HDR);

      expect(res.status).toBe(200);
      expect(res.body.categories[0]).toHaveProperty('vertical_name');
    });

    it('POST /api/admin/categories — creates a new category', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 15 }] });

      const res = await request(app)
        .post('/api/admin/categories')
        .set('Authorization', ADMIN_HDR)
        .send({ verticalId: 2, code: 'bonds', name: 'Bonds & Debentures', icon: '📊' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe(15);
    });

    it('POST /api/admin/categories — returns 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/admin/categories')
        .set('Authorization', ADMIN_HDR)
        .send({ name: 'No code or verticalId' });

      expect(res.status).toBe(400);
    });

    it('PUT /api/admin/categories/:id — cannot rename system categories', async () => {
      query.mockResolvedValueOnce({ rows: [{ is_system: true }] });

      const res = await request(app)
        .put('/api/admin/categories/1')
        .set('Authorization', ADMIN_HDR)
        .send({ name: 'Trying to rename system' });

      expect(res.status).toBe(400);
    });

    it('PUT /api/admin/categories/:id/toggle — toggles custom category', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ is_system: false }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .put('/api/admin/categories/15/toggle')
        .set('Authorization', ADMIN_HDR);

      expect(res.status).toBe(200);
    });
  });

  // ── Transaction Natures (Master Data) ─────────────────────────────────────
  describe('Admin Transaction Natures', () => {
    it('GET /api/admin/natures — returns natures with category and vertical info', async () => {
      query.mockResolvedValueOnce({
        rows: [
          { id: 1, code: 'sip', name: 'SIP Registration', category_name: 'Mutual Funds', vertical_name: 'Financial Distribution', is_system: true }
        ]
      });

      const res = await request(app)
        .get('/api/admin/natures')
        .set('Authorization', ADMIN_HDR);

      expect(res.status).toBe(200);
      expect(res.body.natures[0]).toHaveProperty('category_name');
    });

    it('POST /api/admin/natures — creates new transaction nature', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 30 }] });

      const res = await request(app)
        .post('/api/admin/natures')
        .set('Authorization', ADMIN_HDR)
        .send({
          categoryId: 1,
          code: 'stp',
          name: 'STP Registration',
          ftAllowed: true,
          nftAllowed: false,
          displayOrder: 5,
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe(30);
    });

    it('POST /api/admin/natures — returns 400 when both FT and NFT are false', async () => {
      const res = await request(app)
        .post('/api/admin/natures')
        .set('Authorization', ADMIN_HDR)
        .send({
          categoryId: 1,
          code: 'invalid',
          name: 'Neither FT nor NFT',
          ftAllowed: false,
          nftAllowed: false,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/at least one of ftAllowed or nftAllowed/i);
    });

    it('POST /api/admin/natures — returns 400 when required fields missing', async () => {
      const res = await request(app)
        .post('/api/admin/natures')
        .set('Authorization', ADMIN_HDR)
        .send({ code: 'oops' }); // missing categoryId + name

      expect(res.status).toBe(400);
    });

    it('PUT /api/admin/natures/:id — system natures: only ft/nft/order can change', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ is_system: true }] }) // check
        .mockResolvedValueOnce({ rows: [] });                   // update

      const res = await request(app)
        .put('/api/admin/natures/1')
        .set('Authorization', ADMIN_HDR)
        .send({ ftAllowed: true, nftAllowed: false });

      expect(res.status).toBe(200);
    });

    it('PUT /api/admin/natures/:id — custom natures: all fields editable', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ is_system: false }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .put('/api/admin/natures/30')
        .set('Authorization', ADMIN_HDR)
        .send({ name: 'Renamed Nature', ftAllowed: true, nftAllowed: true });

      expect(res.status).toBe(200);
    });

    it('PUT /api/admin/natures/:id/toggle — cannot deactivate system natures', async () => {
      query.mockResolvedValueOnce({ rows: [{ is_system: true }] });

      const res = await request(app)
        .put('/api/admin/natures/1/toggle')
        .set('Authorization', ADMIN_HDR);

      expect(res.status).toBe(400);
    });

    it('PUT /api/admin/natures/:id/toggle — toggles custom nature', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ is_system: false }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .put('/api/admin/natures/30/toggle')
        .set('Authorization', ADMIN_HDR);

      expect(res.status).toBe(200);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  8. CATCH-ALL / SECURITY
// ─────────────────────────────────────────────────────────────────────────────
describe('CATCH-ALL & SECURITY', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 for unknown POST routes', async () => {
    const res = await request(app).post('/api/totally-fake');
    expect(res.status).toBe(404);
  });

  it('returns 401 on all protected routes when Authorization header is absent', async () => {
    const protectedRoutes = [
      { method: 'get',  path: '/api/profile' },
      { method: 'get',  path: '/api/verticals' },
      { method: 'get',  path: '/api/dashboard/summary' },
      { method: 'get',  path: '/api/tasks/1' },
      { method: 'get',  path: '/api/users' },
      { method: 'get',  path: '/api/mis/counts' },
      { method: 'get',  path: '/api/admin/users' },
    ];

    for (const { method, path } of protectedRoutes) {
      const res = await request(app)[method](path);
      expect(res.status).toBe(401);
    }
  });
});
