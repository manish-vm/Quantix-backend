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
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ScanLog', scanLogSchema);

