const Product = require('../models/Product');
const { parseExcel } = require('../utils/excelParser');
const fs = require('fs');

exports.getAllProducts = async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createProduct = async (req, res) => {
  try {
    const { partNo, description } = req.body;

    const existing = await Product.findOne({ partNo: partNo.toUpperCase() });
    if (existing) {
      return res.status(400).json({ message: 'Part No already exists' });
    }

    const product = new Product({ partNo, description });
    await product.save();
    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { description } = req.body;

    const product = await Product.findByIdAndUpdate(id, { description }, { new: true });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    await Product.findByIdAndDelete(id);
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.uploadExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const products = parseExcel(req.file.path);
    fs.unlinkSync(req.file.path);

    if (products.length === 0) {
      return res.status(400).json({ message: 'No valid data found in Excel' });
    }

    let inserted = 0;
    let updated = 0;

    for (const item of products) {
      const existing = await Product.findOne({ partNo: item.partNo });
      if (existing) {
        await Product.findByIdAndUpdate(existing._id, { description: item.description });
        updated++;
      } else {
        await Product.create(item);
        inserted++;
      }
    }

    res.json({ message: `Upload complete. Inserted: ${inserted}, Updated: ${updated}` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

