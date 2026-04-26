const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { verifyToken, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.get('/', verifyToken, productController.getAllProducts);
router.post('/', verifyToken, requireRole('admin'), productController.createProduct);
router.put('/:id', verifyToken, requireRole('admin'), productController.updateProduct);
router.delete('/:id', verifyToken, requireRole('admin'), productController.deleteProduct);
router.post('/upload', verifyToken, requireRole('admin'), upload.single('file'), productController.uploadExcel);

module.exports = router;

