import express from 'express';
import { authenticateBranchAdmin, checkPermission } from './auth.js';
import Barber from '../models/Barber.js';
import Appointment from '../models/Appointment.js';
import Service from '../models/Service.js';
import Leave from '../models/Leave.js';
import BarberShift from '../models/BarberShift.js';
import bcrypt from 'bcryptjs';

const router = express.Router();

// Helper function to parse specialties
const parseSpecialties = (specialties) => {
  if (Array.isArray(specialties)) {
    return specialties.map(s => s.trim()).filter(Boolean);
  }
  if (typeof specialties === 'string') {
    return specialties.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
};

router.get('/dashboard/stats', authenticateBranchAdmin, async (req, res) => {
  try {
    const branchId = req.admin.assignedBranch._id;

    const totalBarbers = await Barber.countDocuments({ branch: branchId });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayAppointments = await Appointment.countDocuments({
      branch: branchId,
      date: { $gte: today, $lt: tomorrow }
    });

    const pendingAppointments = await Appointment.countDocuments({
      branch: branchId,
      status: 'pending'
    });

    const activeLeaves = await Leave.countDocuments({
      status: 'approved',
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    });

    res.json({
      success: true,
      stats: {
        totalBarbers,
        todayAppointments,
        pendingAppointments,
        activeLeaves
      },
      branch: {
        id: branchId,
        name: req.admin.assignedBranch.name,
        city: req.admin.assignedBranch.city
      }
    });
  } catch (err) {
    console.error('[BRANCH ADMIN] Stats error:', err);
    res.status(500).json({ message: err.message });
  }
});

// GET all barbers for this branch
router.get('/barbers', authenticateBranchAdmin, async (req, res) => {
  try {
    const barbers = await Barber.find({ branch: req.admin.assignedBranch._id })
      .populate('branch', 'name city')
      .sort({ createdAt: -1 });
    res.json(barbers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// CREATE barber - Branch Admin can add barbers to their branch
router.post('/barbers', authenticateBranchAdmin, checkPermission('manage_barbers'), async (req, res) => {
  try {
    const { name, experienceYears, gender, specialties, email, password } = req.body;

    console.log('[BRANCH ADMIN] Creating barber:', { name, email, branch: req.admin.assignedBranch.name });

    // Validation
    if (!name || !experienceYears || !gender || !email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'All fields are required!' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false,
        message: 'Password must be at least 6 characters!' 
      });
    }

    const parsedSpecialties = parseSpecialties(specialties || []);
    if (parsedSpecialties.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: 'At least one service is required!' 
      });
    }

    // Check duplicate email
    const existingEmail = await Barber.findOne({ email: email.trim().toLowerCase() });
    if (existingEmail) {
      return res.status(400).json({ 
        success: false,
        message: 'This email is already in use!' 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create barber - Automatically assign to branch admin's branch
    const barber = new Barber({
      name: name.trim(),
      experienceYears: Number(experienceYears),
      gender: gender.toLowerCase(),
      specialties: parsedSpecialties,
      branch: req.admin.assignedBranch._id, // Auto-assign branch
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      addedBy: req.admin._id, // Track who added this barber
      addedByRole: 'branch-admin'
    });

    await barber.save();

    const populated = await Barber.findById(barber._id)
      .populate('branch', 'name city');

    console.log('✅ Barber created by Branch Admin:', populated.name);
    res.status(201).json(populated);

  } catch (err) {
    console.error('❌ Branch Admin - Barber create error:', err);
    if (err.code === 11000) {
      return res.status(400).json({ 
        success: false,
        message: 'Barber with this email already exists!' 
      });
    }
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + err.message 
    });
  }
});

// UPDATE barber - Branch Admin can only update barbers from their branch
router.put('/barbers/:id', authenticateBranchAdmin, checkPermission('manage_barbers'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, experienceYears, gender, specialties, email, password } = req.body;

    console.log('🔄 [BRANCH ADMIN] Updating barber:', { id, branchId: req.admin.assignedBranch._id });

    // Find the barber
    const barber = await Barber.findById(id);
    if (!barber) {
      return res.status(404).json({ message: 'Barber not found' });
    }

    // ✅ CHECK: Barber belongs to this branch admin's branch
    if (barber.branch.toString() !== req.admin.assignedBranch._id.toString()) {
      console.log('❌ Unauthorized: Barber belongs to different branch');
      return res.status(403).json({ 
        message: 'You can only update barbers from your branch!' 
      });
    }

    // Build update object
    const updatedData = {};

    if (name !== undefined) updatedData.name = name.trim();
    if (experienceYears !== undefined) updatedData.experienceYears = Number(experienceYears);
    if (gender !== undefined) updatedData.gender = gender.toLowerCase();

    // Handle specialties
    if (specialties !== undefined) {
      const parsedSpecialties = parseSpecialties(specialties);
      if (parsedSpecialties.length === 0) {
        return res.status(400).json({ message: 'At least one specialty required' });
      }
      updatedData.specialties = parsedSpecialties;
    }

    // Handle email change
    if (email !== undefined) {
      const newEmail = email.trim().toLowerCase();
      if (newEmail !== barber.email) {
        const existingEmail = await Barber.findOne({ email: newEmail });
        if (existingEmail) {
          return res.status(400).json({ message: 'This email is already in use' });
        }
      }
      updatedData.email = newEmail;
    }

    // Handle password change
    if (password && password.trim() && password.length >= 6) {
      updatedData.password = await bcrypt.hash(password.trim(), 10);
    }

    // Track who updated
    updatedData.lastUpdatedBy = req.admin._id;
    updatedData.lastUpdatedByRole = 'branch-admin';
    updatedData.lastUpdatedAt = new Date();

    // Perform update
    const updated = await Barber.findByIdAndUpdate(
      id, 
      updatedData, 
      { new: true, runValidators: true }
    ).populate('branch', 'name city');

    console.log('✅ Barber updated by Branch Admin:', updated.name);
    res.json(updated);

  } catch (err) {
    console.error('❌ Branch Admin - Update error:', err);
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Email already exists' });
    }
    res.status(500).json({ message: err.message });
  }
});

