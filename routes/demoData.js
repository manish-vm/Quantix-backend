const express = require('express');
const router = express.Router();
const demoDataController = require('../controllers/demoDataController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.post('/', verifyToken, requireRole(['admin', 'employee', 'vendor']), demoDataController.createDemoData);
router.get('/', verifyToken, demoDataController.getAllDemoData);
router.get('/:partNo', verifyToken, demoDataController.getDemoData);

module.exports = router;

