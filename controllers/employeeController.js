const bcrypt = require('bcryptjs');
const User = require('../models/User');

const normalizeEmployeeType = (employeeType) => {
  return ['vendor', 'employee'].includes(employeeType) ? employeeType : 'employee';
};

const pickEmployeeUpdatableFields = (body) => {
  return {
    employeeType: body.employeeType,
    employeeId: body.employeeId,

    fullName: body.fullName,

    department: body.department,
    jobTitle: body.jobTitle,
    contactDetails: body.contactDetails,
    hireDate: body.hireDate,
    employmentStatus: body.employmentStatus,
    manager: body.manager,
    salary: body.salary,
    location: body.location,
  };
};

exports.getAllEmployees = async (req, res) => {
  try {
    const { employeeType } = req.query;

    const filter = {};
    if (employeeType === 'vendor') {
      // Vendor rows might be stored with only `role: 'vendor'` or with `employeeType: 'vendor'`
      // so treat either as vendor.
      filter.$or = [{ role: 'vendor' }, { employeeType: 'vendor' }];
    } else if (employeeType === 'employee') {
      filter.role = 'employee';
      filter.employeeType = 'employee';
    } else {
      filter.role = { $in: ['employee', 'vendor'] };
    }

    const employees = await User.find(filter).sort({ createdAt: -1 });
    res.json(employees);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createEmployee = async (req, res) => {
  try {
    const {
      email,
      password,
      employeeType,
      employeeId,
      fullName,
      department,
      jobTitle,
      contactDetails,
      hireDate,
      employmentStatus,
      manager,
      salary,
      location,
    } = req.body;


    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const existing = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ message: 'Employee with this email already exists' });
    }

    const existingEmployeeId = employeeId ? await User.findOne({ employeeId: String(employeeId).trim() }) : null;
    if (existingEmployeeId) {
      return res.status(400).json({ message: 'Employee/Vendor ID already exists' });
    }


    const hashedPassword = await bcrypt.hash(password, 10);

    const normalizedEmployeeType = normalizeEmployeeType(employeeType);
    const user = new User({
      name: fullName || employeeId || email,
      email: String(email).toLowerCase().trim(),
      password: hashedPassword,
      role: normalizedEmployeeType === 'vendor' ? 'vendor' : 'employee',
      employeeType: normalizedEmployeeType,
      employeeId,
      fullName,
      department,
      jobTitle,
      contactDetails,
      hireDate: hireDate ? new Date(hireDate) : undefined,
      employmentStatus,
      manager,
      salary: salary === '' || salary === null || salary === undefined ? undefined : Number(salary),
      location,
    });

    await user.save();

    const created = await User.findById(user._id).select('-password');
    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user || user.role !== 'employee') {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const {
      email,
      password,
      ...rest
    } = req.body;

    // Allow updating HR fields
    const updatedFields = pickEmployeeUpdatableFields(rest);

    if (updatedFields.employeeType !== undefined) {
      const normalizedType = normalizeEmployeeType(updatedFields.employeeType);
      user.employeeType = normalizedType;
      user.role = normalizedType === 'vendor' ? 'vendor' : 'employee';
    }

    if (updatedFields.employeeId !== undefined) {
      const nextId = updatedFields.employeeId ? String(updatedFields.employeeId).trim() : updatedFields.employeeId;
      if (nextId) {
        const conflict = await User.findOne({ employeeId: nextId, _id: { $ne: user._id } });
        if (conflict) {
          return res.status(400).json({ message: 'Employee/Vendor ID already exists' });
        }
      }
      user.employeeId = updatedFields.employeeId;
    }

    if (updatedFields.fullName !== undefined) {

      user.fullName = updatedFields.fullName;
      // keep name in sync for login display
      if (typeof updatedFields.fullName === 'string' && updatedFields.fullName.trim()) {
        user.name = updatedFields.fullName.trim();
      }
    }
    if (updatedFields.department !== undefined) user.department = updatedFields.department;
    if (updatedFields.jobTitle !== undefined) user.jobTitle = updatedFields.jobTitle;
    if (updatedFields.contactDetails !== undefined) user.contactDetails = updatedFields.contactDetails;

    if (updatedFields.hireDate !== undefined) {
      user.hireDate = updatedFields.hireDate ? new Date(updatedFields.hireDate) : null;
    }

    if (updatedFields.employmentStatus !== undefined) user.employmentStatus = updatedFields.employmentStatus;
    if (updatedFields.manager !== undefined) user.manager = updatedFields.manager;

    if (updatedFields.salary !== undefined) {
      user.salary = updatedFields.salary === '' || updatedFields.salary === null ? undefined : Number(updatedFields.salary);
    }

    if (updatedFields.location !== undefined) user.location = updatedFields.location;

    // Allow optional email update (rare), but enforce uniqueness
    if (email !== undefined) {
      const nextEmail = String(email).toLowerCase().trim();
      const conflict = await User.findOne({ email: nextEmail, _id: { $ne: user._id } });
      if (conflict) {
        return res.status(400).json({ message: 'Another user already uses this email' });
      }
      user.email = nextEmail;
    }

    // Allow optional password reset
    if (password !== undefined && String(password).trim() !== '') {
      user.password = await bcrypt.hash(password, 10);
    }

    await user.save();

    const updated = await User.findById(user._id).select('-password');
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user || !['employee', 'vendor'].includes(user.role)) {
      return res.status(404).json({ message: 'Employee/Vendor not found' });
    }

    await User.deleteOne({ _id: id });
    res.json({ message: 'Employee deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

