// routes/admin.js
// System Admin only routes — no task access
//
// USER MANAGEMENT
// GET    /api/admin/users                    — list all users
// POST   /api/admin/users                    — create user
// PUT    /api/admin/users/:id                — edit user
// PUT    /api/admin/users/:id/deactivate     — deactivate user
// PUT    /api/admin/users/:id/activate       — reactivate user
// PUT    /api/admin/users/:id/password       — reset password
//
// JOB PROFILES
// GET    /api/admin/job-profiles             — list all
// POST   /api/admin/job-profiles             — create
// PUT    /api/admin/job-profiles/:id         — edit
//
// REPORTING HIERARCHY
// GET    /api/admin/hierarchy                — full reporting tree
// POST   /api/admin/hierarchy               — assign manager
// DELETE /api/admin/hierarchy/:id           — remove reporting line
//
// MASTER DATA
// GET    /api/admin/verticals               — list all verticals
// POST   /api/admin/verticals               — add new
// PUT    /api/admin/verticals/:id           — edit (non-system only)
// PUT    /api/admin/verticals/:id/toggle    — activate/deactivate
//
// GET    /api/admin/categories              — list all
// POST   /api/admin/categories              — add new
// PUT    /api/admin/categories/:id          — edit (non-system only)
// PUT    /api/admin/categories/:id/toggle   — activate/deactivate
//
// GET    /api/admin/natures                 — list all
// POST   /api/admin/natures                 — add new
// PUT    /api/admin/natures/:id             — edit (non-system only)
// PUT    /api/admin/natures/:id/toggle      — activate/deactivate

const express   = require('express');
const router    = express.Router();
const bcrypt    = require('bcryptjs');
const { query } = require('../config/db');
const auth      = require('../middleware/auth');

// ── SYSTEM ADMIN GUARD ────────────────────────────────────
// All routes in this file require System Admin role
const isSysAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'System Admin') {
    return res.status(403).json({
      success: false,
      error: 'Access denied. System Admin role required.'
    });
  }
  next();
};

// Apply to ALL routes in this file
router.use(auth, isSysAdmin);


// ════════════════════════════════════════════════════════════
// USER MANAGEMENT
// ════════════════════════════════════════════════════════════

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const result = await query(
      `SELECT
         u.id, u.username, u.full_name, u.email, u.mobile,
         u.role, u.is_active, u.allow_dual_reporting,
         u.last_login, u.created_at,
         jp.title AS job_profile,
         pm.full_name  AS primary_manager,
         pm.id         AS primary_manager_id,
         sm.full_name  AS secondary_manager,
         sm.id         AS secondary_manager_id,
         ARRAY_AGG(DISTINCT v.code) FILTER (WHERE v.code IS NOT NULL) AS vertical_access
       FROM users u
       LEFT JOIN job_profiles jp ON jp.id = u.job_profile_id
       LEFT JOIN user_reporting_map urm_p
         ON urm_p.user_id = u.id AND urm_p.priority = 'primary'  AND urm_p.is_active = TRUE
       LEFT JOIN users pm ON pm.id = urm_p.manager_id
       LEFT JOIN user_reporting_map urm_s
         ON urm_s.user_id = u.id AND urm_s.priority = 'secondary' AND urm_s.is_active = TRUE
       LEFT JOIN users sm ON sm.id = urm_s.manager_id
       LEFT JOIN user_vertical_access uva ON uva.user_id = u.id
       LEFT JOIN verticals v ON v.id = uva.vertical_id
       WHERE u.role != 'System Admin'
       GROUP BY u.id, jp.title, pm.full_name, pm.id, sm.full_name, sm.id
       ORDER BY u.full_name`
    );
    res.json({ success: true, users: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Could not fetch users' });
  }
});

