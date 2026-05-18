const express = require('express');
const router = express.Router();
const scanController = require('../controllers/scanController');
const { verifyToken } = require('../middleware/auth');

router.post('/', verifyToken, scanController.performScan);
router.get('/logs', verifyToken, scanController.getScanLogs);
router.get('/summary', verifyToken, scanController.getUserScanSummary);
router.get('/recent', verifyToken, scanController.getUserRecentScanLogs);
router.get('/user-history', verifyToken, scanController.getUserScanHistory);
router.get(
  '/vendor-submissions',
  verifyToken,
  scanController.getVendorSubmissionsForPart
);
router.get('/history', verifyToken, scanController.getScanHistory);

module.exports = router;

