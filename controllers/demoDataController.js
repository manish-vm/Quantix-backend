const DemoData = require('../models/DemoData');
const Product = require('../models/Product');

exports.createDemoData = async (req, res) => {
  try {
    const { partNo, partDescription, totalCount } = req.body;
    const parsedUnitWeight = Number(req.body.unitWeight ?? req.body.overallWeight);
    const parsedTotalCount = Number(totalCount);
    const parsedToleranceWeight = Number(req.body.toleranceWeight ?? 0);

    let product = await Product.findOne({ partNo: partNo.toUpperCase() });
    if (!product) {
      // Create product if not exists
      product = new Product({
        partNo: partNo.toUpperCase(),
        description: partDescription || 'Unknown',
        createdBy: req.user.userId
      });
      await product.save();
    }

    if (!Number.isFinite(parsedUnitWeight) || parsedUnitWeight <= 0) {
      return res.status(400).json({ message: 'Unit weight must be greater than 0' });
    }

    if (!Number.isFinite(parsedTotalCount) || parsedTotalCount <= 0) {
      return res.status(400).json({ message: 'Total count must be greater than 0' });
    }

    if (!Number.isFinite(parsedToleranceWeight) || parsedToleranceWeight < 0) {
      return res.status(400).json({ message: 'Tolerance weight must be 0 or greater' });
    }

    const overallWeight = parsedUnitWeight * parsedTotalCount;

    const demoData = await DemoData.findOneAndUpdate(
      { partNo: partNo.toUpperCase() },
      {
        partNo: partNo.toUpperCase(),
        partDescription: product.description,
        overallWeight,
        totalCount: parsedTotalCount,
        unitWeight: parsedUnitWeight,
        toleranceWeight: parsedToleranceWeight,
        remainingCount: parsedTotalCount,
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
      return res.status(404).json({
        message: 'Demo data not found. Please create baseline first.',
        requiresDemoData: true
      });
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

