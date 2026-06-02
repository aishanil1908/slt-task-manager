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
    clientId,                                          // ← Phase 3: client master FK
    title, description, priority, proofRequired, dueDate,
    assignedTo,
    subtasks   // array of { title, instructions, assignedTo, dueDate }
  } = req.body;

  // Validate required fields
  if (!verticalCode || !categoryCode || !natureCode || !txType) {
    return res.status(400).json({ success: false, error: 'Vertical, category, nature and TX type are required' });
  }
  if (!clientId) {
    return res.status(400).json({ success: false, error: 'Client is required — select or create a client' });
  }
  if (!title || !dueDate || !assignedTo) {
    return res.status(400).json({ success: false, error: 'Title, due date and assignee are required' });
  }

  try {
    // Resolve client from master table
    // Also populates denormalized columns so existing views/queries keep working
    const clientResult = await query(
      'SELECT client_name, father_spouse_name, mobile, email FROM clients WHERE id = $1 AND is_active = TRUE',
      [clientId]
    );
    if (!clientResult.rows[0]) {
      return res.status(400).json({ success: false, error: 'Client not found — please select a valid client' });
    }
    const cl = clientResult.rows[0];
    const clientName   = cl.client_name;
    const clientFather = cl.father_spouse_name;
    const clientMobile = cl.mobile;
    const clientEmail  = cl.email;

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
         client_id, client_name, client_father, client_mobile, client_email,
         title, description, priority, proof_required, due_date,
         assigned_to, created_by,
         status, stage
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
         $14,$15,$16,$17,$18,$19,$20,
         'pending', 1
       ) RETURNING id`,
      [
        verticalId, categoryId, natureId, txType,
        sipFrequency || null, sipDate || null, sipDay || null, psTemplate,
        clientId, clientName, clientFather || null, clientMobile, clientEmail || null,
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

    // Subtasks with proof files per subtask (D1–D2)
    const subtasksRaw = await query(
      `SELECT s.*,
              ua.full_name AS assigned_to_name,
              uc.full_name AS completed_by_name
       FROM subtasks s
       LEFT JOIN users ua ON s.assigned_to = ua.id
       LEFT JOIN users uc ON s.completed_by = uc.id
       WHERE s.task_id = $1
       ORDER BY s.display_order`,
      [req.params.id]
    );

    // Attach proof files to each subtask
    const subtaskProofsAll = await query(
      `SELECT sp.*, u.full_name AS uploaded_by_name
       FROM subtask_proofs sp
       JOIN users u ON sp.uploaded_by = u.id
       WHERE sp.task_id = $1
       ORDER BY sp.uploaded_at`,
      [req.params.id]
    );
    const subtaskProofMap = {};
    subtaskProofsAll.rows.forEach(p => {
      if (!subtaskProofMap[p.subtask_id]) subtaskProofMap[p.subtask_id] = [];
      subtaskProofMap[p.subtask_id].push(p);
    });
    const subtasks = subtasksRaw.rows.map(st => ({
      ...st,
      proofs: subtaskProofMap[st.id] || []
    }));

    // Main task proof uploads (D3: only relevant when task has NO subtasks)
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
        subtasks,
        hasSubtasks: subtasks.length > 0,
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
    // D5 — Before confirming stage or verifying, check all subtasks are complete
    if (['confirm', 'verify'].includes(action)) {
      const subtaskCheck = await query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE is_completed = TRUE) AS done
         FROM subtasks WHERE task_id = $1`,
        [req.params.id]
      );
      const { total, done } = subtaskCheck.rows[0];
      if (parseInt(total) > 0 && parseInt(done) < parseInt(total)) {
        return res.status(400).json({
          success: false,
          error: `Cannot advance task — ${parseInt(total) - parseInt(done)} subtask(s) are not yet completed. All subtasks must be done first.`
        });
      }
    }

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

