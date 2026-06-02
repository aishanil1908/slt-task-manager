// routes/suggestions.js
// Feature / Bug Suggestions submitted by any logged-in user
// POST /api/suggestions        — submit a suggestion
// GET  /api/suggestions        — get all (Admin/Partner only)
// PUT  /api/suggestions/:id    — update status/admin note (Admin/Partner only)

const express = require('express');
const router  = express.Router();
const { query } = require('../config/db');
const auth    = require('../middleware/auth');

// POST /api/suggestions
router.post('/', auth, async (req, res) => {
  const { category, title, description, priority } = req.body;
  if (!title || !title.trim() || !description || !description.trim()) {
    return res.status(400).json({ success: false, error: 'Title and description are required' });
  }

  const validCategories = ['bug_report', 'feature_request', 'ui_improvement', 'other'];
  const validPriorities  = ['normal', 'important', 'critical'];
  const cat = validCategories.includes(category) ? category : 'feature_request';
  const pri = validPriorities.includes(priority)  ? priority  : 'normal';

  try {
    const result = await query(
      `INSERT INTO feature_suggestions (submitted_by, category, title, description, priority)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [req.user.id, cat, title.trim(), description.trim(), pri]
    );

    // Notify all admins
    const admins = await query(`SELECT id FROM users WHERE role='Admin / Partner' AND is_active=TRUE`);
    for (const admin of admins.rows) {
      await query(
        `INSERT INTO notifications (recipient_id, type, title, message)
         VALUES ($1,'suggestion_received','New suggestion received',$2)`,
        [admin.id, `${req.user.full_name} submitted a ${cat.replace('_',' ')}: "${title.trim().slice(0,60)}"` ]
      );
    }

    res.status(201).json({ success: true, id: result.rows[0].id, message: 'Suggestion submitted — thank you!' });
  } catch (err) {
    console.error('Suggestion create error:', err);
    res.status(500).json({ success: false, error: 'Could not submit suggestion: ' + err.message });
  }
});

// GET /api/suggestions — Admin/Partner only
router.get('/', auth, async (req, res) => {
  if (req.user.role !== 'Admin / Partner') {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  try {
    const result = await query(
      `SELECT s.*, u.full_name AS submitted_by_name, u.role AS submitted_by_role
       FROM feature_suggestions s
       LEFT JOIN users u ON s.submitted_by = u.id
       ORDER BY
         CASE s.priority WHEN 'critical' THEN 1 WHEN 'important' THEN 2 ELSE 3 END,
         s.created_at DESC`
    );
    res.json({ success: true, suggestions: result.rows });
  } catch (err) {
    console.error('Suggestion list error:', err);
    res.status(500).json({ success: false, error: 'Could not fetch suggestions' });
  }
});

// PUT /api/suggestions/:id — update status / admin_note
router.put('/:id', auth, async (req, res) => {
  if (req.user.role !== 'Admin / Partner') {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  const { status, adminNote } = req.body;
  const validStatuses = ['open', 'under_review', 'planned', 'done', 'rejected'];
  const newStatus = validStatuses.includes(status) ? status : undefined;

  try {
    await query(
      `UPDATE feature_suggestions
       SET status = COALESCE($1, status),
           admin_note = COALESCE($2, admin_note),
           updated_at = NOW()
       WHERE id = $3`,
      [newStatus || null, adminNote || null, req.params.id]
    );
    res.json({ success: true, message: 'Suggestion updated' });
  } catch (err) {
    console.error('Suggestion update error:', err);
    res.status(500).json({ success: false, error: 'Could not update suggestion' });
  }
});

module.exports = router;