// POST /api/admin/users
router.post('/users', async (req, res) => {
  const {
    fullName, email, mobile, role, password,
    jobProfileId, allowDualReporting,
    primaryManagerId, secondaryManagerId,
    verticalAccess  // array of codes: ['ca','dist','broke']
  } = req.body;

  if (!fullName || !email || !role) {
    return res.status(400).json({ success: false, error: 'Full name, email and role are required' });
  }

  try {
    // Check email uniqueness
    const existing = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'A user with this email already exists' });
    }

    // Generate username from name — e.g. "Priya Sharma" → "priya.sharma"
    let username = fullName.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z.]/g, '');
    const uCheck = await query('SELECT COUNT(*) AS cnt FROM users WHERE username LIKE $1', [`${username}%`]);
    if (parseInt(uCheck.rows[0].cnt) > 0) {
      username = `${username}${uCheck.rows[0].cnt}`;
    }

    // Hash password if provided
    let passwordHash = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    // Insert user
    const userResult = await query(
      `INSERT INTO users
         (username, full_name, email, mobile, role, password_hash,
          job_profile_id, allow_dual_reporting, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)
       RETURNING id, username`,
      [
        username, fullName, email, mobile || null, role,
        passwordHash, jobProfileId || null,
        allowDualReporting === true
      ]
    );

    const newUserId = userResult.rows[0].id;

    // Assign vertical access
    const codes = Array.isArray(verticalAccess) && verticalAccess.length > 0
      ? verticalAccess
      : ['ca', 'dist', 'broke']; // default: all verticals

    for (const code of codes) {
      const vResult = await query('SELECT id FROM verticals WHERE code = $1', [code]);
      if (vResult.rows[0]) {
        await query(
          `INSERT INTO user_vertical_access (user_id, vertical_id)
           VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [newUserId, vResult.rows[0].id]
        );
      }
    }

    // Assign primary manager
    if (primaryManagerId) {
      await query(
        `INSERT INTO user_reporting_map (user_id, manager_id, priority, assigned_by)
         VALUES ($1,$2,'primary',$3)
         ON CONFLICT (user_id, manager_id) DO NOTHING`,
        [newUserId, primaryManagerId, req.user.id]
      );
      // Keep reports_to in sync for backward compatibility
      await query('UPDATE users SET reports_to = $1 WHERE id = $2', [primaryManagerId, newUserId]);
    }

    // Assign secondary manager (only if allow_dual_reporting = true)
    if (secondaryManagerId && allowDualReporting === true) {
      await query(
        `INSERT INTO user_reporting_map (user_id, manager_id, priority, assigned_by)
         VALUES ($1,$2,'secondary',$3)
         ON CONFLICT (user_id, manager_id) DO NOTHING`,
        [newUserId, secondaryManagerId, req.user.id]
      );
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

// PUT /api/admin/users/:id
router.put('/users/:id', async (req, res) => {
  const { fullName, email, mobile, role, jobProfileId, allowDualReporting, verticalAccess, primaryManagerId, secondaryManagerId } = req.body;

  try {
    await query(
      `UPDATE users SET
         full_name = COALESCE($1, full_name),
         email = COALESCE($2, email),
         mobile = COALESCE($3, mobile),
         role = COALESCE($4, role),
         job_profile_id = COALESCE($5, job_profile_id),
         allow_dual_reporting = COALESCE($6, allow_dual_reporting),
         updated_at = NOW()
       WHERE id = $7`,
      [fullName, email, mobile, role, jobProfileId, allowDualReporting, req.params.id]
    );

    // Update vertical access if provided
    if (Array.isArray(verticalAccess)) {
      await query('DELETE FROM user_vertical_access WHERE user_id = $1', [req.params.id]);
      for (const code of verticalAccess) {
        const vResult = await query('SELECT id FROM verticals WHERE code = $1', [code]);
        if (vResult.rows[0]) {
          await query(
            `INSERT INTO user_vertical_access (user_id, vertical_id)
             VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [req.params.id, vResult.rows[0].id]
          );
        }
      }
    }

    // Update primary manager
        if (req.body.primaryManagerId !== undefined) {
          const newMgrId = req.body.primaryManagerId || null;
          await query(
            'UPDATE users SET reports_to = $1 WHERE id = $2',
            [newMgrId, req.params.id]
          );
          await query(
            `UPDATE user_reporting_map SET is_active = FALSE 
            WHERE user_id = $1 AND priority = 'primary'`,
            [req.params.id]
          );
          if (newMgrId) {
            await query(
              `INSERT INTO user_reporting_map (user_id, manager_id, priority, assigned_by)
              VALUES ($1,$2,'primary',$3)
              ON CONFLICT (user_id, manager_id)
              DO UPDATE SET is_active = TRUE, assigned_by = $3`,
              [req.params.id, newMgrId, req.user.id]
            );
          }
        }
    // Update secondary manager
