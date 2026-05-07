const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'quantix_secret_key_2024';

const verifyToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

const requireRole = (roles) => {
  return (req, res, next) => {
    if (Array.isArray(roles)) {
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({ message: `Access denied. One of ${roles.join(', ')} roles required.` });
      }
    } else {
      if (req.user.role !== roles) {
        return res.status(403).json({ message: `Access denied. ${roles} role required.` });
      }
    }
    next();
  };
};

module.exports = { verifyToken, requireRole, JWT_SECRET };

