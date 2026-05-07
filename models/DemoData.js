const mongoose = require('mongoose');

const demoDataSchema = new mongoose.Schema({
  partNo: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  partDescription: {
    type: String,
    required: true
  },
  overallWeight: {
    type: Number,
    required: true,
    min: 0
  },
  totalCount: {
    type: Number,
    required: true,
    min: 1
  },
  unitWeight: {
    type: Number,
    required: true,
    min: 0
  },
  toleranceWeight: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  remainingCount: {
    type: Number,
    required: true,
    min: 0
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('DemoData', demoDataSchema);

