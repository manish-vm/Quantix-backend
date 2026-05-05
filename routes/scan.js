const express = require('express');
const router = express.Router();
const scanController = require('../controllers/scanController');
const { verifyToken } = require('../middleware/auth');

router.post('/', verifyToken, scanController.performScan);
router.get('/logs', verifyToken, scanController.getScanLogs);
router.get('/summary', verifyToken, scanController.getUserScanSummary);
router.get('/recent', verifyToken, scanController.getUserRecentScanLogs);

module.exports = router;

