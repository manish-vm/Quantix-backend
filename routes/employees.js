const express = require('express');
const { verifyToken, requireRole } = require('../middleware/auth');
const employeeController = require('../controllers/employeeController');

const router = express.Router();

router.get('/', verifyToken, requireRole('admin'), employeeController.getAllEmployees);
router.post('/', verifyToken, requireRole('admin'), employeeController.createEmployee);
router.put('/:id', verifyToken, requireRole('admin'), employeeController.updateEmployee);
router.delete('/:id', verifyToken, requireRole('admin'), employeeController.deleteEmployee);

module.exports = router;

