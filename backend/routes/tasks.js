// routes/tasks.js
// Full task CRUD + lifecycle management
//
// POST   /api/tasks              — create task
// GET    /api/tasks/:id          — get single task with full detail
// PUT    /api/tasks/:id/stage    — lifecycle action (confirm/sendback/verify/reopen/start)
// POST   /api/tasks/:id/proof    — upload Stage 2 proof file
// POST   /api/tasks/:id/fulfillment — save Stage 4 post-sales data
// POST   /api/tasks/:id/subtasks — add subtask
// GET    /api/tasks/:id/history  — stage change audit trail

const express = require('express');
const router = express.Router();
const { upload, saveFileToDisk } = require('../middleware/fileUpload');
const path = require('path');
const fs = require('fs');
const { query } = require('../config/db');
const auth = require('../middleware/auth');
require('dotenv').config();

// ── FILE UPLOAD SETUP ─────────────────────────────────────
const uploadDir = process.env.FILE_UPLOAD_PATH || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });


// ── CREATE TASK ───────────────────────────────────────────
// POST /api/tasks
router.post('/', auth, async (req, res) => {
  const {
    verticalCode, categoryCode, natureCode, txType,
    sipFrequency, sipDate, sipDay,
    clientName, clientFather, clientMobile, clientEmail,
    title, description, priority, proofRequired, dueDate,
    assignedTo,
    subtasks   // array of { title, instructions, assignedTo, dueDate }
  } = req.body;

  // Validate required fields
  if (!verticalCode || !categoryCode || !natureCode || !txType) {
    return res.status(400).json({ success: false, error: 'Vertical, category, nature and TX type are required' });
  }
  if (!clientName || !clientMobile) {
    return res.status(400).json({ success: false, error: 'Client name and mobile are required' });
  }
  if (!title || !dueDate || !assignedTo) {
    return res.status(400).json({ success: false, error: 'Title, due date and assignee are required' });
  }

  try {
    // Resolve IDs from codes
    const vertResult = await query('SELECT id FROM verticals WHERE code = $1', [verticalCode]);
    const catResult  = await query('SELECT id, default_ps_template, requires_postsales FROM categories WHERE code = $1', [categoryCode]);
    const natResult  = await query('SELECT id, ps_template_override FROM transaction_natures WHERE code = $1', [natureCode]);

    if (!vertResult.rows[0] || !catResult.rows[0] || !natResult.rows[0]) {
      return res.status(400).json({ success: false, error: 'Invalid vertical, category or nature code' });
    }

    const verticalId  = vertResult.rows[0].id;
    const categoryId  = catResult.rows[0].id;
    const natureId    = natResult.rows[0].id;
    const cat         = catResult.rows[0];
    const nat         = natResult.rows[0];

    // Determine post-sales template
    // Nature-level override takes priority, then category default
    let psTemplate = 'none';
    if (txType === 'Financial Transaction') {
      psTemplate = nat.ps_template_override || cat.default_ps_template || 'none';
    } else if (txType === 'CA Work') {
      psTemplate = 'ca_work';
    } else if (txType === 'Broking Work') {
      psTemplate = 'broking';
    }

    // Insert task
    const taskResult = await query(
      `INSERT INTO tasks (
         vertical_id, category_id, nature_id, tx_type,
         sip_frequency, sip_date, sip_day, ps_template,
         client_name, client_father, client_mobile, client_email,
         title, description, priority, proof_required, due_date,
         assigned_to, created_by,
         status, stage
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
         $13,$14,$15,$16,$17,$18,$19,
         'pending', 1
       ) RETURNING id`,
      [
        verticalId, categoryId, natureId, txType,
        sipFrequency || null, sipDate || null, sipDay || null, psTemplate,
        clientName, clientFather || null, clientMobile, clientEmail || null,
        title, description || null,
        priority || 'Normal', proofRequired || 'Yes — Mandatory', dueDate,
        assignedTo, req.user.id
      ]
    );

    const taskId = taskResult.rows[0].id;

    // Insert subtasks if provided
    if (subtasks && Array.isArray(subtasks) && subtasks.length > 0) {
      for (let i = 0; i < subtasks.length; i++) {
        const st = subtasks[i];
        if (st.title) {
          await query(
            `INSERT INTO subtasks (task_id, title, instructions, assigned_to, due_date, display_order)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [taskId, st.title, st.instructions || null, st.assignedTo || null, st.dueDate || null, i]
          );
        }
      }
    }

    // Log stage 1 in history
    await query(
      `INSERT INTO task_stage_history (task_id, from_status, to_status, from_stage, to_stage, action, action_by)
       VALUES ($1, NULL, 'pending', NULL, 1, 'created', $2)`,
      [taskId, req.user.id]
    );

    // Create notification for assignee
    await query(
      `INSERT INTO notifications (recipient_id, type, title, message, task_id)
       VALUES ($1, 'task_assigned', $2, $3, $4)`,
      [
        assignedTo,
        `New task assigned: ${title}`,
        `You have been assigned a new task by ${req.user.full_name}. Due: ${dueDate}`,
        taskId
      ]
    );

    res.status(201).json({
      success: true,
      taskId,
      message: `Task created and assigned successfully`
    });

  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ success: false, error: 'Could not create task: ' + err.message });
  }
});

// ── GET SINGLE TASK (full detail) ─────────────────────────
// GET /api/tasks/:id
router.get('/:id', auth, async (req, res) => {
  try {
    // Main task data
    const result = await query(
      `SELECT * FROM v_tasks_full WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    const task = result.rows[0];

    // Subtasks
    const subtasks = await query(
      `SELECT s.*, u.full_name AS assigned_to_name
       FROM subtasks s
       LEFT JOIN users u ON s.assigned_to = u.id
       WHERE s.task_id = $1
       ORDER BY s.display_order`,
      [req.params.id]
    );

    // Proof uploads
    const proofs = await query(
      `SELECT tp.*, u.full_name AS uploaded_by_name
       FROM task_proofs tp
       JOIN users u ON tp.uploaded_by = u.id
       WHERE tp.task_id = $1
       ORDER BY tp.uploaded_at`,
      [req.params.id]
    );

    // Post-sales fulfillment data (if exists)
    const fulfillment = await query(
      `SELECT * FROM post_sales_fulfillment WHERE task_id = $1`,
      [req.params.id]
    );

    res.json({
      success: true,
      task: {
        ...task,
        subtasks: subtasks.rows,
        proofs: proofs.rows,
        fulfillment: fulfillment.rows[0] || null
      }
    });

  } catch (err) {
    console.error('Get task error:', err);
    res.status(500).json({ success: false, error: 'Could not fetch task' });
  }
});

// ── STAGE TRANSITION ──────────────────────────────────────
// PUT /api/tasks/:id/stage
// Body: { action: 'confirm'|'send_back'|'verify'|'reopen'|'start', note: '...' }
router.put('/:id/stage', auth, async (req, res) => {
  const { action, note } = req.body;
  const validActions = ['start', 'confirm', 'send_back', 'verify', 'reopen'];

  if (!validActions.includes(action)) {
    return res.status(400).json({ success: false, error: `Invalid action. Must be one of: ${validActions.join(', ')}` });
  }

  // Send back requires a reason
  if (action === 'send_back' && (!note || note.trim() === '')) {
    return res.status(400).json({ success: false, error: 'A reason is required when sending a task back' });
  }

  try {
    // Call the database function we created in the schema
    const result = await query(
      `SELECT * FROM update_task_stage($1, $2, $3, $4)`,
      [req.params.id, action, req.user.id, note || null]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    const updatedTask = result.rows[0];

    // Send notification based on action
    const notifMap = {
      confirm:   { type: 'task_confirmed',   msg: `Your task has been confirmed by ${req.user.full_name}` },
      send_back: { type: 'task_sent_back',   msg: `Task sent back by ${req.user.full_name}: ${note}` },
      verify:    { type: 'task_completed',   msg: `Task fully completed and verified by ${req.user.full_name}` },
      reopen:    { type: 'task_assigned',    msg: `Task re-opened by ${req.user.full_name}. Please review.` },
    };

    if (notifMap[action]) {
      await query(
        `INSERT INTO notifications (recipient_id, type, title, message, task_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          updatedTask.assigned_to,
          notifMap[action].type,
          `Task update: ${updatedTask.title ? updatedTask.title.slice(0,50) : 'Task'}`,
          notifMap[action].msg,
          updatedTask.id
        ]
      );
    }

    res.json({
      success: true,
      message: `Task ${action} successful`,
      task: {
        id:     updatedTask.id,
        status: updatedTask.status,
        stage:  updatedTask.stage
      }
    });

  } catch (err) {
    console.error('Stage transition error:', err);
    res.status(500).json({ success: false, error: 'Stage transition failed: ' + err.message });
  }
});

// ── PROOF UPLOAD ──────────────────────────────────────────
// POST /api/tasks/:id/proof
// Form data: file (the proof image/PDF), stage (2 or 4)
   router.post('/:id/proof', auth, upload.single('file'), async (req, res) => {
     try {
       if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

       const stage = parseInt(req.body.stage) || 2;
       if (![2, 4].includes(stage)) return res.status(400).json({ success: false, error: 'Stage must be 2 or 4' });

       const saved = await saveFileToDisk(req, req.params.id);

       await query(
         `INSERT INTO task_proofs
            (task_id, stage, file_name, file_path, file_size, mime_type,
             original_file_name, storage_root, uuid_prefix, uploaded_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
         [
           req.params.id, stage,
           saved.fileName, saved.filePath, saved.size, saved.mimeType,
           saved.originalName, saved.storageRoot, saved.uuid,
           req.user.id
         ]
       );

       const flag = stage === 2 ? 'proof_uploaded' : 's4_doc_uploaded';
       await query(`UPDATE tasks SET ${flag} = TRUE, updated_at = NOW() WHERE id = $1`, [req.params.id]);

       res.json({
         success: true,
         message: `Stage ${stage} proof uploaded successfully`,
         file: { name: saved.originalName, size: saved.size }
         // NEVER return saved.filePath — security risk
       });

     } catch (err) {
       console.error('Proof upload error:', err);
       res.status(500).json({ success: false, error: 'Upload failed: ' + err.message });
     }
   });


// ── POST-SALES FULFILLMENT DATA ───────────────────────────
// POST /api/tasks/:id/fulfillment
// Body: all product-specific fields (folio, policy, account no, etc.)
router.post('/:id/fulfillment', auth, async (req, res) => {
  try {
    // Check task exists and is at stage 4
    const taskCheck = await query(
      'SELECT id, ps_template, status FROM tasks WHERE id = $1',
      [req.params.id]
    );

    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    const task = taskCheck.rows[0];
    if (task.status !== 'postsales') {
      return res.status(400).json({ success: false, error: 'Task is not in Post-Sales status' });
    }

    const d = req.body;

    // Upsert fulfillment record
    await query(
      `INSERT INTO post_sales_fulfillment (
         task_id, ps_template,
         folio_number, units, nav_rate, allotment_date, tx_reference, amount_credited,
         client_account_no, demat_account_no, portal_login_id, temp_password, contribution_amount,
         policy_number, policy_issued_date, coverage_from, coverage_to, next_premium_due, annual_premium,
         fd_account_no, fd_receipt_no, fd_maturity_date, interest_rate, maturity_amount,
         bank_account_no, account_type, ifsc_code, net_banking_login,
         itr_ack_no, filing_date, financial_year, itr_form, total_income,
         eg_order_ref, eg_quantity_grams, eg_rate_per_gram, eg_metal_type,
         ca_filing_ref, ca_completion_date, ca_period,
         broker_client_id, broker_demat_no, credentials_shared,
         submitted_by
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
         $20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,
         $37,$38,$39,$40,$41,$42,$43,$44
       )
       ON CONFLICT (task_id) DO UPDATE SET
         folio_number=$3, units=$4, nav_rate=$5, allotment_date=$6, tx_reference=$7, amount_credited=$8,
         client_account_no=$9, demat_account_no=$10, portal_login_id=$11, temp_password=$12, contribution_amount=$13,
         policy_number=$14, policy_issued_date=$15, coverage_from=$16, coverage_to=$17, next_premium_due=$18, annual_premium=$19,
         fd_account_no=$20, fd_receipt_no=$21, fd_maturity_date=$22, interest_rate=$23, maturity_amount=$24,
         bank_account_no=$25, account_type=$26, ifsc_code=$27, net_banking_login=$28,
         itr_ack_no=$29, filing_date=$30, financial_year=$31, itr_form=$32, total_income=$33,
         eg_order_ref=$34, eg_quantity_grams=$35, eg_rate_per_gram=$36, eg_metal_type=$37,
         ca_filing_ref=$38, ca_completion_date=$39, ca_period=$40,
         broker_client_id=$41, broker_demat_no=$42, credentials_shared=$43,
         submitted_by=$44, submitted_at=NOW()`,
      [
        req.params.id, task.ps_template,
        d.folioNumber||null, d.units||null, d.navRate||null, d.allotmentDate||null, d.txReference||null, d.amountCredited||null,
        d.clientAccountNo||null, d.dematAccountNo||null, d.portalLoginId||null, d.tempPassword||null, d.contributionAmount||null,
        d.policyNumber||null, d.policyIssuedDate||null, d.coverageFrom||null, d.coverageTo||null, d.nextPremiumDue||null, d.annualPremium||null,
        d.fdAccountNo||null, d.fdReceiptNo||null, d.fdMaturityDate||null, d.interestRate||null, d.maturityAmount||null,
        d.bankAccountNo||null, d.accountType||null, d.ifscCode||null, d.netBankingLogin||null,
        d.itrAckNo||null, d.filingDate||null, d.financialYear||null, d.itrForm||null, d.totalIncome||null,
        d.egOrderRef||null, d.egQuantityGrams||null, d.egRatePerGram||null, d.egMetalType||null,
        d.caFilingRef||null, d.caCompletionDate||null, d.caPeriod||null,
        d.brokerClientId||null, d.brokerDematNo||null, d.credentialsShared||false,
        req.user.id
      ]
    );

    res.json({ success: true, message: 'Fulfillment data saved successfully' });

  } catch (err) {
    console.error('Fulfillment error:', err);
    res.status(500).json({ success: false, error: 'Could not save fulfillment data: ' + err.message });
  }
});

// ── GET TASK HISTORY ──────────────────────────────────────
// GET /api/tasks/:id/history
router.get('/:id/history', auth, async (req, res) => {
  try {
    const result = await query(
      `SELECT h.*, u.full_name AS action_by_name
       FROM task_stage_history h
       JOIN users u ON h.action_by = u.id
       WHERE h.task_id = $1
       ORDER BY h.created_at ASC`,
      [req.params.id]
    );

    res.json({ success: true, history: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Could not fetch task history' });
  }
});

module.exports = router;
