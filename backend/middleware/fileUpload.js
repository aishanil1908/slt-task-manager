// ============================================================
// SLT Task Management Platform
// fileUpload.js — File storage middleware
// Place in: backend/middleware/fileUpload.js
//
// Supports: local drive, network folder, NAS (all via fs module)
// Reserved: cloud storage (not yet implemented)
//
// Folder structure:
//   {storageRoot}/{username}/{taskId}_{YYYYMMDD}/{uuid}_{filename}
// ============================================================

const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const { query } = require('../config/db');

// ── ALLOWED FILE TYPES ────────────────────────────────────
const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.pdf', '.xlsx', '.xls', '.doc', '.docx'];
const ALLOWED_MIME = [
  'image/jpeg', 'image/png', 'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

// ── GET ACTIVE STORAGE ROOT FROM DB ──────────────────────
// Reads FILE_STORAGE_TYPE to determine which path is active.
// Falls back to local path, then .env, then ./uploads.
async function getStorageRoot() {
  try {
    const result = await query(
      `SELECT key, value FROM system_config WHERE key LIKE 'FILE_STORAGE%' ORDER BY key`
    );

    if (result.rows.length === 0) {
      return process.env.FILE_UPLOAD_PATH || './uploads';
    }

    // Build config map from rows
    const config = {};
    result.rows.forEach(r => { config[r.key] = r.value; });

    const type = (config['FILE_STORAGE_TYPE'] || 'local').toLowerCase();

    // Cloud is reserved — not implemented yet
    if (type === 'cloud') {
      console.warn('FILE_STORAGE_TYPE=cloud is not yet implemented. Falling back to local.');
    }

    const pathMap = {
      local:   config['FILE_STORAGE_LOCAL'],
      network: config['FILE_STORAGE_NETWORK'],
      nas:     config['FILE_STORAGE_NAS'],
    };

    const resolved = pathMap[type];

    if (!resolved || resolved.trim() === '') {
      console.warn(`FILE_STORAGE_${type.toUpperCase()} is empty. Falling back to local path.`);
      return config['FILE_STORAGE_LOCAL'] || process.env.FILE_UPLOAD_PATH || './uploads';
    }

    return resolved;

  } catch (err) {
    console.error('Could not read storage config from system_config:', err.message);
    return process.env.FILE_UPLOAD_PATH || './uploads';
  }
}

// ── BUILD FOLDER PATH ─────────────────────────────────────
// {storageRoot}/{username}/{taskId}_{YYYYMMDD}/
function buildFolderPath(storageRoot, username, taskId) {
  const today   = new Date();
  const yyyy    = today.getFullYear();
  const mm      = String(today.getMonth() + 1).padStart(2, '0');
  const dd      = String(today.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;

  // Sanitise username — remove chars invalid in folder names
  const safeUsername = username.replace(/[^a-zA-Z0-9_\-]/g, '_');

  return path.join(storageRoot, safeUsername, `${taskId}_${dateStr}`);
}

// ── MULTER — MEMORY STORAGE ───────────────────────────────
// Files held in memory buffer first so we can do async DB
// lookup for storage root before writing to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype;
    if (ALLOWED_EXT.includes(ext) && ALLOWED_MIME.includes(mime)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${ext}. Allowed types: ${ALLOWED_EXT.join(', ')}`));
    }
  }
});

// ── SAVE FILE TO DISK ─────────────────────────────────────
// Called after multer middleware in the route handler.
// Returns all metadata needed for DB insert.
async function saveFileToDisk(req, taskId) {
  if (!req.file) throw new Error('No file in request');

  const storageRoot  = await getStorageRoot();
  const username     = req.user.username;
  const folderPath   = buildFolderPath(storageRoot, username, taskId);
  const uuid         = crypto.randomUUID();
  const ext          = path.extname(req.file.originalname).toLowerCase();
  const safeOriginal = req.file.originalname.replace(/[^a-zA-Z0-9._\-]/g, '_');
  const fileName     = `${uuid}_${safeOriginal}`;
  const fullPath     = path.join(folderPath, fileName);

  // Create folder structure if it doesn't exist
  // Works for local, network share, and NAS paths equally
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  // Write buffer to disk
  fs.writeFileSync(fullPath, req.file.buffer);

  return {
    storageRoot,              // snapshot — stored in DB so path changes don't break old files
    folderPath,
    fileName,
    filePath:     fullPath,
    uuid,
    originalName: req.file.originalname,
    size:         req.file.size,
    mimeType:     req.file.mimetype
  };
}

// ── SECURE FILE SERVE ─────────────────────────────────────
// GET /api/files/:proofId
// JWT validated by auth middleware before this runs.
// Files are NEVER accessible via direct path or URL.
async function serveFile(req, res) {
  try {
    const result = await query(
      `SELECT tp.*, t.assigned_to, t.created_by
       FROM task_proofs tp
       JOIN tasks t ON t.id = tp.task_id
       WHERE tp.id = $1`,
      [req.params.proofId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'File record not found' });
    }

    const proof = result.rows[0];

    // Access control — manager, assigned user, or task creator only
    const managerRoles = ['Admin / Partner', 'Operations Manager', 'Relationship Manager'];
    const isManager    = managerRoles.includes(req.user.role);
    const isAssigned   = req.user.id === proof.assigned_to;
    const isCreator    = req.user.id === proof.created_by;

    if (!isManager && !isAssigned && !isCreator) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Check file physically exists on storage
    if (!fs.existsSync(proof.file_path)) {
      return res.status(404).json({
        success: false,
        error: 'File not found on storage. Storage may have changed. Contact admin.'
      });
    }

    // Stream file — never expose file_path in response
    const downloadName = proof.original_file_name || proof.file_name;
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Content-Type', proof.mime_type || 'application/octet-stream');

    const stream = fs.createReadStream(proof.file_path);
    stream.on('error', () => {
      res.status(500).json({ success: false, error: 'Error reading file from storage' });
    });
    stream.pipe(res);

  } catch (err) {
    console.error('File serve error:', err);
    res.status(500).json({ success: false, error: 'Could not serve file: ' + err.message });
  }
}

module.exports = { upload, saveFileToDisk, serveFile };


// ============================================================
// INTEGRATION GUIDE
// ============================================================
//
// ── tasks.js ─────────────────────────────────────────────
//
// REMOVE at top of tasks.js:
//   const multer = require('multer');
//   const storage = multer.diskStorage({...});
//   const upload = multer({...});
//
// ADD at top of tasks.js:
//   const { upload, saveFileToDisk } = require('../middleware/fileUpload');
//
// REPLACE proof upload route body:
//
//   router.post('/:id/proof', auth, upload.single('file'), async (req, res) => {
//     try {
//       if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
//
//       const stage = parseInt(req.body.stage) || 2;
//       if (![2, 4].includes(stage)) return res.status(400).json({ success: false, error: 'Stage must be 2 or 4' });
//
//       const saved = await saveFileToDisk(req, req.params.id);
//
//       await query(
//         `INSERT INTO task_proofs
//            (task_id, stage, file_name, file_path, file_size, mime_type,
//             original_file_name, storage_root, uuid_prefix, uploaded_by)
//          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
//         [
//           req.params.id, stage,
//           saved.fileName, saved.filePath, saved.size, saved.mimeType,
//           saved.originalName, saved.storageRoot, saved.uuid,
//           req.user.id
//         ]
//       );
//
//       const flag = stage === 2 ? 'proof_uploaded' : 's4_doc_uploaded';
//       await query(`UPDATE tasks SET ${flag} = TRUE, updated_at = NOW() WHERE id = $1`, [req.params.id]);
//
//       res.json({
//         success: true,
//         message: `Stage ${stage} proof uploaded successfully`,
//         file: { name: saved.originalName, size: saved.size }
//         // NEVER return saved.filePath — security risk
//       });
//
//     } catch (err) {
//       console.error('Proof upload error:', err);
//       res.status(500).json({ success: false, error: 'Upload failed: ' + err.message });
//     }
//   });
//
// ── server.js ─────────────────────────────────────────────
//
// ADD after other route registrations:
//   const { serveFile } = require('./middleware/fileUpload');
//   app.get('/api/files/:proofId', auth, serveFile);
//
// ── Storage type switching (admin changes in system_config) ─
//
//   FILE_STORAGE_TYPE = local    → uses FILE_STORAGE_LOCAL path
//   FILE_STORAGE_TYPE = network  → uses FILE_STORAGE_NETWORK path
//   FILE_STORAGE_TYPE = nas      → uses FILE_STORAGE_NAS path
//   FILE_STORAGE_TYPE = cloud    → reserved, falls back to local until implemented
//
// ============================================================
