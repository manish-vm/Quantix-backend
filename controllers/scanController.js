const mongoose = require('mongoose');
const { ObjectId } = mongoose;
const DemoData = require('../models/DemoData');
const ScanLog = require('../models/ScanLog');
const Product = require('../models/Product');
const User = require('../models/User');

const isVendorUser = (user) => {
  if (!user) return false;
  if (user.employeeType === 'vendor') return true;

  return Boolean(
    user.email
    && user.employeeId
    && !user.department
    && !user.jobTitle
    && !user.manager
  );
};

const toVendorSubmission = (log) => {
  const user = log.scannedBy || {};
  const displayName = user.fullName || user.name || log.scannedByName || 'Unknown vendor';

  return {
    vendorId: user._id || null,
    vendorName: displayName,
    vendorCode: user.employeeId || '',
    overallWeight: log.referenceWeight ?? log.measuredWeight,
    measuredWeight: log.measuredWeight,
    expectedWeight: log.expectedWeight,
    expectedCount: log.expectedCount,
    status: log.status,
    submittedAt: log.createdAt
  };
};

exports.performScan = async (req, res) => {
  try {
    const { partNo, measuredWeight, referenceWeight } = req.body;
    const upperPartNo = partNo.toUpperCase();
    const scanningUser = await User.findById(req.user.userId)
      .select('name employeeType email employeeId department jobTitle manager')
      .lean();

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

    // if (demoData.remainingCount <= 0) {
    //   return res.status(400).json({ message: 'All items have been scanned. Count is zero.' });
    // }

    const expectedWeight = Number.isFinite(Number(referenceWeight))
      ? Number(referenceWeight)
      : demoData.unitWeight * demoData.totalCount;
    const tolerance = demoData.toleranceWeight ?? 0;
    const isExactVendorMatch = Number.isFinite(Number(referenceWeight))
      ? measuredWeight === expectedWeight
      : Math.abs(measuredWeight - expectedWeight) <= tolerance;
    const status = isExactVendorMatch ? 'match' : 'mismatch';
    const expectedCount = status === 'match'
      ? Math.round(expectedWeight / demoData.unitWeight)
      : 0;
    const finalValidationStatus = status === 'match' ? 'accepted' : 'rejected';

    if (status === 'match') {
      demoData.remainingCount = Math.max(0, demoData.remainingCount - expectedCount);
      await demoData.save();
    }

    const scanLog = new ScanLog({
      partNo: upperPartNo,
      partDescription: product.description,
      measuredWeight,
      expectedWeight,
      ...(Number.isFinite(Number(referenceWeight)) ? { referenceWeight: Number(referenceWeight) } : {}),
      unitWeight: demoData.unitWeight,
      toleranceWeight: tolerance,
      expectedCount,
      status,
      finalValidationStatus,
      scannedBy: req.user.userId,
      scannedByName: scanningUser?.name || req.user.name,
      scannedByEmployeeType: isVendorUser(scanningUser) ? 'vendor' : 'employee'
    });
    await scanLog.save();

    res.json({
      status,
      partNo: upperPartNo,
      partDescription: product.description,
      measuredWeight,
      expectedWeight,
      unitWeight: demoData.unitWeight,
      toleranceWeight: tolerance,
      expectedCount,
      remainingCount: demoData.remainingCount,
      finalValidationStatus,
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

    // Return *every* scan log (per scan), including employee name.
    // This is required for Admin Scan Logs to show all scans by all employees.
    const scanLogs = await ScanLog.find(filter)
      .populate('scannedBy', 'name')
      .sort({ createdAt: -1 })
      .lean();

    const enriched = await Promise.all(
      scanLogs.map(async (log) => {
        const demo = await DemoData.findOne({ partNo: log.partNo }).lean();
        const prod = await Product.findOne({ partNo: log.partNo }).lean();

        const unitWeight = demo ? demo.unitWeight : log.unitWeight ?? null;
        const toleranceWeight = demo ? (demo.toleranceWeight ?? 0) : log.toleranceWeight ?? null;
        const overallWeight = demo ? demo.overallWeight : null;
        const totalIdealProductCount = demo ? demo.totalCount : null;

        // Keep derived fields on a per-scan basis when possible.
        const receivedWeight = log.measuredWeight ?? null;
        const basedOnReceivedWeightProductCount = log.expectedCount ?? null;

        let short = null;
        let excess = null;
        let productDelay = null;
        let excessProduct = null;

        if (overallWeight !== null && receivedWeight !== null) {
          if (receivedWeight < overallWeight) short = overallWeight - receivedWeight;
          else if (receivedWeight > overallWeight) excess = receivedWeight - overallWeight;
        }

        if (totalIdealProductCount !== null && basedOnReceivedWeightProductCount !== null) {
          if (basedOnReceivedWeightProductCount < totalIdealProductCount) {
            productDelay = totalIdealProductCount - basedOnReceivedWeightProductCount;
          } else if (basedOnReceivedWeightProductCount > totalIdealProductCount) {
            excessProduct = basedOnReceivedWeightProductCount - totalIdealProductCount;
          }
        }

        const description = prod ? prod.description : log.partDescription;

        return {
          _id: log._id,
          partNo: log.partNo,
          description,
          unitWeight,
          toleranceWeight,
          overallWeight,
          receivedWeight,
          
          short,
          excess,
          totalIdealProductCount,
          basedOnReceivedWeightProductCount,
          productDelay,
          excessProduct,

          // Single-scan fields used by UI
          measuredWeight: log.measuredWeight,
          expectedWeight: log.expectedWeight,
          referenceWeight: log.referenceWeight,
          status: log.status,
          finalValidationStatus: log.finalValidationStatus || (log.status === 'match' ? 'accepted' : 'rejected'),
          scannedByName:
            log.scannedByName || (log.scannedBy ? log.scannedBy.name : null),
          createdAt: log.createdAt
        };
      })
    );

    res.json(enriched);
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

exports.getUserScanHistory = async (req, res) => {
  try {
    const userId = req.user.userId;
    const logs = await ScanLog.find({ scannedBy: userId })
      .sort({ createdAt: -1 })
      .lean();

    const partNos = [...new Set(logs.map((log) => log.partNo))];
    const demoDataEntries = await DemoData.find({ partNo: { $in: partNos } }).lean();
    const demoMap = demoDataEntries.reduce((acc, demo) => {
      acc[demo.partNo] = demo;
      return acc;
    }, {});

    // Enrich logs with latest demo data so employee history reflects admin updates.
    const enrichedLogs = logs.map((log) => {
      const demo = demoMap[log.partNo];
      return {
        ...log,
        // Used by UI column "Total ideal product count"
        totalIdealProductCount: demo?.totalCount ?? null,
        // Used by UI column "Tolerance Weight"
        toleranceWeight: demo?.toleranceWeight ?? log.toleranceWeight ?? null,
        // Used by UI column "Overall Weight"
        overallWeight: demo?.overallWeight ?? null,
        // Also keep unitWeight in sync (optional but helps consistency)
        unitWeight: demo?.unitWeight ?? log.unitWeight ?? null,
      };
    });

    res.json(enrichedLogs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getScanHistory = async (req, res) => {
  try {
    const { partNo } = req.query;
    if (!partNo) {
      return res.status(400).json({ message: 'partNo query parameter is required' });
    }

    const upperPartNo = partNo.toUpperCase();
    const logs = await ScanLog.find({ partNo: upperPartNo })
      .populate('scannedBy', 'name')
      .sort({ createdAt: -1 })
      .lean();

    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getVendorSubmissionsForPart = async (req, res) => {
  try {
    const { partNo } = req.query;
    if (!partNo) {
      return res.status(400).json({ message: 'partNo query parameter is required' });
    }

    const upperPartNo = partNo.toUpperCase();
    const logs = await ScanLog.find({ partNo: upperPartNo })
      .populate('scannedBy', 'name fullName email employeeId employeeType department jobTitle manager')
      .sort({ createdAt: -1 })
      .lean();

    const vendorLogs = logs.filter((log) => (
      log.scannedByEmployeeType === 'vendor' || isVendorUser(log.scannedBy)
    ));
    const vendorMap = new Map();

    vendorLogs.forEach((log) => {
      const vendorKey = String(log.scannedBy?._id || log.scannedByName || log._id);
      const existing = vendorMap.get(vendorKey);
      const submission = toVendorSubmission(log);

      if (!existing) {
        vendorMap.set(vendorKey, {
          ...submission,
          scanCount: 1
        });
        return;
      }

      existing.scanCount += 1;

      if (new Date(log.createdAt) > new Date(existing.submittedAt)) {
        Object.assign(existing, submission, { scanCount: existing.scanCount });
      }
    });

    res.json({
      partNo: upperPartNo,
      vendors: Array.from(vendorMap.values())
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getUserScanSummary = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Aggregate total weight and total products scanned
    const userObjectId = new ObjectId(userId);
    const summary = await ScanLog.aggregate([
      { $match: { scannedBy: userObjectId } },
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