if (secondaryManagerId !== undefined) {
  await query(
    `UPDATE user_reporting_map SET is_active = FALSE 
     WHERE user_id = $1 AND priority = 'secondary'`,
    [req.params.id]
  );
  if (secondaryManagerId) {
    await query(
      `INSERT INTO user_reporting_map (user_id, manager_id, priority, assigned_by)
       VALUES ($1,$2,'secondary',$3)
       ON CONFLICT (user_id, manager_id)
       DO UPDATE SET is_active = TRUE, assigned_by = $3`,
      [req.params.id, secondaryManagerId, req.user.id]
    );
  }
}

    res.json({ success: true, message: 'User updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Could not update user: ' + err.message });
  }
});

// PUT /api/admin/users/:id/deactivate
router.put('/users/:id/deactivate', async (req, res) => {
  try {
    await query(
      'UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1',
      [req.params.id]
    );
    res.json({ success: true, message: 'User deactivated' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not deactivate user' });
  }
});

// PUT /api/admin/users/:id/activate
router.put('/users/:id/activate', async (req, res) => {
  try {
    await query(
      'UPDATE users SET is_active = TRUE, updated_at = NOW() WHERE id = $1',
      [req.params.id]
    );
    res.json({ success: true, message: 'User activated' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not activate user' });
  }
});

// PUT /api/admin/users/:id/password
router.put('/users/:id/password', async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
  }
  try {
    const hash = await bcrypt.hash(newPassword, 10);
    await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hash, req.params.id]
    );
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not reset password' });
  }
});


// ════════════════════════════════════════════════════════════
// JOB PROFILES
// ════════════════════════════════════════════════════════════

// GET /api/admin/job-profiles
router.get('/job-profiles', async (req, res) => {
  try {
    const result = await query(
      `SELECT jp.*,
         COUNT(u.id) AS user_count
       FROM job_profiles jp
       LEFT JOIN users u ON u.job_profile_id = jp.id AND u.is_active = TRUE
       GROUP BY jp.id
       ORDER BY jp.title`
    );
    res.json({ success: true, jobProfiles: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not fetch job profiles' });
  }
});

// POST /api/admin/job-profiles
router.post('/job-profiles', async (req, res) => {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ success: false, error: 'Title is required' });
  try {
    const result = await query(
      `INSERT INTO job_profiles (title, description, created_by)
       VALUES ($1,$2,$3) RETURNING id`,
      [title, description || null, req.user.id]
    );
    res.status(201).json({ success: true, id: result.rows[0].id, message: 'Job profile created' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ success: false, error: 'A job profile with this title already exists' });
    }
    res.status(500).json({ success: false, error: 'Could not create job profile' });
  }
});

