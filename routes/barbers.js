import express from 'express';
import Barber from '../models/Barber.js';

const router = express.Router();

// GET all barbers
router.get('/', async (req, res) => {
  try {
    const barbers = await Barber.find().populate('branch', 'name city');
    res.json(barbers);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET single barber
router.get('/:id', async (req, res) => {
  try {
    const barber = await Barber.findById(req.params.id).populate('branch');
    if (!barber) return res.status(404).json({ message: 'Barber not found' });
    res.json(barber);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// CREATE new barber
router.post('/', async (req, res) => {
  const { name, experienceYears, specialties, branch } = req.body;
  try {
    const barber = new Barber({ name, experienceYears, specialties, branch });
    await barber.save();
    res.status(201).json(barber);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// UPDATE barber
router.put('/:id', async (req, res) => {
  try {
    const barber = await Barber.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!barber) return res.status(404).json({ message: 'Barber not found' });
    res.json(barber);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE barber
router.delete('/:id', async (req, res) => {
  try {
    const barber = await Barber.findByIdAndDelete(req.params.id);
    if (!barber) return res.status(404).json({ message: 'Barber not found' });
    res.json({ message: 'Barber deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;