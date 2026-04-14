// routes/config.js
// Returns master data for all dropdowns in the frontend
// GET /api/verticals
// GET /api/categories/:verticalCode
// GET /api/natures/:categoryCode
// GET /api/users/list  (for assign-to dropdowns)

const express = require('express');
const router = express.Router();
const { query } = require('../config/db');
const auth = require('../middleware/auth');

// ── ALL VERTICALS ──────────────────────────────────────────
// GET /api/verticals
router.get('/verticals', auth, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, code, name, icon, display_order
       FROM verticals
       WHERE is_active = TRUE
       ORDER BY display_order`
    );
    res.json({ success: true, verticals: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Could not fetch verticals' });
  }
});

// ── CATEGORIES FOR A VERTICAL ──────────────────────────────
// GET /api/categories/ca
// GET /api/categories/dist
// GET /api/categories/broke
router.get('/categories/:verticalCode', auth, async (req, res) => {
  try {
    const result = await query(
      `SELECT c.id, c.code, c.name, c.icon,
              c.requires_postsales, c.default_ps_template, c.display_order
       FROM categories c
       JOIN verticals v ON c.vertical_id = v.id
       WHERE v.code = $1 AND c.is_active = TRUE
       ORDER BY c.display_order`,
      [req.params.verticalCode]
    );
    res.json({ success: true, categories: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Could not fetch categories' });
  }
});

// ── NATURES FOR A CATEGORY ─────────────────────────────────
// GET /api/natures/mf
// GET /api/natures/gst
router.get('/natures/:categoryCode', auth, async (req, res) => {
  try {
    const result = await query(
      `SELECT n.id, n.code, n.name, n.description, n.icon,
              n.is_sip, n.ps_template_override, n.display_order
       FROM transaction_natures n
       JOIN categories c ON n.category_id = c.id
       WHERE c.code = $1 AND n.is_active = TRUE
       ORDER BY n.display_order`,
      [req.params.categoryCode]
    );
    res.json({ success: true, natures: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Could not fetch natures' });
  }
});

// ── STAFF LIST (for assign-to dropdown) ───────────────────
// GET /api/staff
router.get('/staff', auth, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.full_name, u.role, u.tasks_active,
              ARRAY_AGG(DISTINCT v.code) AS vertical_access
       FROM users u
       LEFT JOIN user_vertical_access uva ON u.id = uva.user_id
       LEFT JOIN verticals v ON uva.vertical_id = v.id
       WHERE u.is_active = TRUE
       GROUP BY u.id
       ORDER BY u.full_name`
    );
    res.json({ success: true, staff: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Could not fetch staff list' });
  }
});

module.exports = router;
