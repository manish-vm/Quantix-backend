const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { JWT_SECRET } = require('../middleware/auth');

exports.register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashedPassword, role: role || 'employee' });
    await user.save();

    const token = jwt.sign({ userId: user._id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '24h' });

    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, employeeType: user.employeeType }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user._id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '24h' });

    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, employeeType: user.employeeType }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Employees/admin can update their own profile HR fields.
exports.updateMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const {
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
      // identity
      name,
      email
    } = req.body;

    if (typeof name === 'string') user.name = name;
    if (typeof email === 'string') user.email = email;

    if (typeof employeeId === 'string') user.employeeId = employeeId;
    if (typeof fullName === 'string') user.fullName = fullName;
    if (typeof department === 'string') user.department = department;
    if (typeof jobTitle === 'string') user.jobTitle = jobTitle;
    if (typeof contactDetails === 'string') user.contactDetails = contactDetails;
    if (hireDate !== undefined) user.hireDate = hireDate ? new Date(hireDate) : null;
    if (typeof employmentStatus === 'string') user.employmentStatus = employmentStatus;
    if (typeof manager === 'string') user.manager = manager;
    if (salary !== undefined) user.salary = salary === '' || salary === null ? undefined : Number(salary);
    if (typeof location === 'string') user.location = location;

    await user.save();
    const updated = await User.findById(user._id).select('-password');
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


