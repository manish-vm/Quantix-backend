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
    const { partNo, dateFrom, dateTo } = req.query;
    let filter = {};

    if (partNo) filter.partNo = new RegExp(partNo, 'i');
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo + 'T23:59:59.999Z');
    }

    // Get unique partNos from filtered scans
    const partNos = await ScanLog.distinct('partNo', filter);

    const results = [];
    for (const p of partNos) {
      const pFilter = { ...filter, partNo: p };

      // Aggregate summary for this partNo
      const summary = await ScanLog.aggregate([
        { $match: pFilter },
        {
          $group: {
            _id: '$partNo',
            receivedWeight: { $sum: '$measuredWeight' },
            totalScans: { $sum: 1 }
          }
        }
      ]);
      if (summary.length === 0) continue;
      const agg = summary[0];

      // Latest scan
      const latest = await ScanLog.findOne(pFilter)
        .populate('scannedBy', 'name')
        .sort({ createdAt: -1 });

      if (!latest) continue;

      // DemoData and Product
      const demo = await DemoData.findOne({ partNo: p });
      const prod = await Product.findOne({ partNo: p });

      // Compute derived fields (same as reportController)
      const unitWeight = demo ? demo.unitWeight : null;
      const overallWeight = demo ? demo.overallWeight : null;
      const totalIdealProductCount = demo ? demo.totalCount : null;
      const basedOnReceivedWeightProductCount = unitWeight ? agg.receivedWeight / unitWeight : null;

      let underweight = null;
      let overweight = null;
      let productDelay = null;
      let excessProduct = null;

      if (overallWeight !== null && agg.receivedWeight !== null) {
        if (agg.receivedWeight < overallWeight) {
          underweight = overallWeight - agg.receivedWeight;
        } else if (agg.receivedWeight > overallWeight) {
          overweight = agg.receivedWeight - overallWeight;
        }
      }

      if (totalIdealProductCount !== null && basedOnReceivedWeightProductCount !== null) {
        if (basedOnReceivedWeightProductCount < totalIdealProductCount) {
          productDelay = totalIdealProductCount - basedOnReceivedWeightProductCount;
        } else if (basedOnReceivedWeightProductCount > totalIdealProductCount) {
          excessProduct = basedOnReceivedWeightProductCount - totalIdealProductCount;
        }
      }

      results.push({
        partNo: p,
        description: prod ? prod.description : latest.partDescription,
        unitWeight,
        overallWeight,
        receivedWeight: agg.receivedWeight,
        underweight,
        overweight,
        totalIdealProductCount,
        basedOnReceivedWeightProductCount,
        productDelay,
        excessProduct,
        // From latest scan
        measuredWeight: latest.measuredWeight,
        expectedWeight: latest.expectedWeight,
        status: latest.status,
        scannedByName: latest.scannedByName || (latest.scannedBy ? latest.scannedBy.name : null),
        createdAt: latest.createdAt
      });
    }

    // Sort by latest createdAt desc
    results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json(results);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getUserRecentScanLogs = async (req, res) => {
  try {
    const userId = req.user.userId;
    const logs = await ScanLog.find({ scannedBy: userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getUserScanSummary = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Aggregate total weight and total products scanned
    const summary = await ScanLog.aggregate([
      { $match: { scannedBy: userId } },
      {
        $group: {
          _id: null,
          totalWeightScanned: { $sum: '$measuredWeight' },
          totalProductsScanned: { $sum: '$expectedCount' },
          totalScans: { $sum: 1 }
        }
      }
    ]);

    const agg = summary[0] || { totalWeightScanned: 0, totalProductsScanned: 0, totalScans: 0 };

    // For remaining products, sum all remainingCount from DemoData
    const totalRemaining = await DemoData.aggregate([
      {
        $group: {
          _id: null,
          totalRemaining: { $sum: '$remainingCount' }
        }
      }
    ]);

    const totalRemainingProducts = totalRemaining[0]?.totalRemaining || 0;

    res.json({
      totalWeightScanned: agg.totalWeightScanned,
      totalProductsScanned: agg.totalProductsScanned,
      totalScans: agg.totalScans,
      totalRemainingProducts
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

