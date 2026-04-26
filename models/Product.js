const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  partNo: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Product', productSchema);

