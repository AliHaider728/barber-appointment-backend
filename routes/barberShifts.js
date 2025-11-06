import express from 'express';
import BarberShift from '../models/BarberShift.js';

const router = express.Router();

router.get('/barber/:barberId', async (req, res) => {
  try {
    const shifts = await BarberShift.find({ barber: req.params.barberId });
    res.json(shifts);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;