// PUT /api/admin/job-profiles/:id
router.put('/job-profiles/:id', async (req, res) => {
  const { title, description, isActive } = req.body;
  try {
    await query(
      `UPDATE job_profiles SET
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         is_active = COALESCE($3, is_active),
         updated_at = NOW()
       WHERE id = $4`,
      [title, description, isActive, req.params.id]
    );
    res.json({ success: true, message: 'Job profile updated' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not update job profile' });
  }
});


// ════════════════════════════════════════════════════════════
// REPORTING HIERARCHY
// ════════════════════════════════════════════════════════════

// GET /api/admin/hierarchy
router.get('/hierarchy', async (req, res) => {
  try {
    const result = await query(`SELECT * FROM v_user_reporting ORDER BY full_name`);
    res.json({ success: true, hierarchy: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not fetch hierarchy' });
  }
});

// POST /api/admin/hierarchy
// Body: { userId, managerId, priority: 'primary'|'secondary' }
router.post('/hierarchy', async (req, res) => {
  const { userId, managerId, priority } = req.body;

  if (!userId || !managerId || !priority) {
    return res.status(400).json({ success: false, error: 'userId, managerId and priority are required' });
  }
  if (!['primary', 'secondary'].includes(priority)) {
    return res.status(400).json({ success: false, error: 'Priority must be primary or secondary' });
  }

  try {
    // If secondary, check allow_dual_reporting flag
    if (priority === 'secondary') {
      const user = await query('SELECT allow_dual_reporting FROM users WHERE id = $1', [userId]);
      if (!user.rows[0]?.allow_dual_reporting) {
        return res.status(400).json({
          success: false,
          error: 'This employee does not have dual reporting enabled. Edit the user first.'
        });
      }
    }

    // Deactivate existing mapping of same priority for this user
    await query(
      `UPDATE user_reporting_map SET is_active = FALSE
       WHERE user_id = $1 AND priority = $2`,
      [userId, priority]
    );

    // Insert new mapping
    await query(
      `INSERT INTO user_reporting_map (user_id, manager_id, priority, assigned_by)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, manager_id)
       DO UPDATE SET is_active = TRUE, assigned_by = $4`,
      [userId, managerId, priority, req.user.id]
    );

    // Keep reports_to in sync for primary
    if (priority === 'primary') {
      await query('UPDATE users SET reports_to = $1 WHERE id = $2', [managerId, userId]);
    }

    res.json({ success: true, message: `${priority} reporting line assigned successfully` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Could not assign reporting line: ' + err.message });
  }
});

// DELETE /api/admin/hierarchy/:id
router.delete('/hierarchy/:id', async (req, res) => {
  try {
    await query(
      'UPDATE user_reporting_map SET is_active = FALSE WHERE id = $1',
      [req.params.id]
    );
    res.json({ success: true, message: 'Reporting line removed' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not remove reporting line' });
  }
});


// ════════════════════════════════════════════════════════════
// MASTER DATA — VERTICALS
// ════════════════════════════════════════════════════════════

// GET /api/admin/verticals
router.get('/verticals', async (req, res) => {
  try {
    const result = await query(
      `SELECT v.*,
         COUNT(DISTINCT c.id) AS category_count
       FROM verticals v
       LEFT JOIN categories c ON c.vertical_id = v.id
       GROUP BY v.id
       ORDER BY v.display_order`
    );
    res.json({ success: true, verticals: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not fetch verticals' });
  }
});

// POST /api/admin/verticals
router.post('/verticals', async (req, res) => {
  const { code, name, icon, displayOrder } = req.body;
  if (!code || !name) {
    return res.status(400).json({ success: false, error: 'Code and name are required' });
  }
  try {
    const result = await query(
      `INSERT INTO verticals (code, name, icon, display_order, is_system)
       VALUES (LOWER($1),$2,$3,$4,FALSE) RETURNING id`,
      [code, name, icon || null, displayOrder || 99]
    );
    res.status(201).json({ success: true, id: result.rows[0].id, message: 'Vertical created' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ success: false, error: 'A vertical with this code already exists' });
    }
    res.status(500).json({ success: false, error: 'Could not create vertical' });
  }
});

// PUT /api/admin/verticals/:id
router.put('/verticals/:id', async (req, res) => {
  const { name, icon, displayOrder } = req.body;
  try {
    // Protect system entries — name cannot be changed
    const v = await query('SELECT is_system FROM verticals WHERE id = $1', [req.params.id]);
    if (v.rows[0]?.is_system) {
      return res.status(400).json({ success: false, error: 'System verticals cannot be renamed. You can only change display order or icon.' });
    }
    await query(
      `UPDATE verticals SET
         name = COALESCE($1, name),
         icon = COALESCE($2, icon),
         display_order = COALESCE($3, display_order)
       WHERE id = $4`,
      [name, icon, displayOrder, req.params.id]
    );
    res.json({ success: true, message: 'Vertical updated' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not update vertical' });
  }
});

// PUT /api/admin/verticals/:id/toggle
router.put('/verticals/:id/toggle', async (req, res) => {
  try {
    const v = await query('SELECT is_system, is_active FROM verticals WHERE id = $1', [req.params.id]);
    if (v.rows[0]?.is_system) {
      return res.status(400).json({ success: false, error: 'System verticals cannot be deactivated' });
    }
    await query(
      'UPDATE verticals SET is_active = NOT is_active WHERE id = $1',
      [req.params.id]
    );
    res.json({ success: true, message: 'Vertical status toggled' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not toggle vertical' });
  }
});


// ════════════════════════════════════════════════════════════
// MASTER DATA — CATEGORIES (Products)
// ════════════════════════════════════════════════════════════

// GET /api/admin/categories
router.get('/categories', async (req, res) => {
  try {
    const result = await query(
      `SELECT c.*, v.name AS vertical_name, v.code AS vertical_code,
         COUNT(DISTINCT n.id) AS nature_count
       FROM categories c
       JOIN verticals v ON v.id = c.vertical_id
       LEFT JOIN transaction_natures n ON n.category_id = c.id
       GROUP BY c.id, v.name, v.code, v.display_order, c.display_order
       ORDER BY v.display_order, c.display_order`
    );
    res.json({ success: true, categories: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not fetch categories' });
  }
});

// POST /api/admin/categories
router.post('/categories', async (req, res) => {
  const { verticalId, code, name, icon, displayOrder, requiresPostsales, defaultPsTemplate } = req.body;
  if (!verticalId || !code || !name) {
    return res.status(400).json({ success: false, error: 'verticalId, code and name are required' });
  }
  try {
    const result = await query(
      `INSERT INTO categories
         (vertical_id, code, name, icon, display_order,
          requires_postsales, default_ps_template, is_system)
       VALUES ($1,LOWER($2),$3,$4,$5,$6,$7,FALSE) RETURNING id`,
      [
        verticalId, code, name, icon || null, displayOrder || 99,
        requiresPostsales || false,
        defaultPsTemplate || 'none'
      ]
    );
    res.status(201).json({ success: true, id: result.rows[0].id, message: 'Category created' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ success: false, error: 'A category with this code already exists' });
    }
    res.status(500).json({ success: false, error: 'Could not create category' });
  }
});

// PUT /api/admin/categories/:id
router.put('/categories/:id', async (req, res) => {
  const { name, icon, displayOrder, requiresPostsales, defaultPsTemplate } = req.body;
  try {
    const c = await query('SELECT is_system FROM categories WHERE id = $1', [req.params.id]);
    if (c.rows[0]?.is_system) {
      return res.status(400).json({ success: false, error: 'System categories cannot be renamed' });
    }
    await query(
      `UPDATE categories SET
         name = COALESCE($1, name),
         icon = COALESCE($2, icon),
         display_order = COALESCE($3, display_order),
         requires_postsales = COALESCE($4, requires_postsales),
         default_ps_template = COALESCE($5, default_ps_template)
       WHERE id = $6`,
      [name, icon, displayOrder, requiresPostsales, defaultPsTemplate, req.params.id]
    );
    res.json({ success: true, message: 'Category updated' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not update category' });
  }
});

// PUT /api/admin/categories/:id/toggle
router.put('/categories/:id/toggle', async (req, res) => {
  try {
    const c = await query('SELECT is_system FROM categories WHERE id = $1', [req.params.id]);
    if (c.rows[0]?.is_system) {
      return res.status(400).json({ success: false, error: 'System categories cannot be deactivated' });
    }
    await query('UPDATE categories SET is_active = NOT is_active WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Category status toggled' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not toggle category' });
  }
});


// ════════════════════════════════════════════════════════════
// MASTER DATA — TRANSACTION NATURES
// ════════════════════════════════════════════════════════════

// GET /api/admin/natures
router.get('/natures', async (req, res) => {
  try {
    const result = await query(
      `SELECT n.*, c.name AS category_name, c.code AS category_code,
              v.name AS vertical_name
       FROM transaction_natures n
       JOIN categories c ON c.id = n.category_id
       JOIN verticals v ON v.id = c.vertical_id
       ORDER BY v.display_order, c.display_order, n.display_order`
    );
    res.json({ success: true, natures: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not fetch natures' });
  }
});

// POST /api/admin/natures
router.post('/natures', async (req, res) => {
  const {
    categoryId, code, name, description, icon,
    ftAllowed, nftAllowed, isSip, displayOrder, psTemplateOverride
  } = req.body;

  if (!categoryId || !code || !name) {
    return res.status(400).json({ success: false, error: 'categoryId, code and name are required' });
  }
  if (ftAllowed === false && nftAllowed === false) {
    return res.status(400).json({ success: false, error: 'At least one of ftAllowed or nftAllowed must be true' });
  }

  try {
    const result = await query(
      `INSERT INTO transaction_natures
         (category_id, code, name, description, icon,
          ft_allowed, nft_allowed, is_sip, display_order,
          ps_template_override, is_system)
       VALUES ($1,LOWER($2),$3,$4,$5,$6,$7,$8,$9,$10,FALSE) RETURNING id`,
      [
        categoryId, code, name, description || null, icon || null,
        ftAllowed !== false,
        nftAllowed !== false,
        isSip || false,
        displayOrder || 99,
        psTemplateOverride || null
      ]
    );
    res.status(201).json({ success: true, id: result.rows[0].id, message: 'Transaction nature created' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ success: false, error: 'A nature with this code already exists' });
    }
    res.status(500).json({ success: false, error: 'Could not create nature' });
  }
});

// PUT /api/admin/natures/:id
router.put('/natures/:id', async (req, res) => {
  const { name, description, icon, ftAllowed, nftAllowed, displayOrder, psTemplateOverride } = req.body;

  if (ftAllowed === false && nftAllowed === false) {
    return res.status(400).json({ success: false, error: 'At least one of ftAllowed or nftAllowed must be true' });
  }

  try {
    const n = await query('SELECT is_system FROM transaction_natures WHERE id = $1', [req.params.id]);
    if (n.rows[0]?.is_system) {
      // System natures: only ft_allowed, nft_allowed, display_order can change
      await query(
        `UPDATE transaction_natures SET
           ft_allowed    = COALESCE($1, ft_allowed),
           nft_allowed   = COALESCE($2, nft_allowed),
           display_order = COALESCE($3, display_order)
         WHERE id = $4`,
        [ftAllowed, nftAllowed, displayOrder, req.params.id]
      );
    } else {
      await query(
        `UPDATE transaction_natures SET
           name                = COALESCE($1, name),
           description         = COALESCE($2, description),
           icon                = COALESCE($3, icon),
           ft_allowed          = COALESCE($4, ft_allowed),
           nft_allowed         = COALESCE($5, nft_allowed),
           display_order       = COALESCE($6, display_order),
           ps_template_override = COALESCE($7, ps_template_override)
         WHERE id = $8`,
        [name, description, icon, ftAllowed, nftAllowed, displayOrder, psTemplateOverride, req.params.id]
      );
    }
    res.json({ success: true, message: 'Transaction nature updated' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not update nature' });
  }
});

// PUT /api/admin/natures/:id/toggle
router.put('/natures/:id/toggle', async (req, res) => {
  try {
    const n = await query('SELECT is_system FROM transaction_natures WHERE id = $1', [req.params.id]);
    if (n.rows[0]?.is_system) {
      return res.status(400).json({ success: false, error: 'System transaction natures cannot be deactivated' });
    }
    await query('UPDATE transaction_natures SET is_active = NOT is_active WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Nature status toggled' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not toggle nature' });
  }
});

module.exports = router;
