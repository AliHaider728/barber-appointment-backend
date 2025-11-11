import express from 'express';
import BarberShift from '../models/BarberShift.js';
import Barber from '../models/Barber.js';

const router = express.Router();

// GET ALL SHIFTS (with barber details)
router.get('/', async (req, res) => {
  try {
    const shifts = await BarberShift.find()
      .populate('barber', 'name gender experienceYears')
      .populate({
        path: 'barber',
        populate: { path: 'branch', select: 'name city' }
      });
    res.json(shifts);
  } catch (error) {
    console.error('Fetch shifts error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET SHIFTS BY BARBER ID
router.get('/barber/:barberId', async (req, res) => {
  try {
    const shifts = await BarberShift.find({ barber: req.params.barberId });
    
    if (!shifts || shifts.length === 0) {
      // Return default shifts if none found
      return res.json([
        { dayOfWeek: 1, startTime: "09:00", endTime: "19:00", isOff: false },
        { dayOfWeek: 2, startTime: "09:00", endTime: "19:00", isOff: false },
        { dayOfWeek: 3, startTime: "09:00", endTime: "19:00", isOff: false },
        { dayOfWeek: 4, startTime: "09:00", endTime: "19:00", isOff: false },
        { dayOfWeek: 5, startTime: "09:00", endTime: "19:00", isOff: false },
        { dayOfWeek: 6, startTime: "10:00", endTime: "16:00", isOff: false },
        { dayOfWeek: 0, isOff: true }
      ]);
    }
    
    res.json(shifts);
  } catch (error) {
    console.error('Fetch barber shifts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// CREATE SHIFT
router.post('/', async (req, res) => {
  try {
    const { barber, dayOfWeek, startTime, endTime, isOff } = req.body;

    if (!barber || dayOfWeek === undefined) {
      return res.status(400).json({ message: 'Barber and dayOfWeek are required' });
    }

    // Check if shift already exists
    const existing = await BarberShift.findOne({ barber, dayOfWeek });
    if (existing) {
      return res.status(400).json({ message: 'Shift already exists for this day' });
    }

    const shiftData = {
      barber,
      dayOfWeek,
      isOff: isOff || false
    };

    // Only add times if not a day off
    if (!isOff) {
      if (!startTime || !endTime) {
        return res.status(400).json({ message: 'Start and end times required for working days' });
      }
      shiftData.startTime = startTime;
      shiftData.endTime = endTime;
    }

    const shift = new BarberShift(shiftData);
    await shift.save();

    const populated = await BarberShift.findById(shift._id)
      .populate('barber', 'name gender')
      .populate({
        path: 'barber',
        populate: { path: 'branch', select: 'name city' }
      });

    res.status(201).json(populated);
  } catch (error) {
    console.error('Create shift error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// UPDATE SHIFT
router.put('/:id', async (req, res) => {
  try {
    const { dayOfWeek, startTime, endTime, isOff } = req.body;

    const shift = await BarberShift.findById(req.params.id);
    if (!shift) return res.status(404).json({ message: 'Shift not found' });

    shift.dayOfWeek = dayOfWeek !== undefined ? dayOfWeek : shift.dayOfWeek;
    shift.isOff = isOff !== undefined ? isOff : shift.isOff;

    if (!shift.isOff) {
      if (!startTime || !endTime) {
        return res.status(400).json({ message: 'Start and end times required' });
      }
      shift.startTime = startTime;
      shift.endTime = endTime;
    } else {
      // Remove times if day off
      shift.startTime = undefined;
      shift.endTime = undefined;
    }

    await shift.save();

    const populated = await BarberShift.findById(shift._id)
      .populate('barber', 'name gender')
      .populate({
        path: 'barber',
        populate: { path: 'branch', select: 'name city' }
      });

    res.json(populated);
  } catch (error) {
    console.error('Update shift error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// DELETE SHIFT
router.delete('/:id', async (req, res) => {
  try {
    const shift = await BarberShift.findByIdAndDelete(req.params.id);
    if (!shift) return res.status(404).json({ message: 'Shift not found' });
    res.json({ message: 'Shift deleted successfully' });
  } catch (error) {
    console.error('Delete shift error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;