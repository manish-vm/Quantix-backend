const ScanLog = require('../models/ScanLog');
const DemoData = require('../models/DemoData');
const Product = require('../models/Product');

exports.getDashboardStats = async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments();
    const totalDemoData = await DemoData.countDocuments();
    const totalScans = await ScanLog.countDocuments();
    const matchScans = await ScanLog.countDocuments({ status: 'match' });
    const mismatchScans = await ScanLog.countDocuments({ status: 'mismatch' });

    const recentScans = await ScanLog.find()
      .populate('scannedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      totalProducts,
      totalDemoData,
      totalScans,
      matchScans,
      mismatchScans,
      recentScans
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getProductReport = async (req, res) => {
  try {
    const products = await Product.find().lean();
    const report = [];

    for (const product of products) {
      const demo = await DemoData.findOne({ partNo: product.partNo }).lean();
      const scanCount = await ScanLog.countDocuments({ partNo: product.partNo });

      report.push({
        partNo: product.partNo,
        description: product.description,
        unitWeight: demo ? demo.unitWeight : null,
        overallWeight: demo ? demo.overallWeight : null,
        totalCount: demo ? demo.totalCount : null,
        remainingCount: demo ? demo.remainingCount : null,
        totalScans: scanCount
      });
    }

    res.json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

