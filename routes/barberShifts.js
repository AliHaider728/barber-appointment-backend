// routes/barberShifts.js
import express from 'express';
import BarberShift from '../models/BarberShift.js';
import mongoose from 'mongoose';

const router = express.Router();

// GET shifts by barber
router.get('/', async (req, res) => {
  try {
    const { barber } = req.query;
    if (!barber || !mongoose.Types.ObjectId.isValid(barber)) {
      return res.status(400).json({ message: 'Valid barber ID required' });
    }

    const shifts = await BarberShift.find({ barber })
      .sort({ dayOfWeek: 1 });

    res.json(shifts);
  } catch (error) {
    console.error('GET shifts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// CREATE shift
router.post('/', async (req, res) => {
  try {
    const { barber, dayOfWeek, startTime, endTime, isOff } = req.body;

    if (!barber || !mongoose.Types.ObjectId.isValid(barber)) {
      return res.status(400).json({ message: 'Valid barber ID required' });
    }

    if (dayOfWeek < 0 || dayOfWeek > 6) {
      return res.status(400).json({ message: 'Invalid dayOfWeek' });
    }

    // Delete existing shift for same barber + day
    await BarberShift.deleteOne({ barber, dayOfWeek });

    const shift = new BarberShift({
      barber,
      dayOfWeek,
      startTime: isOff ? null : startTime,
      endTime: isOff ? null : endTime,
      isOff
    });

    await shift.save();
    res.status(201).json(shift);
  } catch (error) {
    console.error('POST shift error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE shift
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid shift ID' });
    }

    const shift = await BarberShift.findByIdAndDelete(id);
    if (!shift) {
      return res.status(404).json({ message: 'Shift not found' });
    }

    res.json({ message: 'Shift deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;