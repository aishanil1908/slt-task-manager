// middleware/roleCheck.js
// Use after auth middleware to restrict routes by role
// Usage: router.post('/users', auth, requireRole(['Admin / Partner', 'Operations Manager']), handler)

const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Required role: ${allowedRoles.join(' or ')}. Your role: ${req.user.role}`
      });
    }

    next();
  };
};

// Shorthand helpers
const isAdmin = requireRole(['Admin / Partner']);
const isManager = requireRole(['Admin / Partner', 'Operations Manager']);
const isManagerOrRM = requireRole(['Admin / Partner', 'Operations Manager', 'Relationship Manager']);

module.exports = { requireRole, isAdmin, isManager, isManagerOrRM };
