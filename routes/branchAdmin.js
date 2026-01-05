import express from 'express';
import { authenticateBranchAdmin, checkPermission } from './auth.js';
import { notifyMainAdminOfUpdate, notifyBarberOfUpdate } from '../utils/email.js';
import Barber from '../models/Barber.js';
import Appointment from '../models/Appointment.js';
import Service from '../models/Service.js';
import Leave from '../models/Leave.js';
import BarberShift from '../models/BarberShift.js';
import Admin from '../models/Admins.js';

const router = express.Router();

// Helper function to notify Main Admin
const sendMainAdminNotification = async (branchAdminName, updateType, details) => {
  try {
    const mainAdmin = await Admin.findOne({ role: 'main_admin', isActive: true });
    if (mainAdmin) {
      await notifyMainAdminOfUpdate(mainAdmin.email, branchAdminName, updateType, details);
    }
  } catch (error) {
    console.error('Failed to notify Main Admin:', error);
  }
};

// Dashboard stats
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

// Get barbers
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

// Create barber
router.post('/barbers', authenticateBranchAdmin, checkPermission('manage_barbers'), async (req, res) => {
  try {
    const barber = await Barber.create({
      ...req.body,
      branch: req.admin.assignedBranch._id
    });

    const populated = await Barber.findById(barber._id)
      .populate('branch', 'name city');

    // 📧 Notify Main Admin
    await sendMainAdminNotification(
      req.admin.fullName,
      'New Barber Added',
      `New barber "${barber.name}" has been added to ${req.admin.assignedBranch.name} branch.`
    );

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update barber
router.put('/barbers/:id', authenticateBranchAdmin, checkPermission('manage_barbers'), async (req, res) => {
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

    // 📧 Notify Barber
    if (barber.email) {
      await notifyBarberOfUpdate(
        barber.email,
        barber.name,
        'Profile Information',
        'Your profile has been updated by your Branch Admin. Please check your dashboard for details.'
      );
    }

    // 📧 Notify Main Admin
    await sendMainAdminNotification(
      req.admin.fullName,
      'Barber Updated',
      `Barber "${barber.name}" profile has been updated at ${req.admin.assignedBranch.name} branch.`
    );

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete barber
router.delete('/barbers/:id', authenticateBranchAdmin, checkPermission('manage_barbers'), async (req, res) => {
  try {
    const barber = await Barber.findById(req.params.id);
    if (!barber) return res.status(404).json({ message: 'Barber not found' });

    if (barber.branch.toString() !== req.admin.assignedBranch._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    await Barber.findByIdAndDelete(req.params.id);

    // 📧 Notify Main Admin
    await sendMainAdminNotification(
      req.admin.fullName,
      'Barber Deleted',
      `Barber "${barber.name}" has been removed from ${req.admin.assignedBranch.name} branch.`
    );

    res.json({ message: 'Barber deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get appointments
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
      .populate('user', 'fullName email')
      .sort({ date: -1 });

    res.json(appointments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update appointment
router.put('/appointments/:id', authenticateBranchAdmin, checkPermission('manage_appointments'), async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id)
      .populate('barber', 'name email')
      .populate('user', 'fullName email');
      
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

    if (appointment.branch.toString() !== req.admin.assignedBranch._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const updated = await Appointment.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    ).populate('barber', 'name email')
     .populate('user', 'fullName email');

    // 📧 Notify Barber
    if (appointment.barber && appointment.barber.email) {
      await notifyBarberOfUpdate(
        appointment.barber.email,
        appointment.barber.name,
        'Appointment',
        `An appointment with ${appointment.user?.fullName || 'a customer'} on ${new Date(appointment.date).toLocaleDateString()} has been updated. New status: ${req.body.status || appointment.status}`
      );
    }

    // 📧 Notify Main Admin
    await sendMainAdminNotification(
      req.admin.fullName,
      'Appointment Updated',
      `Appointment for ${appointment.user?.fullName || 'customer'} with barber ${appointment.barber?.name || 'Unknown'} has been updated at ${req.admin.assignedBranch.name}.`
    );

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get shifts
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

// Create shift
router.post('/shifts', authenticateBranchAdmin, checkPermission('manage_shifts'), async (req, res) => {
  try {
    const barber = await Barber.findById(req.body.barber);
    if (!barber || barber.branch.toString() !== req.admin.assignedBranch._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const shift = await BarberShift.create(req.body);
    const populated = await BarberShift.findById(shift._id)
      .populate('barber', 'name email');

    // 📧 Notify Barber
    if (barber.email) {
      await notifyBarberOfUpdate(
        barber.email,
        barber.name,
        'Shift Schedule',
        `A new shift has been scheduled for you: ${shift.dayOfWeek} from ${shift.startTime} to ${shift.endTime}`
      );
    }

    // 📧 Notify Main Admin
    await sendMainAdminNotification(
      req.admin.fullName,
      'New Shift Created',
      `New shift created for barber "${barber.name}" at ${req.admin.assignedBranch.name} branch.`
    );

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
 
// Update shift
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

    // 📧 Notify Barber
    if (shift.barber.email) {
      await notifyBarberOfUpdate(
        shift.barber.email,
        shift.barber.name,
        'Shift Schedule',
        `Your shift schedule has been updated: ${updated.dayOfWeek} from ${updated.startTime} to ${updated.endTime}`
      );
    }

    // 📧 Notify Main Admin
    await sendMainAdminNotification(
      req.admin.fullName,
      'Shift Updated',
      `Shift for barber "${shift.barber.name}" has been updated at ${req.admin.assignedBranch.name}.`
    );

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete shift
router.delete('/shifts/:id', authenticateBranchAdmin, checkPermission('manage_shifts'), async (req, res) => {
  try {
    const shift = await BarberShift.findById(req.params.id).populate('barber');
    if (!shift) return res.status(404).json({ message: 'Shift not found' });

    if (shift.barber.branch.toString() !== req.admin.assignedBranch._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    await BarberShift.findByIdAndDelete(req.params.id);

    // 📧 Notify Barber
    if (shift.barber.email) {
      await notifyBarberOfUpdate(
        shift.barber.email,
        shift.barber.name,
        'Shift Schedule',
        `Your shift for ${shift.dayOfWeek} (${shift.startTime} - ${shift.endTime}) has been removed.`
      );
    }

    // 📧 Notify Main Admin
    await sendMainAdminNotification(
      req.admin.fullName,
      'Shift Deleted',
      `Shift for barber "${shift.barber.name}" has been deleted from ${req.admin.assignedBranch.name}.`
    );

    res.json({ message: 'Shift deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get services
router.get('/services', authenticateBranchAdmin, async (req, res) => {
  try {
    const services = await Service.find().sort({ name: 1 });
    res.json(services);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create service
router.post('/services', authenticateBranchAdmin, checkPermission('manage_services'), async (req, res) => {
  try {
    const service = await Service.create(req.body);

    // 📧 Notify Main Admin
    await sendMainAdminNotification(
      req.admin.fullName,
      'New Service Added',
      `New service "${service.name}" (${service.price} PKR) has been added by ${req.admin.assignedBranch.name} branch.`
    );

    res.status(201).json(service);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update service
router.put('/services/:id', authenticateBranchAdmin, checkPermission('manage_services'), async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ message: 'Service not found' });

    const updated = await Service.findByIdAndUpdate(req.params.id, req.body, { new: true });

    // 📧 Notify Main Admin
    await sendMainAdminNotification(
      req.admin.fullName,
      'Service Updated',
      `Service "${service.name}" has been updated at ${req.admin.assignedBranch.name} branch.`
    );

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete service
router.delete('/services/:id', authenticateBranchAdmin, checkPermission('manage_services'), async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ message: 'Service not found' });

    await Service.findByIdAndDelete(req.params.id);

    // 📧 Notify Main Admin
    await sendMainAdminNotification(
      req.admin.fullName,
      'Service Deleted',
      `Service "${service.name}" has been removed from ${req.admin.assignedBranch.name} branch.`
    );

    res.json({ message: 'Service deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get leaves
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
 
// Update leave
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

    // 📧 Notify Barber
    if (leave.barber.email) {
      const statusText = req.body.status === 'approved' ? 'Approved ✅' : 
                         req.body.status === 'rejected' ? 'Rejected ❌' : 'Updated';
      await notifyBarberOfUpdate(
        leave.barber.email,
        leave.barber.name,
        'Leave Request',
        `Your leave request from ${new Date(leave.startDate).toLocaleDateString()} to ${new Date(leave.endDate).toLocaleDateString()} has been ${statusText}. ${req.body.reason ? 'Reason: ' + req.body.reason : ''}`
      );
    }

    // 📧 Notify Main Admin
    await sendMainAdminNotification(
      req.admin.fullName,
      'Leave Request Updated',
      `Leave request for barber "${leave.barber.name}" has been ${req.body.status || 'updated'} at ${req.admin.assignedBranch.name}.`
    );

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;