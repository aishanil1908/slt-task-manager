// server.js
// Second Level Think — Unified Task Management System
// Main Express server entry point

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const path       = require('path');

// Route files
const authRoutes      = require('./routes/auth');
const configRoutes    = require('./routes/config');
const dashboardRoutes = require('./routes/dashboard');
const tasksRoutes     = require('./routes/tasks');
const usersRoutes     = require('./routes/users');
const misRoutes       = require('./routes/mis');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── MIDDLEWARE ────────────────────────────────────────────

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' } // allow file serving
}));

// CORS — allow frontend (HTML file opened directly in browser)
app.use(cors({
  origin: '*',  // In production: change to your office network IP
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON request bodies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files (proof images, PDFs)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Request logger (development only)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString().slice(11,19)} ${req.method} ${req.path}`);
    next();
  });
}

// ── ROUTES ────────────────────────────────────────────────
app.use('/api',           authRoutes);      // /api/login, /api/logout, /api/health, /api/profile
app.use('/api',           configRoutes);    // /api/verticals, /api/categories/:code, /api/natures/:code, /api/staff
app.use('/api/dashboard', dashboardRoutes); // /api/dashboard/summary, /api/dashboard/tasks/:status
app.use('/api/tasks',     tasksRoutes);     // /api/tasks (POST, GET/:id, PUT/:id/stage, POST/:id/proof)
app.use('/api/users',     usersRoutes);     // /api/users (GET, POST, GET/:id)
app.use('/api/mis',       misRoutes);       // /api/mis/counts, /api/mis/tasks/:categoryCode
const { serveFile } = require('./middleware/fileUpload');
app.get('/api/files/:proofId', auth, serveFile);

// ── CATCH-ALL for unknown routes ──────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.path}`
  });
});

// ── GLOBAL ERROR HANDLER ──────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// ── START SERVER ──────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║   Second Level Think — Task Management API    ║');
  console.log('╠═══════════════════════════════════════════════╣');
  console.log(`║   Server running on http://localhost:${PORT}     ║`);
  console.log(`║   Mode: ${process.env.NODE_ENV || 'development'}                         ║`);
  console.log(`║   Pilot mode: ${process.env.PILOT_MODE === 'true' ? 'ON (no password)' : 'OFF (password required)'}            ║`);
  console.log('╚═══════════════════════════════════════════════╝');
  console.log('');
});

module.exports = app;
