import express from 'express';
import Leave from '../models/Leave.js';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

const router = express.Router();

//  Middleware to verify barber token
const verifyBarber = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    if (decoded.role !== 'barber') {
      return res.status(403).json({ message: 'Access denied' });
    }

    req.barber = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// NEW: GET leaves for barber on specific date (for booking slots)
router.get('/barber/:barberId/date/:date', async (req, res) => {
  try {
    const { barberId, date } = req.params;

    if (!mongoose.Types.ObjectId.isValid(barberId)) {
      return res.status(400).json({ message: 'Invalid barber ID' });
    }

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const leaves = await Leave.find({
      barber: barberId,
      startDate: { $lte: endOfDay },
      endDate: { $gte: startOfDay },
      status: 'approved'
    }).select('startDate endDate');

    res.json(leaves);
  } catch (error) {
    console.error('Get barber leaves by date error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

//  NEW: GET logged-in barber's leaves
router.get('/barber/me', verifyBarber, async (req, res) => {
  try {
    const barberId = req.barber.id;
    
    const leaves = await Leave.find({ barber: barberId })
      .sort({ createdAt: -1 });

    res.json(leaves);
  } catch (error) {
    console.error('Get barber leaves error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

//  NEW: CREATE leave request by logged-in barber
router.post('/barber/me', verifyBarber, async (req, res) => {
  try {
    const barberId = req.barber.id;
    const { date, startTime, endTime, reason } = req.body;

    if (!date || !startTime || !endTime) {
      return res.status(400).json({ message: 'Date, start time, and end time required' });
    }

    const start = new Date(`${date}T${startTime}:00`);
    const end = new Date(`${date}T${endTime}:00`);

    if (start >= end) {
      return res.status(400).json({ message: 'End time must be after start time' });
    }

    const leave = new Leave({
      barber: barberId,
      startDate: start,
      endDate: end,
      reason: reason || 'Personal leave',
      status: 'pending'
    });

    await leave.save();
    res.status(201).json(leave);
  } catch (error) {
    console.error('Create leave error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

//  NEW: DELETE leave request by logged-in barber (only if pending)
router.delete('/barber/me/:id', verifyBarber, async (req, res) => {
  try {
    const barberId = req.barber.id;
    const leaveId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(leaveId)) {
      return res.status(400).json({ message: 'Invalid leave ID' });
    }

    const leave = await Leave.findOne({
      _id: leaveId,
      barber: barberId,
      status: 'pending' // Only delete pending leaves
    });

    if (!leave) {
      return res.status(404).json({ 
        message: 'Leave not found or cannot be deleted (approved/rejected leaves cannot be deleted)' 
      });
    }

    await Leave.findByIdAndDelete(leaveId);
    res.json({ message: 'Leave request deleted successfully' });
  } catch (error) {
    console.error('Delete leave error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET leaves for specific barber (Admin route)
router.get('/barber/:barberId', async (req, res) => {
  try {
    const { barberId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(barberId)) {
      return res.status(400).json({ message: 'Invalid barber ID' });
    }

    const leaves = await Leave.find({ barber: barberId })
      .populate('barber', 'name email')
      .sort({ startDate: -1 });

    res.json(leaves);
  } catch (error) {
    console.error('Get leaves error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET all leaves (Admin only)
router.get('/', async (req, res) => {
  try {
    const leaves = await Leave.find()
      .populate('barber', 'name email branch')
      .populate({
        path: 'barber',
        populate: { path: 'branch', select: 'name city' }
      })
      .sort({ createdAt: -1 });

    res.json(leaves);
  } catch (error) {
    console.error('Get all leaves error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// CREATE leave request (Admin can create for any barber)
router.post('/', async (req, res) => {
  try {
    const { barber, date, startTime, endTime, reason } = req.body;
    
    if (!barber || !mongoose.Types.ObjectId.isValid(barber)) {
      return res.status(400).json({ message: 'Valid barber ID required' });
    }

    if (!date || !startTime || !endTime) {
      return res.status(400).json({ message: 'Date, start time, and end time required' });
    }

    const start = new Date(`${date}T${startTime}:00`);
    const end = new Date(`${date}T${endTime}:00`);

    if (start >= end) {
      return res.status(400).json({ message: 'End time must be after start time' });
    }

    const leave = new Leave({
      barber,
      startDate: start,
      endDate: end,
      reason: reason || 'Leave',
      status: 'pending'
    });

    await leave.save();
    
    const populated = await Leave.findById(leave._id)
      .populate('barber', 'name email');
    
    res.status(201).json(populated);
  } catch (error) {
    console.error('Create leave error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// UPDATE leave status (Admin only - approve/reject)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, date, startTime, endTime, reason, barber } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid leave ID' });
    }

    const updateData = {};
    if (status) {
      if (!['pending', 'approved', 'rejected'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
      }
      updateData.status = status;
    }

    if (date && startTime && endTime) {
      const start = new Date(`${date}T${startTime}:00`);
      const end = new Date(`${date}T${endTime}:00`);
      if (start >= end) {
        return res.status(400).json({ message: 'End time must be after start time' });
      }
      updateData.startDate = start;
      updateData.endDate = end;
    }

    if (reason) updateData.reason = reason;
    if (barber) updateData.barber = barber;

    const leave = await Leave.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    ).populate('barber', 'name email');

    if (!leave) {
      return res.status(404).json({ message: 'Leave not found' });
    }

    res.json(leave);
  } catch (error) {
    console.error('Update leave error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


  
// DELETE leave (Admin only)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid leave ID' });
    }

    const leave = await Leave.findByIdAndDelete(id);
    
    if (!leave) {
      return res.status(404).json({ message: 'Leave not found' });
    }

    res.json({ message: 'Leave deleted successfully' });
  } catch (error) {
    console.error('Delete leave error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;