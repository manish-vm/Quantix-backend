const mongoose = require('mongoose');

const vendorSubmissionSchema = new mongoose.Schema(
  {
    partNo: {
      type: String,
      required: true,
      uppercase: true,
      trim: true
    },

    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    vendorName: {
      type: String,
      required: true
    },

    vendorCode: {
      type: String,
      default: ''
    },

    submittedCount: {
      type: Number,
      required: true,
      min: 1
    },

    reviewedCount: {
      type: Number,
      default: 0
    },

    remainingReviewCount: {
      type: Number,
      required: true
    },

    overallWeight: Number,
    measuredWeight: Number,
    expectedWeight: Number,

    status: {
      type: String,
      enum: ['active', 'completed'],
      default: 'active'
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model(
  'VendorSubmission',
  vendorSubmissionSchema
);