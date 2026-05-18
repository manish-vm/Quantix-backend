const mongoose = require('mongoose');

const scanLogSchema = new mongoose.Schema({
  partNo: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  partDescription: {
    type: String,
    required: true
  },
  measuredWeight: {
    type: Number,
    required: true
  },
  expectedWeight: {
    type: Number,
    required: true
  },
  referenceWeight: {
    type: Number
  },
  unitWeight: {
    type: Number,
    required: true
  },
  toleranceWeight: {
    type: Number,
    required: true,
    default: 0
  },
  expectedCount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['match', 'mismatch'],
    required: true
  },
  finalValidationStatus: {
    type: String,
    enum: ['accepted', 'rejected'],
    required: true,
    default: 'rejected'
  },
  scannedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  scannedByName: {
    type: String,
    required: true
  },
  scannedByEmployeeType: {
    type: String,
    enum: ['vendor', 'employee'],
    default: 'employee'
  },
  referenceVendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  referenceVendorName: {
    type: String
  },

  // Vendor-submission remaining quantity for employee scanning.
  // Only used when this ScanLog row represents a vendor submission batch.
  submissionRemainingCount: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ScanLog', scanLogSchema);


