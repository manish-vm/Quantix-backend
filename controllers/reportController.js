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

    // Chart data: scans by date (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const scansByDate = await ScanLog.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
          matchCount: { $sum: { $cond: [{ $eq: ['$status', 'match'] }, 1, 0] } },
          mismatchCount: { $sum: { $cond: [{ $eq: ['$status', 'mismatch'] }, 1, 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Fill missing dates
    const dateMap = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      dateMap[key] = { date: key, count: 0, matchCount: 0, mismatchCount: 0 };
    }
    scansByDate.forEach(item => {
      if (dateMap[item._id]) {
        dateMap[item._id] = {
          date: item._id,
          count: item.count,
          matchCount: item.matchCount,
          mismatchCount: item.mismatchCount
        };
      }
    });
    const scansByDateChart = Object.values(dateMap).reverse();

    // Chart data: top 5 scanned products
    const topProducts = await ScanLog.aggregate([
      {
        $group: {
          _id: '$partNo',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    // Chart data: scans by hour today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const scansByHour = await ScanLog.aggregate([
      { $match: { createdAt: { $gte: today } } },
      {
        $group: {
          _id: { $hour: '$createdAt' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    const hourMap = {};
    for (let i = 0; i < 24; i++) {
      hourMap[i] = { hour: `${i}:00`, count: 0 };
    }
    scansByHour.forEach(item => {
      hourMap[item._id] = { hour: `${item._id}:00`, count: item.count };
    });
    const scansByHourChart = Object.values(hourMap);

    res.json({
      totalProducts,
      totalDemoData,
      totalScans,
      matchScans,
      mismatchScans,
      recentScans,
      scansByDateChart,
      topProducts,
      scansByHourChart
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

      // Aggregate scan data for this product
      const scanAggregation = await ScanLog.aggregate([
        { $match: { partNo: product.partNo } },
        {
          $group: {
            _id: '$partNo',
            receivedWeight: { $sum: '$measuredWeight' },
            validatedProductCount: { $sum: '$expectedCount' },
            totalScans: { $sum: 1 }
          }
        }
      ]);

      const scanData = scanAggregation.length > 0 ? scanAggregation[0] : { receivedWeight: 0, validatedProductCount: 0, totalScans: 0 };
      const unitWeight = demo ? demo.unitWeight : null;
      const toleranceWeight = demo ? (demo.toleranceWeight ?? 0) : null;
      const overallWeight = demo ? demo.overallWeight : null;
      const totalCount = demo ? demo.totalCount : null;
      const receivedWeight = scanData.receivedWeight;
      const totalScans = scanData.totalScans;

      // Calculate derived fields
      let short = null;
      let excess = null;
      let basedOnReceivedWeightProductCount = null;
      let productDelay = null;
      let excessProduct = null;

      if (unitWeight !== null && overallWeight !== null && totalCount !== null) {
        basedOnReceivedWeightProductCount = scanData.validatedProductCount;

        if (receivedWeight < overallWeight) {
          short = overallWeight - receivedWeight;
        } else if (receivedWeight > overallWeight) {
          excess = receivedWeight - overallWeight;
        }

        if (basedOnReceivedWeightProductCount < totalCount) {
          productDelay = totalCount - basedOnReceivedWeightProductCount;
        } else if (basedOnReceivedWeightProductCount > totalCount) {
          excessProduct = basedOnReceivedWeightProductCount - totalCount;
        }
      }

      report.push({
        partNo: product.partNo,
        description: product.description,
        unitWeight: unitWeight,
        toleranceWeight: toleranceWeight,
        overallWeight: overallWeight,
        receivedWeight: receivedWeight,
        short: short,
        excess: excess,
        totalIdealProductCount: totalCount,
        basedOnReceivedWeightProductCount: basedOnReceivedWeightProductCount,
        productDelay: productDelay,
        excessProduct: excessProduct,
        remainingCount: demo ? demo.remainingCount : null,
        totalScans: totalScans
      });
    }

    res.json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

