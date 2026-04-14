// routes/mis.js
// MIS drill-down endpoints
// GET /api/mis/tasks/:categoryCode   — tasks by product/category
// GET /api/mis/counts               — task counts per category for bubble display

const express = require('express');
const router = express.Router();
const { query } = require('../config/db');
const auth = require('../middleware/auth');

// ── TASK COUNTS PER CATEGORY (for bubble numbers) ─────────
// GET /api/mis/counts
router.get('/counts', auth, async (req, res) => {
  try {
    const result = await query(
      `SELECT
         c.code AS category_code,
         c.name AS category_name,
         v.code AS vertical_code,
         COUNT(t.id) AS total_tasks,
         COUNT(t.id) FILTER (WHERE t.status != 'done') AS active_tasks
       FROM categories c
       JOIN verticals v ON c.vertical_id = v.id
       LEFT JOIN tasks t ON t.category_id = c.id
       WHERE c.is_active = TRUE
       GROUP BY c.id, c.code, c.name, v.code, v.display_order, c.display_order
       ORDER BY v.display_order, c.display_order`
    );

    res.json({ success: true, counts: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Could not fetch MIS counts' });
  }
});

// ── TASKS BY CATEGORY ─────────────────────────────────────
// GET /api/mis/tasks/mf
// GET /api/mis/tasks/gst
// GET /api/mis/tasks/health?txType=ft  (optional txType filter: ft or nft)
router.get('/tasks/:categoryCode', auth, async (req, res) => {
  try {
    const { txType } = req.query; // 'ft' or 'nft'

    let txFilter = '';
    const params = [req.params.categoryCode];

    if (txType === 'ft') {
      txFilter = `AND t.tx_type = 'Financial Transaction'`;
    } else if (txType === 'nft') {
      txFilter = `AND t.tx_type != 'Financial Transaction'`;
    }

    const result = await query(
      `SELECT
         t.id, t.title, t.status, t.stage, t.priority,
         t.tx_type, t.due_date, t.created_at,
         t.client_name, t.client_mobile,
         t.proof_uploaded, t.s4_doc_uploaded,
         v.name AS vertical_name,
         c.name AS category_name, c.code AS category_code,
         n.name AS nature_name,
         ua.full_name AS assigned_to_name,
         uc.full_name AS created_by_name
       FROM tasks t
       JOIN verticals v           ON t.vertical_id = v.id
       JOIN categories c          ON t.category_id = c.id
       JOIN transaction_natures n ON t.nature_id   = n.id
       JOIN users ua              ON t.assigned_to  = ua.id
       JOIN users uc              ON t.created_by   = uc.id
       WHERE c.code = $1 ${txFilter}
       ORDER BY
         CASE t.status
           WHEN 'pending'    THEN 1
           WHEN 'inprogress' THEN 2
           WHEN 'postsales'  THEN 3
           ELSE                   4
         END,
         t.due_date ASC`,
      params
    );

    res.json({ success: true, tasks: result.rows, count: result.rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Could not fetch MIS tasks' });
  }
});

module.exports = router;
