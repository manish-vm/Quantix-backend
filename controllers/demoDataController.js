const DemoData = require('../models/DemoData');
const Product = require('../models/Product');

exports.createDemoData = async (req, res) => {
  try {
    const { partNo, overallWeight, totalCount } = req.body;

    const product = await Product.findOne({ partNo: partNo.toUpperCase() });
    if (!product) {
      return res.status(404).json({ message: 'Part No not found in product master' });
    }

    if (totalCount <= 0) {
      return res.status(400).json({ message: 'Total count must be greater than 0' });
    }

    const unitWeight = overallWeight / totalCount;

    const demoData = await DemoData.findOneAndUpdate(
      { partNo: partNo.toUpperCase() },
      {
        partNo: partNo.toUpperCase(),
        partDescription: product.description,
        overallWeight,
        totalCount,
        unitWeight,
        remainingCount: totalCount,
        createdBy: req.user.userId
      },
      { upsert: true, new: true }
    );

    res.status(201).json(demoData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getDemoData = async (req, res) => {
  try {
    const { partNo } = req.params;
    const demoData = await DemoData.findOne({ partNo: partNo.toUpperCase() });

    if (!demoData) {
      return res.status(404).json({ message: 'Demo data not found. Please create baseline first.' });
    }

    res.json(demoData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAllDemoData = async (req, res) => {
  try {
    const demoData = await DemoData.find().populate('createdBy', 'name').sort({ createdAt: -1 });
    res.json(demoData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

