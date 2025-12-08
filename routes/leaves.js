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
    const { startDate, endDate, reason } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Start date and end date required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      return res.status(400).json({ message: 'End date must be after start date' });
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
    const { barber, startDate, endDate, reason } = req.body;
    
    if (!barber || !mongoose.Types.ObjectId.isValid(barber)) {
      return res.status(400).json({ message: 'Valid barber ID required' });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Start and end dates required' });
    }

    const leave = new Leave({
      barber,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
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
    const { status } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid leave ID' });
    }

    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const leave = await Leave.findByIdAndUpdate(
      id,
      { status },
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