// ── DELETE PROOF FILE (Soft Delete — D6/D7/D8/D9/D10) ────
// DELETE /api/tasks/:id/proof/:proofId
// Body: { reason } — required for managers, optional for staff (D6: no reason needed)
//
// Rules:
//   Staff  — can only delete their OWN file, ONLY while task is inprogress (D6/D7)
//   Manager — can delete any file at any stage, reason required (D8)
//   D9: if task was 'done' → revert to inprogress/stage2, wipe S3 confirmation, notify staff
//   D10: soft-delete — record moves to deleted_proofs, file stays on disk
router.delete('/:id/proof/:proofId', auth, async (req, res) => {
  const isManager = MANAGER_ROLES.includes(req.user.role);
  const { reason } = req.body;

  if (isManager && (!reason || !reason.trim())) {
    return res.status(400).json({ success: false, error: 'Managers must provide a reason when deleting a proof file' });
  }

  try {
    // Fetch the proof record
    const proofRes = await query(
      `SELECT tp.*, t.status AS task_status, t.stage AS task_stage,
              t.client_name, t.title AS task_title,
              t.assigned_to, t.s3_confirmed_by AS s3_confirmed_by_id
       FROM task_proofs tp
       JOIN tasks t ON tp.task_id = t.id
       WHERE tp.id = $1 AND tp.task_id = $2`,
      [req.params.proofId, req.params.id]
    );

    if (!proofRes.rows.length) {
      return res.status(404).json({ success: false, error: 'Proof file not found' });
    }

    const proof = proofRes.rows[0];

    // D7: Staff can only delete before manager confirms (task must be inprogress)
    if (!isManager) {
      if (proof.uploaded_by !== req.user.id) {
        return res.status(403).json({ success: false, error: 'You can only delete files you uploaded yourself' });
      }
      if (proof.task_status !== 'inprogress') {
        return res.status(403).json({ success: false, error: 'You can only delete proof files while the task is in progress and not yet confirmed by your manager' });
      }
    }

    // D10: Move record to deleted_proofs
    await query(
      `INSERT INTO deleted_proofs
         (original_proof_id, task_id, stage, file_name, file_path, file_size,
          mime_type, original_file_name, storage_root, uuid_prefix,
          uploaded_by, uploaded_at,
          deleted_by, delete_reason, deleted_by_role,
          task_status_at_deletion, client_name, task_title)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        proof.id, proof.task_id, proof.stage,
        proof.file_name, proof.file_path, proof.file_size,
        proof.mime_type, proof.original_file_name, proof.storage_root, proof.uuid_prefix,
        proof.uploaded_by, proof.uploaded_at,
        req.user.id, reason ? reason.trim() : null,
        isManager ? 'manager' : 'staff',
        proof.task_status, proof.client_name, proof.task_title
      ]
    );

    // Remove from task_proofs
    await query('DELETE FROM task_proofs WHERE id = $1', [req.params.proofId]);

    // Update proof_uploaded flag if no more proofs remain for stage 2
    const remaining = await query(
      'SELECT COUNT(*) AS cnt FROM task_proofs WHERE task_id = $1 AND stage = $2',
      [req.params.id, proof.stage]
    );
    if (parseInt(remaining.rows[0].cnt) === 0 && proof.stage === 2) {
      await query('UPDATE tasks SET proof_uploaded = FALSE, updated_at = NOW() WHERE id = $1', [req.params.id]);
    }

    // D9: Manager deletes from a completed task → revert to inprogress/stage2
    if (isManager && proof.task_status === 'done') {
      await query(
        `UPDATE tasks SET status='inprogress', stage=2,
          s3_confirmed_by=NULL, s3_confirmed_at=NULL, s3_note=NULL,
          proof_uploaded=FALSE, updated_at=NOW()
         WHERE id=$1`,
        [req.params.id]
      );

      // Log reversion
      await query(
        `INSERT INTO task_stage_history (task_id, action, from_status, to_status, from_stage, to_stage, action_by, note)
         VALUES ($1,'proof_deleted','done','inprogress',5,2,$2,$3)`,
        [req.params.id, req.user.id, `Proof deleted by manager (${req.user.full_name}): ${reason}. Task reverted to In Progress.`]
      );

      // Notify assignee
      await query(
        `INSERT INTO notifications (recipient_id, type, title, message, task_id)
         VALUES ($1,'task_sent_back','Proof deleted — please re-upload',$2,$3)`,
        [proof.assigned_to,
         `A proof file was deleted from task "${proof.task_title.slice(0,50)}" by ${req.user.full_name}: "${reason}". Please re-upload the correct file.`,
         req.params.id]
      );

      return res.json({ success: true, message: 'File deleted. Task has been reverted to In Progress — staff will be notified to re-upload.', reverted: true });
    }

    res.json({ success: true, message: 'Proof file deleted', reverted: false });

  } catch (err) {
    console.error('Proof delete error:', err);
    res.status(500).json({ success: false, error: 'Could not delete proof: ' + err.message });
  }
});

// ── SUBTASK PROOF UPLOAD ──────────────────────────────────
// POST /api/tasks/:taskId/subtasks/:subtaskId/proof
// D2: max 3 files per subtask
router.post('/:taskId/subtasks/:subtaskId/proof', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

    const { taskId, subtaskId } = req.params;

    // Verify subtask belongs to task
    const stCheck = await query(
      'SELECT id FROM subtasks WHERE id = $1 AND task_id = $2',
      [subtaskId, taskId]
    );
    if (!stCheck.rows.length) {
      return res.status(404).json({ success: false, error: 'Subtask not found' });
    }

    // D2: enforce 3-file limit per subtask
    const countRes = await query(
      'SELECT COUNT(*) AS cnt FROM subtask_proofs WHERE subtask_id = $1',
      [subtaskId]
    );
    if (parseInt(countRes.rows[0].cnt) >= 3) {
      return res.status(400).json({ success: false, error: 'Maximum 3 proof files allowed per subtask' });
    }

    const saved = await saveFileToDisk(req, taskId);

    await query(
      `INSERT INTO subtask_proofs
         (subtask_id, task_id, file_name, file_path, file_size, mime_type,
          original_file_name, storage_root, uuid_prefix, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        subtaskId, taskId,
        saved.fileName, saved.filePath, saved.size, saved.mimeType,
        saved.originalName, saved.storageRoot, saved.uuid,
        req.user.id
      ]
    );

    res.json({ success: true, message: 'Subtask proof uploaded successfully' });
  } catch (err) {
    console.error('Subtask proof upload error:', err);
    res.status(500).json({ success: false, error: 'Could not upload subtask proof: ' + err.message });
  }
});