// DELETE barber - Branch Admin can only delete barbers from their branch
router.delete('/barbers/:id', authenticateBranchAdmin, checkPermission('manage_barbers'), async (req, res) => {
  try {
    const barber = await Barber.findById(req.params.id);
    if (!barber) {
      return res.status(404).json({ message: 'Barber not found' });
    }

    // ✅ CHECK: Barber belongs to this branch admin's branch
    if (barber.branch.toString() !== req.admin.assignedBranch._id.toString()) {
      return res.status(403).json({ 
        message: 'You can only delete barbers from your branch!' 
      });
    }

    await Barber.findByIdAndDelete(req.params.id);
    console.log('✅ Barber deleted by Branch Admin:', barber.name);
    res.json({ message: 'Barber deleted successfully' });

  } catch (err) {
    console.error('❌ Branch Admin - Delete error:', err);
    res.status(500).json({ message: err.message });
  }
});

// GET appointments for this branch
router.get('/appointments', authenticateBranchAdmin, async (req, res) => {
  try {
    const filter = { branch: req.admin.assignedBranch._id };

    if (req.query.status) filter.status = req.query.status;

    if (req.query.date) {
      const start = new Date(req.query.date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(req.query.date);
      end.setHours(23, 59, 59, 999);
      filter.date = { $gte: start, $lte: end };
    }

    const appointments = await Appointment.find(filter)
      .populate('barber', 'name email')
      .sort({ date: -1 });

    res.json(appointments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/appointments/:id', authenticateBranchAdmin, checkPermission('manage_appointments'), async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

    if (appointment.branch.toString() !== req.admin.assignedBranch._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const updated = await Appointment.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    ).populate('barber', 'name email');

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET shifts for barbers in this branch
router.get('/shifts', authenticateBranchAdmin, async (req, res) => {
  try {
    const barbers = await Barber.find({ branch: req.admin.assignedBranch._id }).select('_id');
    const barberIds = barbers.map(b => b._id);

    const shifts = await BarberShift.find({ barber: { $in: barberIds } })
      .populate('barber', 'name email')
      .sort({ dayOfWeek: 1 });

    res.json(shifts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/shifts', authenticateBranchAdmin, checkPermission('manage_shifts'), async (req, res) => {
  try {
    const barber = await Barber.findById(req.body.barber);
    if (!barber || barber.branch.toString() !== req.admin.assignedBranch._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const shift = await BarberShift.create(req.body);
    const populated = await BarberShift.findById(shift._id)
      .populate('barber', 'name email');

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/shifts/:id', authenticateBranchAdmin, checkPermission('manage_shifts'), async (req, res) => {
  try {
    const shift = await BarberShift.findById(req.params.id).populate('barber');
    if (!shift) return res.status(404).json({ message: 'Shift not found' });

    if (shift.barber.branch.toString() !== req.admin.assignedBranch._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const updated = await BarberShift.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    ).populate('barber', 'name email');

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/shifts/:id', authenticateBranchAdmin, checkPermission('manage_shifts'), async (req, res) => {
  try {
    const shift = await BarberShift.findById(req.params.id).populate('barber');
    if (!shift) return res.status(404).json({ message: 'Shift not found' });

    if (shift.barber.branch.toString() !== req.admin.assignedBranch._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    await BarberShift.findByIdAndDelete(req.params.id);
    res.json({ message: 'Shift deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET services (read-only for branch admin)
router.get('/services', authenticateBranchAdmin, async (req, res) => {
  try {
    const services = await Service.find().sort({ name: 1 });
    res.json(services);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET leaves for barbers in this branch
router.get('/leaves', authenticateBranchAdmin, async (req, res) => {
  try {
    const barbers = await Barber.find({ branch: req.admin.assignedBranch._id }).select('_id');
    const barberIds = barbers.map(b => b._id);

    const leaves = await Leave.find({ barber: { $in: barberIds } })
      .populate('barber', 'name email')
      .sort({ createdAt: -1 });

    res.json(leaves);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
 
router.put('/leaves/:id', authenticateBranchAdmin, checkPermission('manage_leaves'), async (req, res) => {
  try {
    const leave = await Leave.findById(req.params.id).populate('barber');
    if (!leave) return res.status(404).json({ message: 'Leave not found' });

    if (leave.barber.branch.toString() !== req.admin.assignedBranch._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const updated = await Leave.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    ).populate('barber', 'name email');

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;