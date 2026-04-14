// routes/dashboard.js
// Feeds the main dashboard page
// GET /api/dashboard/summary     — 4 status card counts + snapshot
// GET /api/dashboard/tasks/:status — task list for each status panel
// GET /api/dashboard/verticals   — active task counts per vertical

const express = require('express');
const router = express.Router();
const { query } = require('../config/db');
const auth = require('../middleware/auth');

// ── SUMMARY (4 status cards + today's snapshot) ───────────
// GET /api/dashboard/summary
router.get('/summary', auth, async (req, res) => {
  try {
    const result = await query(`SELECT * FROM v_dashboard_summary`);
    const s = result.rows[0];

    // Renewal count for next 30 days
    const renewals = await query(
      `SELECT COUNT(*) AS cnt FROM v_renewals_due_30d`
    );

    res.json({
      success: true,
      counts: {
        pending:    parseInt(s.pending_count),
        inprogress: parseInt(s.inprogress_count),
        postsales:  parseInt(s.postsales_count),
        done:       parseInt(s.done_count),
      },
      snapshot: {
        createdToday:  parseInt(s.created_today),
        completedToday:parseInt(s.done_count),
        overdue:       parseInt(s.overdue_count),
        renewalsDue30d:parseInt(renewals.rows[0].cnt),
      }
    });
  } catch (err) {
    console.error('Dashboard summary error:', err);
    res.status(500).json({ success: false, error: 'Could not fetch dashboard summary' });
  }
});

// ── TASK LIST PER STATUS ───────────────────────────────────
// GET /api/dashboard/tasks/pending
// GET /api/dashboard/tasks/inprogress
// GET /api/dashboard/tasks/postsales
// GET /api/dashboard/tasks/done
router.get('/tasks/:status', auth, async (req, res) => {
  const validStatuses = ['pending', 'inprogress', 'postsales', 'done'];
  const status = req.params.status;

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status' });
  }

  try {
    const result = await query(
      `SELECT
         t.id, t.title, t.status, t.stage, t.priority,
         t.tx_type, t.due_date, t.created_at,
         t.client_name, t.client_mobile, t.client_email,
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
       WHERE t.status = $1
       ORDER BY
         CASE t.priority
           WHEN 'Urgent' THEN 1
           WHEN 'High'   THEN 2
           ELSE               3
         END,
         t.due_date ASC`,
      [status]
    );

    res.json({ success: true, tasks: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('Task list error:', err);
    res.status(500).json({ success: false, error: 'Could not fetch tasks' });
  }
});

// ── VERTICAL COUNTS (dashboard bottom cards) ──────────────
// GET /api/dashboard/verticals
router.get('/verticals', auth, async (req, res) => {
  try {
    const result = await query(
      `SELECT
         v.id, v.code, v.name, v.icon,
         COUNT(t.id) FILTER (WHERE t.status != 'done') AS active_count
       FROM verticals v
       LEFT JOIN tasks t ON t.vertical_id = v.id
       WHERE v.is_active = TRUE
       GROUP BY v.id
       ORDER BY v.display_order`
    );

    res.json({ success: true, verticals: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Could not fetch vertical counts' });
  }
});

module.exports = router;
