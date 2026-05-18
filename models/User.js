const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['admin', 'employee', 'vendor'],
      default: 'employee',
    },

    // Vendor vs general employee
    employeeType: {
      type: String,
      enum: ['vendor', 'employee'],
      default: 'employee',
    },

    // Employee/Vendor profile fields
    // Must be unique across both types
    employeeId: { type: String, trim: true, unique: true },

    fullName: { type: String, trim: true },
    department: { type: String, trim: true },
    jobTitle: { type: String, trim: true },
    contactDetails: { type: String, trim: true },
    hireDate: { type: Date },
    employmentStatus: { type: String, enum: ['full-time', 'part-time'] },
    manager: { type: String, trim: true },
    salary: { type: Number },
    location: { type: String, trim: true },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('User', userSchema);


