const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.get('/dashboard', verifyToken, reportController.getDashboardStats);
router.get('/products', verifyToken, requireRole('admin'), reportController.getProductReport);

module.exports = router;

