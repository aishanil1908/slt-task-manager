// routes/users.js
// GET  /api/users          — list all users with performance stats
// POST /api/users          — create new user
// GET  /api/users/:id      — single user detail
// GET  /api/users/renewals — upcoming renewals

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const auth = require('../middleware/auth');
const { isManager } = require('../middleware/roleCheck');

// ── LIST ALL USERS ────────────────────────────────────────
// GET /api/users
router.get('/', auth, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM v_staff_performance ORDER BY full_name`
    );
    res.json({ success: true, users: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Could not fetch users' });
  }
});

// ── CREATE NEW USER ───────────────────────────────────────
// POST /api/users
// Only managers and admins can create users
router.post('/', auth, isManager, async (req, res) => {
  const { fullName, email, mobile, role, verticalAccess, reportsTo, password } = req.body;

  if (!fullName || !email || !role) {
    return res.status(400).json({ success: false, error: 'Full name, email and role are required' });
  }

  try {
    // Check email uniqueness
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'A user with this email already exists' });
    }

    // Generate username from name (e.g. "Priya Sharma" → "priya.sharma")
    const username = fullName.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z.]/g, '');

    // Hash password if provided, otherwise null (pilot mode)
    let passwordHash = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    // Insert user
    const userResult = await query(
      `INSERT INTO users (username, full_name, email, mobile, role, password_hash, reports_to)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, username`,
      [username, fullName, email, mobile || null, role, passwordHash, reportsTo || null]
    );

    const newUserId = userResult.rows[0].id;

    // Assign vertical access
    // verticalAccess can be: 'all', ['ca'], ['dist'], ['broke'], ['ca','dist'] etc.
    let verticalCodes = [];
    if (!verticalAccess || verticalAccess === 'All Verticals') {
      verticalCodes = ['ca', 'dist', 'broke'];
    } else if (verticalAccess === 'CA Practice Only') {
      verticalCodes = ['ca'];
    } else if (verticalAccess === 'Financial Distribution Only') {
      verticalCodes = ['dist'];
    } else if (verticalAccess === 'Broking Services Only') {
      verticalCodes = ['broke'];
    } else if (Array.isArray(verticalAccess)) {
      verticalCodes = verticalAccess;
    }

    for (const code of verticalCodes) {
      const vResult = await query('SELECT id FROM verticals WHERE code = $1', [code]);
      if (vResult.rows[0]) {
        await query(
          `INSERT INTO user_vertical_access (user_id, vertical_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [newUserId, vResult.rows[0].id]
        );
      }
    }

    res.status(201).json({
      success: true,
      userId: newUserId,
      username: userResult.rows[0].username,
      message: `User ${fullName} created successfully`
    });

  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ success: false, error: 'Could not create user: ' + err.message });
  }
});

// ── GET SINGLE USER ───────────────────────────────────────
// GET /api/users/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.*, sp.current_pending, sp.current_inprogress, sp.current_postsales, sp.overdue,
              ARRAY_AGG(DISTINCT v.code) AS vertical_access
       FROM users u
       LEFT JOIN v_staff_performance sp ON u.id = sp.id
       LEFT JOIN user_vertical_access uva ON u.id = uva.user_id
       LEFT JOIN verticals v ON uva.vertical_id = v.id
       WHERE u.id = $1
       GROUP BY u.id, sp.current_pending, sp.current_inprogress, sp.current_postsales, sp.overdue`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Could not fetch user' });
  }
});

// ── RENEWALS DUE ─────────────────────────────────────────
// GET /api/renewals
// Returns insurance and FD renewals/maturities due in next 30 days
router.get('/renewals/upcoming', auth, async (req, res) => {
  try {
    const result = await query(`SELECT * FROM v_renewals_due_30d ORDER BY renewal_due_date`);
    res.json({ success: true, renewals: result.rows, count: result.rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Could not fetch renewals' });
  }
});

module.exports = router;
