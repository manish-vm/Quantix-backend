const DemoData = require('../models/DemoData');
const ScanLog = require('../models/ScanLog');
const Product = require('../models/Product');

exports.performScan = async (req, res) => {
  try {
    const { partNo, measuredWeight } = req.body;
    const upperPartNo = partNo.toUpperCase();

    const product = await Product.findOne({ partNo: upperPartNo });
    if (!product) {
      return res.status(404).json({ message: 'Part No not found' });
    }

    const demoData = await DemoData.findOne({ partNo: upperPartNo });
    if (!demoData) {
      return res.status(404).json({
        message: 'Demo data not found. Please create baseline data first.',
        requiresDemoData: true
      });
    }

    if (demoData.remainingCount <= 0) {
      return res.status(400).json({ message: 'All items have been scanned. Count is zero.' });
    }

    const expectedCount = measuredWeight / demoData.unitWeight;
    const expectedWeight = demoData.unitWeight * Math.round(expectedCount);
    const tolerance = demoData.unitWeight * 0.005;
    const diff = Math.abs(measuredWeight - expectedWeight);
    const status = diff <= tolerance ? 'match' : 'mismatch';

    demoData.remainingCount = Math.max(0, demoData.remainingCount - Math.round(expectedCount));
    await demoData.save();

    const scanLog = new ScanLog({
      partNo: upperPartNo,
      partDescription: product.description,
      measuredWeight,
      expectedWeight,
      unitWeight: demoData.unitWeight,
      expectedCount: Math.round(expectedCount),
      status,
      scannedBy: req.user.userId,
      scannedByName: req.user.name
    });
    await scanLog.save();

    res.json({
      status,
      partNo: upperPartNo,
      partDescription: product.description,
      measuredWeight,
      expectedWeight,
      unitWeight: demoData.unitWeight,
      expectedCount: Math.round(expectedCount),
      remainingCount: demoData.remainingCount,
      message: status === 'match' ? 'Weight matches expected value' : 'Weight mismatch detected'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getScanLogs = async (req, res) => {
  try {
    const { partNo, dateFrom, dateTo, scannedBy } = req.query;
    const filter = {};

    if (partNo) filter.partNo = { $regex: partNo, $options: 'i' };
    if (scannedBy) filter.scannedBy = scannedBy;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }

    const logs = await ScanLog.find(filter)
      .populate('scannedBy', 'name')
      .sort({ createdAt: -1 });

    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

