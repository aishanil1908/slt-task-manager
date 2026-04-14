// routes/auth.js
// POST /api/login  — authenticate user and return JWT token
// POST /api/logout — invalidate session
// GET  /api/health — server health check (no auth required)

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const auth = require('../middleware/auth');
require('dotenv').config();

// ── HEALTH CHECK ──────────────────────────────────────────
// GET /api/health
// Used by frontend to test if server is running
router.get('/health', async (req, res) => {
  try {
    // Quick DB ping
    await query('SELECT 1');
    res.json({
      success: true,
      status: 'running',
      message: 'SLT Task Manager API is online',
      timestamp: new Date().toISOString(),
      pilot_mode: process.env.PILOT_MODE === 'true'
    });
  } catch (err) {
    res.status(500).json({ success: false, status: 'db_error', message: err.message });
  }
});

// ── LOGIN ─────────────────────────────────────────────────
// POST /api/login
// Body: { username: "shanil" }                    (pilot mode - no password)
// Body: { username: "shanil", password: "xxxx" }  (production mode)
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || username.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Username is required'
      });
    }

    // Find user by username
    const result = await query(
      `SELECT
         u.id, u.username, u.full_name, u.email, u.mobile,
         u.role, u.password_hash, u.is_active,
         ARRAY_AGG(DISTINCT v.code) AS vertical_access
       FROM users u
       LEFT JOIN user_vertical_access uva ON u.id = uva.user_id
       LEFT JOIN verticals v ON uva.vertical_id = v.id
       WHERE LOWER(u.username) = LOWER($1)
       GROUP BY u.id`,
      [username.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: `User "${username}" not found. Please check your username.`
      });
    }

    const user = result.rows[0];

    // Check if account is active
    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        error: 'Your account has been deactivated. Contact admin.'
      });
    }

    // Password check — skip in pilot mode
    const pilotMode = process.env.PILOT_MODE === 'true';
    if (!pilotMode) {
      if (!password) {
        return res.status(400).json({ success: false, error: 'Password is required' });
      }
      if (!user.password_hash) {
        return res.status(401).json({ success: false, error: 'Account has no password set. Contact admin.' });
      }
      const passwordMatch = await bcrypt.compare(password, user.password_hash);
      if (!passwordMatch) {
        return res.status(401).json({ success: false, error: 'Incorrect password' });
      }
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRY || '24h' }
    );

    // Update last login timestamp
    await query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );

    // Store session
    await query(
      `INSERT INTO user_sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
      [user.id, token.slice(-20)] // store last 20 chars as identifier
    );

    // Return success with user info and token
    res.json({
      success: true,
      token,
      user: {
        id:             user.id,
        username:       user.username,
        fullName:       user.full_name,
        email:          user.email,
        role:           user.role,
        verticalAccess: user.vertical_access.filter(Boolean)
      },
      pilotMode
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Login failed. Please try again.' });
  }
});

// ── LOGOUT ────────────────────────────────────────────────
// POST /api/logout
// Requires: Authorization header with Bearer token
router.post('/logout', auth, async (req, res) => {
  try {
    // Remove session from database
    await query(
      'DELETE FROM user_sessions WHERE user_id = $1',
      [req.user.id]
    );

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ success: false, error: 'Logout failed' });
  }
});

// ── PROFILE ───────────────────────────────────────────────
// GET /api/profile
// Returns current logged-in user's details
router.get('/profile', auth, async (req, res) => {
  try {
    const result = await query(
      `SELECT
         u.id, u.username, u.full_name, u.email, u.mobile,
         u.role, u.tasks_active, u.tasks_completed, u.efficiency_pct,
         u.last_login,
         ARRAY_AGG(DISTINCT v.code) AS vertical_access
       FROM users u
       LEFT JOIN user_vertical_access uva ON u.id = uva.user_id
       LEFT JOIN verticals v ON uva.vertical_id = v.id
       WHERE u.id = $1
       GROUP BY u.id`,
      [req.user.id]
    );

    const u = result.rows[0];
    res.json({
      success: true,
      user: {
        id:             u.id,
        username:       u.username,
        fullName:       u.full_name,
        email:          u.email,
        mobile:         u.mobile,
        role:           u.role,
        tasksActive:    u.tasks_active,
        tasksCompleted: u.tasks_completed,
        efficiencyPct:  u.efficiency_pct,
        lastLogin:      u.last_login,
        verticalAccess: u.vertical_access.filter(Boolean)
      }
    });
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ success: false, error: 'Could not fetch profile' });
  }
});

module.exports = router;
