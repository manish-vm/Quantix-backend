const mongoose = require('mongoose');
const { ObjectId } = mongoose;
const DemoData = require('../models/DemoData');
const ScanLog = require('../models/ScanLog');
const Product = require('../models/Product');
const User = require('../models/User');
const VendorSubmission = require('../models/VendorSubmission');

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

    const {
      partNo,
      measuredWeight,
      referenceWeight,
      vendorSubmissionId,
      vendorOverrideData
    } = req.body;

    const upperPartNo = partNo.toUpperCase();

    // FETCH USER
    const scanningUser = await User.findById(
      req.user.userId
    )
      .select(
        'name employeeType email employeeId department jobTitle manager'
      )
      .lean();

    const isVendor = isVendorUser(scanningUser);

    // FIND PRODUCT
    const product = await Product.findOne({
      partNo: upperPartNo
    });

    if (!product) {
      return res.status(404).json({
        message: 'Part No not found'
      });
    }

    // FIND DEMO DATA
    const demoData = await DemoData.findOne({
      partNo: upperPartNo
    });

    if (!demoData) {
      return res.status(404).json({
        message:
          'Demo data not found. Please create baseline data first.',
        requiresDemoData: true
      });
    }

    const effectiveUnitWeight =
      vendorOverrideData?.unitWeight ??
      demoData.unitWeight;

    const effectiveCount =
      vendorOverrideData?.totalCount ??
      demoData.totalCount;

    const effectiveTolerance =
      vendorOverrideData?.toleranceWeight ??
      demoData.toleranceWeight;

    const effectiveOverallWeight =
      vendorOverrideData?.overallWeight ??
      (effectiveUnitWeight * effectiveCount);

    const expectedWeight =
      Number.isFinite(Number(referenceWeight))
        ? Number(referenceWeight)
        : effectiveOverallWeight;

    const tolerance = effectiveTolerance ?? 0;

    const isExactVendorMatch =
      Number.isFinite(Number(referenceWeight))
        ? Number(measuredWeight) === expectedWeight
        : Math.abs(
          Number(measuredWeight) -
          expectedWeight
        ) <= tolerance;

    const status = isExactVendorMatch
      ? 'match'
      : 'mismatch';

    const expectedCount =
      status === 'match'
        ? Math.round(
          expectedWeight /
          demoData.unitWeight
        )
        : 0;

    const finalValidationStatus =
      status === 'match'
        ? 'accepted'
        : 'rejected';

    // UPDATE DEMO COUNT
    if (status === 'match') {

      demoData.remainingCount = Math.max(
        0,
        demoData.remainingCount - expectedCount
      );

      await demoData.save();
    }

    // EMPLOYEE REVIEW VALIDATION
    let updatedVendorSubmission = null;

    if (
      !isVendor &&
      vendorSubmissionId &&
      status === 'match'
    ) {

      updatedVendorSubmission =
        await VendorSubmission.findOneAndUpdate(
          {
            _id: vendorSubmissionId,
            remainingReviewCount: {
              $gt: 0
            }
          },
          {
            $inc: {
              reviewedCount: 1,
              remainingReviewCount: -1
            }
          },
          {
            new: true
          }
        );

      if (!updatedVendorSubmission) {

        return res.status(400).json({
          message:
            'Review limit completed for this vendor submission'
        });
      }

      // AUTO COMPLETE
      if (
        updatedVendorSubmission.remainingReviewCount <= 0
      ) {

        updatedVendorSubmission.status =
          'completed';

        await updatedVendorSubmission.save();
      }
    }

    // CREATE SCAN LOG
    const scanLog = new ScanLog({
      partNo: upperPartNo,
      partDescription: product.description,

      measuredWeight,

      expectedWeight,

      ...(Number.isFinite(
        Number(referenceWeight)
      )
        ? {
          referenceWeight:
            Number(referenceWeight)
        }
        : {}),

      unitWeight: demoData.unitWeight,

      toleranceWeight: tolerance,

      expectedCount: effectiveCount,

      status,

      finalValidationStatus,

      scannedBy: req.user.userId,

      scannedByName:
        scanningUser?.name ||
        req.user.name,

      scannedByEmployeeType: isVendor
        ? 'vendor'
        : 'employee'
    });

    await scanLog.save();

    // CREATE VENDOR SUBMISSION
    if (isVendor && status === 'match') {

      const existingSubmission =
        await VendorSubmission.findOne({
          partNo: upperPartNo,
          vendorId: req.user.userId,
          status: 'active'
        });

      if (existingSubmission) {

        existingSubmission.submittedCount += 1;

        existingSubmission.remainingReviewCount += 1;

        existingSubmission.expectedCount =
          (existingSubmission.expectedCount || 0) +
          expectedCount;

        existingSubmission.overallWeight =
          expectedWeight;

        existingSubmission.measuredWeight =
          measuredWeight;

        existingSubmission.expectedWeight =
          expectedWeight;

        await existingSubmission.save();

      } else {

        await VendorSubmission.create({

          partNo: upperPartNo,

          vendorId: req.user.userId,

          vendorName:
            scanningUser?.name || 'Vendor',

          vendorCode:
            scanningUser?.employeeId || '',

          submittedCount: 1,

          reviewedCount: 0,

          remainingReviewCount: 1,

          expectedCount: effectiveCount,

          overallWeight: expectedWeight,

          measuredWeight,

          expectedWeight,

          status: 'active',

          unitWeight: effectiveUnitWeight,
          toleranceWeight: effectiveTolerance,
          overallProductCount: effectiveCount,
        });
      }
    }

    // RESPONSE
    res.json({
      status,

      partNo: upperPartNo,

      partDescription:
        product.description,

      measuredWeight,

      expectedWeight,

      unitWeight: demoData.unitWeight,

      toleranceWeight: tolerance,

      expectedCount: effectiveCount,

      remainingCount:
        demoData.remainingCount,

      finalValidationStatus,

      message:
        status === 'match'
          ? 'Weight matches expected value'
          : 'Weight mismatch detected',

      remainingReviewCount:
        updatedVendorSubmission
          ?.remainingReviewCount ?? null,

      reviewedCount:
        updatedVendorSubmission
          ?.reviewedCount ?? null
    });

  } catch (error) {

    console.error(
      'performScan error:',
      error
    );

    res.status(500).json({
      message: error.message
    });
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
      return res.status(400).json({
        message: 'Part number is required'
      });
    }

    const vendors = await VendorSubmission.find({
      partNo: partNo.toUpperCase(),
      remainingReviewCount: { $gt: 0 },
      status: 'active'
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      vendors
    });

  } catch (error) {

    console.error(
      'Vendor submission fetch error:',
      error
    );

    res.status(500).json({
      message: error.message
    });
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