// ── SUBTASK COMPLETE / UNCOMPLETE ────────────────────────
// PUT /api/tasks/:taskId/subtasks/:subtaskId/complete
// Body: { completed: true|false }
router.put('/:taskId/subtasks/:subtaskId/complete', auth, async (req, res) => {
  try {
    const isDone = req.body.completed !== false; // default true
    const result = await query(
      `UPDATE subtasks
       SET is_completed = $1,
           completed_at = CASE WHEN $1 THEN NOW() ELSE NULL END,
           completed_by = CASE WHEN $1 THEN $2 ELSE NULL END
       WHERE id = $3 AND task_id = $4
       RETURNING *`,
      [isDone, req.user.id, req.params.subtaskId, req.params.taskId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Subtask not found' });
    }
    res.json({ success: true, subtask: result.rows[0] });
  } catch (err) {
    console.error('Subtask complete error:', err);
    res.status(500).json({ success: false, error: 'Could not update subtask: ' + err.message });
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

// ── TRANSFER TASK ─────────────────────────────────────────
// PUT /api/tasks/:id/transfer
// Body: { newAssigneeId, note }
// Who: Managers only (role level >= 3)
const MANAGER_ROLES = ['Admin / Partner', 'Operations Manager', 'Relationship Manager'];
router.put('/:id/transfer', auth, async (req, res) => {
  if (!MANAGER_ROLES.includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Only managers can transfer tasks' });
  }
  const { newAssigneeId, note } = req.body;
  if (!newAssigneeId) {
    return res.status(400).json({ success: false, error: 'New assignee is required' });
  }
  try {
    // Get task and new assignee
    const taskRes = await query(
      `SELECT t.*, ua.full_name AS old_assignee_name
       FROM tasks t JOIN users ua ON t.assigned_to = ua.id
       WHERE t.id = $1`, [req.params.id]
    );
    if (!taskRes.rows.length) return res.status(404).json({ success: false, error: 'Task not found' });
    const task = taskRes.rows[0];

    if (['done', 'cancelled'].includes(task.status)) {
      return res.status(400).json({ success: false, error: `Cannot transfer a ${task.status} task` });
    }

    const newAssigneeRes = await query('SELECT id, full_name FROM users WHERE id = $1 AND is_active = TRUE', [newAssigneeId]);
    if (!newAssigneeRes.rows.length) return res.status(404).json({ success: false, error: 'New assignee not found' });
    const newAssignee = newAssigneeRes.rows[0];

    // Update assigned_to
    await query('UPDATE tasks SET assigned_to = $1, updated_at = NOW() WHERE id = $2', [newAssigneeId, req.params.id]);

    // Log to history
    await query(
      `INSERT INTO task_stage_history (task_id, action, from_status, to_status, from_stage, to_stage, action_by, note)
       VALUES ($1,'transferred',$2,$2,$3,$3,$4,$5)`,
      [req.params.id, task.status, task.stage, req.user.id,
       `Transferred from ${task.old_assignee_name} to ${newAssignee.full_name}. ${note || ''}`.trim()]
    );

    // Notify new assignee
    await query(
      `INSERT INTO notifications (recipient_id, type, title, message, task_id)
       VALUES ($1,'task_assigned',$2,$3,$4)`,
      [newAssigneeId,
       `Task assigned: ${task.title.slice(0,50)}`,
       `Task transferred to you by ${req.user.full_name}${note ? ': ' + note : ''}`,
       req.params.id]
    );

    res.json({ success: true, message: `Task transferred to ${newAssignee.full_name}` });
  } catch (err) {
    console.error('Transfer error:', err);
    res.status(500).json({ success: false, error: 'Could not transfer task: ' + err.message });
  }
});

// ── SUSPEND TASK ──────────────────────────────────────────
// PUT /api/tasks/:id/suspend
// Body: { reason }
// Who: Admin/Partner only
router.put('/:id/suspend', auth, async (req, res) => {
  if (req.user.role !== 'Admin / Partner') {
    return res.status(403).json({ success: false, error: 'Only Admin/Partner can suspend tasks' });
  }
  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    return res.status(400).json({ success: false, error: 'A reason is required to suspend a task' });
  }
  try {
    const taskRes = await query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    if (!taskRes.rows.length) return res.status(404).json({ success: false, error: 'Task not found' });
    const task = taskRes.rows[0];

    if (['done', 'cancelled', 'suspended'].includes(task.status)) {
      return res.status(400).json({ success: false, error: `Task is already ${task.status}` });
    }

    await query(
      `UPDATE tasks SET status='suspended', pre_suspend_status=$1, suspend_reason=$2, updated_at=NOW() WHERE id=$3`,
      [task.status, reason.trim(), req.params.id]
    );

    await query(
      `INSERT INTO task_stage_history (task_id, action, from_status, to_status, from_stage, to_stage, action_by, note)
       VALUES ($1,'suspended',$2,'suspended',$3,$3,$4,$5)`,
      [req.params.id, task.status, task.stage, req.user.id, reason.trim()]
    );

    // Notify assignee
    await query(
      `INSERT INTO notifications (recipient_id, type, title, message, task_id)
       VALUES ($1,'task_suspended','Task suspended',$2,$3)`,
      [task.assigned_to,
       `Your task "${task.title.slice(0,50)}" has been suspended by ${req.user.full_name}: ${reason}`,
       req.params.id]
    );

    res.json({ success: true, message: 'Task suspended' });
  } catch (err) {
    console.error('Suspend error:', err);
    res.status(500).json({ success: false, error: 'Could not suspend task: ' + err.message });
  }
});

// ── RESUME TASK ───────────────────────────────────────────
// PUT /api/tasks/:id/resume
// Who: Admin/Partner only
router.put('/:id/resume', auth, async (req, res) => {
  if (req.user.role !== 'Admin / Partner') {
    return res.status(403).json({ success: false, error: 'Only Admin/Partner can resume tasks' });
  }
  try {
    const taskRes = await query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    if (!taskRes.rows.length) return res.status(404).json({ success: false, error: 'Task not found' });
    const task = taskRes.rows[0];

    if (task.status !== 'suspended') {
      return res.status(400).json({ success: false, error: 'Task is not suspended' });
    }

    const resumeStatus = task.pre_suspend_status || 'pending';

    await query(
      `UPDATE tasks SET status=$1, pre_suspend_status=NULL, suspend_reason=NULL, updated_at=NOW() WHERE id=$2`,
      [resumeStatus, req.params.id]
    );

    await query(
      `INSERT INTO task_stage_history (task_id, action, from_status, to_status, from_stage, to_stage, action_by, note)
       VALUES ($1,'resumed','suspended',$2,$3,$3,$4,'Task resumed')`,
      [req.params.id, resumeStatus, task.stage, req.user.id]
    );

    await query(
      `INSERT INTO notifications (recipient_id, type, title, message, task_id)
       VALUES ($1,'task_assigned','Task resumed',$2,$3)`,
      [task.assigned_to,
       `Your task "${task.title.slice(0,50)}" has been resumed by ${req.user.full_name}`,
       req.params.id]
    );

    res.json({ success: true, message: 'Task resumed', resumeStatus });
  } catch (err) {
    console.error('Resume error:', err);
    res.status(500).json({ success: false, error: 'Could not resume task: ' + err.message });
  }
});

// ── CANCEL TASK ───────────────────────────────────────────
// PUT /api/tasks/:id/cancel
// Body: { reason }
// Who: Admin/Partner only
router.put('/:id/cancel', auth, async (req, res) => {
  if (req.user.role !== 'Admin / Partner') {
    return res.status(403).json({ success: false, error: 'Only Admin/Partner can cancel tasks' });
  }
  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    return res.status(400).json({ success: false, error: 'A reason is required to cancel a task' });
  }
  try {
    const taskRes = await query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    if (!taskRes.rows.length) return res.status(404).json({ success: false, error: 'Task not found' });
    const task = taskRes.rows[0];

    if (task.status === 'cancelled') {
      return res.status(400).json({ success: false, error: 'Task is already cancelled' });
    }

    await query(
      `UPDATE tasks SET status='cancelled', cancel_reason=$1, updated_at=NOW() WHERE id=$2`,
      [reason.trim(), req.params.id]
    );

    await query(
      `INSERT INTO task_stage_history (task_id, action, from_status, to_status, from_stage, to_stage, action_by, note)
       VALUES ($1,'cancelled',$2,'cancelled',$3,$3,$4,$5)`,
      [req.params.id, task.status, task.stage, req.user.id, reason.trim()]
    );

    // Notify assignee
    await query(
      `INSERT INTO notifications (recipient_id, type, title, message, task_id)
       VALUES ($1,'task_cancelled','Task cancelled',$2,$3)`,
      [task.assigned_to,
       `Task "${task.title.slice(0,50)}" has been cancelled by ${req.user.full_name}: ${reason}`,
       req.params.id]
    );

    res.json({ success: true, message: 'Task cancelled' });
  } catch (err) {
    console.error('Cancel error:', err);
    res.status(500).json({ success: false, error: 'Could not cancel task: ' + err.message });
  }
});

// ── REQUEST SUSPENSION (staff) ────────────────────────────
// PUT /api/tasks/:id/request-suspend
// Body: { reason }
// Who: Any active user — creates a notification to their manager
router.put('/:id/request-suspend', auth, async (req, res) => {
  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    return res.status(400).json({ success: false, error: 'Please provide a reason for the suspension request' });
  }
  try {
    const taskRes = await query(
      `SELECT t.*, ua.full_name AS assignee_name, m.id AS manager_id, m.full_name AS manager_name
       FROM tasks t
       JOIN users ua ON t.assigned_to = ua.id
       LEFT JOIN user_reporting_map urm ON urm.user_id = t.assigned_to AND urm.priority = 'primary'
       LEFT JOIN users m ON urm.manager_id = m.id
       WHERE t.id = $1`, [req.params.id]
    );
    if (!taskRes.rows.length) return res.status(404).json({ success: false, error: 'Task not found' });
    const task = taskRes.rows[0];

    if (['done', 'cancelled', 'suspended'].includes(task.status)) {
      return res.status(400).json({ success: false, error: `Cannot request suspension for a ${task.status} task` });
    }

    // Log request in history
    await query(
      `INSERT INTO task_stage_history (task_id, action, from_status, to_status, from_stage, to_stage, action_by, note)
       VALUES ($1,'suspend_requested',$2,$2,$3,$3,$4,$5)`,
      [req.params.id, task.status, task.stage, req.user.id, `Suspension requested: ${reason.trim()}`]
    );

    // Notify manager (or all admins if no manager)
    const recipients = [];
    if (task.manager_id) {
      recipients.push(task.manager_id);
    } else {
      const admins = await query(`SELECT id FROM users WHERE role='Admin / Partner' AND is_active=TRUE`);
      admins.rows.forEach(a => recipients.push(a.id));
    }

    for (const rid of recipients) {
      await query(
        `INSERT INTO notifications (recipient_id, type, title, message, task_id)
         VALUES ($1,'suspend_requested',$2,$3,$4)`,
        [rid,
         `Suspension requested: ${task.title.slice(0,50)}`,
         `${req.user.full_name} has requested suspension of this task: ${reason}`,
         req.params.id]
      );
    }

    res.json({ success: true, message: 'Suspension request sent to your manager' });
  } catch (err) {
    console.error('Request suspend error:', err);
    res.status(500).json({ success: false, error: 'Could not send request: ' + err.message });
  }
});

module.exports = router;
