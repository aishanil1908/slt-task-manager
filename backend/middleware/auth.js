// middleware/auth.js
// Verifies JWT token on every protected route
// Add this middleware to any route that requires login

const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
require('dotenv').config();

const auth = async (req, res, next) => {
  try {
    // Get token from Authorization header
    // Expected format: "Bearer eyJhbGci..."
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No token provided. Please login first.'
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify the token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token. Please login again.'
      });
    }

    // Fetch user from database to confirm they still exist and are active
    const result = await query(
      'SELECT id, username, full_name, email, role, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0 || !result.rows[0].is_active) {
      return res.status(401).json({
        success: false,
        error: 'User account not found or deactivated.'
      });
    }

    // Attach user to request — available in all route handlers as req.user
    req.user = result.rows[0];
    next();

  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ success: false, error: 'Authentication error' });
  }
};

module.exports = auth;
