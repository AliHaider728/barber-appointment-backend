// routes/barberShifts.js
import express from 'express';
import BarberShift from '../models/BarberShift.js';
import mongoose from 'mongoose';

const router = express.Router();

// GET all shifts for a barber (for admin panel)
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

// GET shift for a barber on a specific DATE (NEW - FOR BOOKING)
router.get('/barber/:barberId/date/:date', async (req, res) => {
  try {
    const { barberId, date } = req.params;

    if (!mongoose.Types.ObjectId.isValid(barberId)) {
      return res.status(400).json({ message: 'Invalid barber ID' });
    }

    const targetDate = new Date(date);
    if (isNaN(targetDate)) {
      return res.status(400).json({ message: 'Invalid date' });
    }

    const dayOfWeek = targetDate.getDay(); // 0 = Sunday

    const shift = await BarberShift.findOne({
      barber: barberId,
      dayOfWeek
    });

    if (!shift) {
      return res.json({ isOff: true, message: 'Day Off' });
    }

    // Return only needed fields
    res.json({
      _id: shift._id,
      startTime: shift.startTime,
      endTime: shift.endTime,
      isOff: shift.isOff
    });

  } catch (error) {
    console.error('GET shift by date error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// CREATE / UPDATE shift (Admin)
router.post('/', async (req, res) => {
  try {
    const { barber, dayOfWeek, startTime, endTime, isOff } = req.body;

    if (!barber || !mongoose.Types.ObjectId.isValid(barber)) {
      return res.status(400).json({ message: 'Valid barber ID required' });
    }

    if (dayOfWeek < 0 || dayOfWeek > 6) {
      return res.status(400).json({ message: 'Invalid dayOfWeek (0-6)' });
    }

    if (!isOff && (!startTime || !endTime)) {
      return res.status(400).json({ message: 'Start and end time required' });
    }

    // Delete existing shift for same barber + day
    await BarberShift.deleteOne({ barber, dayOfWeek });

    const shift = new BarberShift({
      barber,
      dayOfWeek: Number(dayOfWeek),
      startTime: isOff ? null : startTime,
      endTime: isOff ? null : endTime,
      isOff: Boolean(isOff)
    });

    await shift.save();
    res.status(201).json(shift);

  } catch (error) {
    console.error('POST shift error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Shift already exists' });
    }
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

    res.json({ success: true, message: 'Shift deleted successfully' });
  } catch (error) {
    console.error('DELETE shift error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;