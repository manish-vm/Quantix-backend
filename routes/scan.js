const express = require('express');
const router = express.Router();
const scanController = require('../controllers/scanController');
const { verifyToken } = require('../middleware/auth');

router.post('/', verifyToken, scanController.performScan);
router.get('/logs', verifyToken, scanController.getScanLogs);

module.exports = router;

