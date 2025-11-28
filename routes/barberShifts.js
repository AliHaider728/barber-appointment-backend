import express from 'express';
import BarberShift from '../models/BarberShift.js';
import mongoose from 'mongoose';

const router = express.Router();

// GET shifts by barber (for admin panel)
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

//  NEW: GET shift for specific barber on specific date (for booking page)
router.get('/barber/:barberId/date/:date', async (req, res) => {
  try {
    const { barberId, date } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(barberId)) {
      return res.status(400).json({ message: 'Invalid barber ID' });
    }

    // Get day of week from date (0 = Sunday, 6 = Saturday)
    const selectedDate = new Date(date);
    const dayOfWeek = selectedDate.getDay();

    console.log(`Fetching shift for barber ${barberId} on day ${dayOfWeek} (${date})`);

    // Find shift for this barber on this day
    const shift = await BarberShift.findOne({ 
      barber: barberId, 
      dayOfWeek 
    });

    if (!shift) {
      console.log('No shift found for this day');
      return res.status(404).json({ 
        message: 'No shift found',
        isOff: false,
        noShift: true 
      });
    }

    console.log('Shift found:', shift);
    res.json(shift);
  } catch (error) {
    console.error('GET shift by date error:', error);
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