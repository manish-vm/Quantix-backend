const Product = require('../models/Product');
const DemoData = require('../models/DemoData');
const { parseExcel } = require('../utils/excelParser');
const fs = require('fs');

exports.getAllProducts = async (req, res) => {
  try {
    const { page, limit, partNo, description } = req.query;

    // Build filter object
    const filter = {};
    if (partNo) {
      filter.partNo = { $regex: partNo, $options: 'i' };
    }
    if (description) {
      filter.description = { $regex: description, $options: 'i' };
    }

    // If no pagination params, return all products for backward compatibility
    if (!page && !limit) {
      const products = await Product.find(filter).sort({ createdAt: -1 });
      return res.json(products);
    }

    // Parse pagination params with defaults
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const skip = (pageNum - 1) * limitNum;

    // Get paginated products and total count
    const [products, totalCount] = await Promise.all([
      Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Product.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      products,
      totalCount,
      totalPages,
      currentPage: pageNum
    });
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

    // Update associated demo data description
    await DemoData.updateMany(
      { partNo: product.partNo },
      { partDescription: description }
    );

    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findByIdAndDelete(id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Delete associated demo data
    await DemoData.deleteMany({ partNo: product.partNo });

    res.json({ message: 'Product deleted successfully', deletedProduct: product });
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

