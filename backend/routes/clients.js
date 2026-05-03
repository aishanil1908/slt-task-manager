// =============================================================
// routes/clients.js — Client Master API
// Mounted in server.js as: app.use('/api/clients', require('./routes/clients'));
// =============================================================

const express = require('express');
const router  = express.Router();
const { query } = require('../config/db');
const auth = require('../middleware/auth');


// ─────────────────────────────────────────────────────────────
// GET /api/clients/search?q=<query>
// Live search for task wizard autocomplete.
// Min 2 chars. Searches name, mobile, PAN, email.
// Returns max 10 results, active clients only.
// All authenticated users can search.
// ─────────────────────────────────────────────────────────────
router.get('/search', auth, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json({ success: true, clients: [] });

    const result = await query(
      `SELECT id, client_name, father_spouse_name, mobile, email, pan_number
       FROM   clients
       WHERE  is_active = TRUE
         AND  (
               client_name  ILIKE $1
            OR mobile       LIKE  $2
            OR pan_number   ILIKE $1
            OR email        ILIKE $1
         )
       ORDER BY client_name
       LIMIT 10`,
      [`%${q}%`, `%${q}%`]
    );

    res.json({ success: true, clients: result.rows });
  } catch (err) {
    console.error('[clients/search]', err.message);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/clients
// Create a new client record.
// Required: clientName, mobile (10-digit)
// Optional: fatherSpouseName, email, panNumber, address
// Rejects duplicate mobile (returns the existing client on 409).
// All authenticated users can create (anyone creating a task may
// need to add a new client).
// ─────────────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const {
      clientName, fatherSpouseName, mobile, email, panNumber, address
    } = req.body;

    // ── Validation ────────────────────────────────────────────
    if (!clientName || !clientName.trim()) {
      return res.status(400).json({ success: false, error: 'Client name is required' });
    }
    if (!mobile || !/^\d{10}$/.test(mobile.trim())) {
      return res.status(400).json({ success: false, error: 'Valid 10-digit mobile number is required' });
    }
    if (panNumber && panNumber.trim() && !/^[A-Z]{5}\d{4}[A-Z]{1}$/.test(panNumber.trim().toUpperCase())) {
      return res.status(400).json({ success: false, error: 'PAN format invalid (e.g. ABCDE1234F)' });
    }

    // ── Duplicate check by mobile ─────────────────────────────
    const dup = await query(
      'SELECT id, client_name FROM clients WHERE mobile = $1 AND is_active = TRUE',
      [mobile.trim()]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({
        success:        false,
        error:          `A client with this mobile already exists: ${dup.rows[0].client_name}`,
        existingClient: dup.rows[0]
      });
    }

    // ── Insert ────────────────────────────────────────────────
    const result = await query(
      `INSERT INTO clients
         (client_name, father_spouse_name, mobile, email, pan_number, address, source, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'slt_taskmanager', $7)
       RETURNING id, client_name, father_spouse_name, mobile, email, pan_number`,
      [
        clientName.trim(),
        fatherSpouseName?.trim()  || null,
        mobile.trim(),
        email?.trim()             || null,
        panNumber?.trim()?.toUpperCase() || null,
        address?.trim()           || null,
        req.user.id
      ]
    );

    res.status(201).json({ success: true, client: result.rows[0] });
  } catch (err) {
    console.error('[clients/create]', err.message);
    res.status(500).json({ success: false, error: 'Failed to create client' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/clients/:id
// Fetch single client by ID (for task detail display).
// All authenticated users.
// ─────────────────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, client_name, father_spouse_name, mobile, email,
              pan_number, address, source, created_at
       FROM   clients
       WHERE  id = $1 AND is_active = TRUE`,
      [req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }
    res.json({ success: true, client: result.rows[0] });
  } catch (err) {
    console.error('[clients/get]', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch client' });
  }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/clients/:id
// Update client details.
// Manager+ only (prevent casual edits by back-office staff).
// ─────────────────────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const {
      clientName, fatherSpouseName, mobile, email, panNumber, address
    } = req.body;

    if (!clientName?.trim()) {
      return res.status(400).json({ success: false, error: 'Client name is required' });
    }
    if (panNumber && panNumber.trim() && !/^[A-Z]{5}\d{4}[A-Z]{1}$/.test(panNumber.trim().toUpperCase())) {
      return res.status(400).json({ success: false, error: 'PAN format invalid' });
    }

    const result = await query(
      `UPDATE clients
       SET client_name        = $1,
           father_spouse_name = $2,
           mobile             = $3,
           email              = $4,
           pan_number         = $5,
           address            = $6,
           updated_at         = NOW()
       WHERE id = $7 AND is_active = TRUE
       RETURNING id, client_name, father_spouse_name, mobile, email, pan_number`,
      [
        clientName.trim(),
        fatherSpouseName?.trim()  || null,
        mobile?.trim()            || null,
        email?.trim()             || null,
        panNumber?.trim()?.toUpperCase() || null,
        address?.trim()           || null,
        req.params.id
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }
    res.json({ success: true, client: result.rows[0] });
  } catch (err) {
    console.error('[clients/update]', err.message);
    res.status(500).json({ success: false, error: 'Failed to update client' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/clients
// Full client list with task counts.
// Manager+ only (used by future Client Master admin page).
// ─────────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const result = await query(
      `SELECT c.id,
              c.client_name,
              c.father_spouse_name,
              c.mobile,
              c.email,
              c.pan_number,
              c.source,
              c.created_at,
              u.full_name        AS created_by_name,
              COUNT(t.id)::int   AS task_count
       FROM   clients c
       LEFT   JOIN users u  ON u.id = c.created_by
       LEFT   JOIN tasks t  ON t.client_id = c.id
       WHERE  c.is_active = TRUE
       GROUP  BY c.id, u.full_name
       ORDER  BY c.client_name`
    );
    res.json({ success: true, clients: result.rows });
  } catch (err) {
    console.error('[clients/list]', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch clients' });
  }
});

module.exports = router;
