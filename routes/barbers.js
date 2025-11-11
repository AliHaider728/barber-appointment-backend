import express from 'express';
import Barber from '../models/Barber.js';
import Service from '../models/Service.js';
import mongoose from 'mongoose';

const router = express.Router();

 
// Helper
const parseSpecialties = (specialties) => {
  if (Array.isArray(specialties)) return specialties.map(s => s.trim()).filter(Boolean);
  if (typeof specialties === 'string') return specialties.split(',').map(s => s.trim()).filter(Boolean);
  return [];
};

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
    const barber = await Barber.findById(req.params.id).populate('branch', 'name city');
    if (!barber) return res.status(404).json({ message: 'Barber not found' });
    res.json(barber);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

 // POST /api/barbers/available → NO MORE serviceIds needed
router.post('/available', async (req, res) => {
  const { branch } = req.body;
  if (!branch) return res.status(400).json({ message: 'Branch required' });

  try {
    const branchId = new mongoose.Types.ObjectId(branch);
    const barbers = await Barber.find({ branch: branchId }).populate('branch', 'name city');
    res.json(barbers); // sab barbers return karo jo branch ma ha
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});
// UPDATE barber
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, experienceYears, specialties, branch } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid barber ID' });
    if (!name || !experienceYears || !branch) return res.status(400).json({ message: 'Name, experience, and branch required' });

    const parsedSpecialties = parseSpecialties(specialties);
    if (parsedSpecialties.length === 0) return res.status(400).json({ message: 'At least one specialty required' });

    if (!mongoose.Types.ObjectId.isValid(branch)) return res.status(400).json({ message: 'Invalid branch ID' });

    const updateData = {
      name: name.trim(),
      experienceYears: Number(experienceYears),
      specialties: parsedSpecialties,
      branch
    };

    const updatedBarber = await Barber.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
    if (!updatedBarber) return res.status(404).json({ message: 'Barber not found' });

    const populated = await Barber.findById(updatedBarber._id).populate('branch', 'name city');
    res.json(populated);
  } catch (error) {
    console.error('PUT /:id error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE barber
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid barber ID' });

    const barber = await Barber.findByIdAndDelete(id);
    if (!barber) return res.status(404).json({ message: 'Barber not found' });

    res.json({ message: 'Barber deleted successfully' });
  } catch (error) {
    console.error('DELETE /:id error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;