import express from 'express';
import { authenticateBranchAdmin } from './auth.js';

import Barber from '../models/Barber.js';
import Appointment from '../models/Appointment.js';
import Service from '../models/Service.js';
import Leave from '../models/Leave.js';
import BarberShift from '../models/BarberShift.js';

const router = express.Router();

/*  
   DASHBOARD STATS
  */
router.get('/dashboard/stats', authenticateBranchAdmin, async (req, res) => {
  try {
    const branchId = req.admin.assignedBranch._id;

    const totalBarbers = await Barber.countDocuments({ branch: branchId });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayAppointments = await Appointment.countDocuments({
      branchId,
      date: { $gte: today, $lt: tomorrow }
    });

    const pendingAppointments = await Appointment.countDocuments({
      branchId,
      status: 'pending'
    });

    const activeLeaves = await Leave.countDocuments({
      branchId,
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
    res.status(500).json({ message: err.message });
  }
});

/*  
   BARBERS
  */
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

router.post('/barbers', authenticateBranchAdmin, async (req, res) => {
  try {
    const barber = await Barber.create({
      ...req.body,
      branch: req.admin.assignedBranch._id
    });

    const populated = await Barber.findById(barber._id)
      .populate('branch', 'name city');

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/barbers/:id', authenticateBranchAdmin, async (req, res) => {
  try {
    const barber = await Barber.findById(req.params.id);
    if (!barber) return res.status(404).json({ message: 'Barber not found' });

    if (barber.branch.toString() !== req.admin.assignedBranch._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const updated = await Barber.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('branch', 'name city');

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/barbers/:id', authenticateBranchAdmin, async (req, res) => {
  try {
    const barber = await Barber.findById(req.params.id);
    if (!barber) return res.status(404).json({ message: 'Barber not found' });

    if (barber.branch.toString() !== req.admin.assignedBranch._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    await Barber.findByIdAndDelete(req.params.id);
    res.json({ message: 'Barber deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/*  
   APPOINTMENTS
  */
router.get('/appointments', authenticateBranchAdmin, async (req, res) => {
  try {
    const filter = { branchId: req.admin.assignedBranch._id };

    if (req.query.status) filter.status = req.query.status;

    if (req.query.date) {
      const start = new Date(req.query.date);
      start.setHours(0, 0, 0, 0);

      const end = new Date(req.query.date);
      end.setHours(23, 59, 59, 999);

      filter.date = { $gte: start, $lte: end };
    }

    const appointments = await Appointment.find(filter)
      .populate('userId', 'fullName email phone')
      .populate('barberId', 'name email')
      .populate('serviceId', 'name price duration')
      .sort({ date: -1 });

    res.json(appointments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/appointments/:id', authenticateBranchAdmin, async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

    if (appointment.branchId.toString() !== req.admin.assignedBranch._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const updated = await Appointment.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    )
      .populate('userId', 'fullName email phone')
      .populate('barberId', 'name email')
      .populate('serviceId', 'name price duration');

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/*  
   SHIFTS (FIXED)
  */
router.get('/shifts', authenticateBranchAdmin, async (req, res) => {
  try {
    const shifts = await BarberShift.find({
      branchId: req.admin.assignedBranch._id
    })
      .populate('barberId', 'name email')
      .sort({ date: -1 });

    res.json(shifts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/shifts', authenticateBranchAdmin, async (req, res) => {
  try {
    const shift = await BarberShift.create({
      ...req.body,
      branchId: req.admin.assignedBranch._id
    });

    const populated = await BarberShift.findById(shift._id)
      .populate('barberId', 'name email');

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/shifts/:id', authenticateBranchAdmin, async (req, res) => {
  try {
    const shift = await BarberShift.findById(req.params.id);
    if (!shift) return res.status(404).json({ message: 'Shift not found' });

    if (shift.branchId.toString() !== req.admin.assignedBranch._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const updated = await BarberShift.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    ).populate('barberId', 'name email');

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/shifts/:id', authenticateBranchAdmin, async (req, res) => {
  try {
    const shift = await BarberShift.findById(req.params.id);
    if (!shift) return res.status(404).json({ message: 'Shift not found' });

    if (shift.branchId.toString() !== req.admin.assignedBranch._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    await BarberShift.findByIdAndDelete(req.params.id);
    res.json({ message: 'Shift deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/*  
   SERVICES
  */
router.get('/services', authenticateBranchAdmin, async (req, res) => {
  try {
    const services = await Service.find().sort({ name: 1 });
    res.json(services);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/*  
   LEAVES
  */
router.get('/leaves', authenticateBranchAdmin, async (req, res) => {
  try {
    const leaves = await Leave.find({
      branchId: req.admin.assignedBranch._id
    })
      .populate('barberId', 'name email')
      .sort({ createdAt: -1 });

    res.json(leaves);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/leaves/:id', authenticateBranchAdmin, async (req, res) => {
  try {
    const leave = await Leave.findById(req.params.id);
    if (!leave) return res.status(404).json({ message: 'Leave not found' });

    if (leave.branchId.toString() !== req.admin.assignedBranch._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const updated = await Leave.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    ).populate('barberId', 'name email');

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
