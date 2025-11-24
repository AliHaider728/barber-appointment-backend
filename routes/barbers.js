import express from 'express';
import Barber from '../models/Barber.js';
import mongoose from 'mongoose';

const router = express.Router();

// Helper to clean specialties
const parseSpecialties = (specialties) => {
  if (Array.isArray(specialties)) {
    return specialties.map(s => s.trim()).filter(Boolean);
  }
  if (typeof specialties === 'string') {
    return specialties.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
};


// CREATE - Barber Add (Ab 100% kaam karega)
router.post('/', async (req, res) => {
  try {
    console.log('POST /api/barbers - Received:', req.body); // ← YE DEBUG LINE ZARURI HAI

    const { name, experienceYears, gender, specialties, branch } = req.body;

    // Validation
    if (!name || !experienceYears || !gender || !branch) {
      return res.status(400).json({ 
        success: false,
        message: 'Name, experience, gender aur branch required hain!' 
      });
    }

    if (!mongoose.Types.ObjectId.isValid(branch)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid Branch ID' 
      });
    }

    const parsedSpecialties = parseSpecialties(specialties || []);
    if (parsedSpecialties.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Kam se kam ek service select karo!' 
      });
    }

    // Check duplicate name (optional but recommended)
    const existing = await Barber.findOne({ 
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
      branch 
    });
    if (existing) {
      return res.status(400).json({ 
        success: false,
        message: 'Is branch mein ye naam ka barber pehle se mojood hai!' 
      });
    }

    const barber = new Barber({
      name: name.trim(),
      experienceYears: Number(experienceYears),
      gender: gender.toLowerCase(),
      specialties: parsedSpecialties,
      branch
    });

    await barber.save();

    const populated = await Barber.findById(barber._id)
      .populate('branch', 'name city');

    console.log('New Barber Created:', populated);
    res.status(201).json(populated);

  } catch (error) {
    console.error('Barber Create Error:', error);

    // MongoDB Duplicate Key Error (Agar name unique index laga hua ho)
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false,
        message: 'Barber with this name already exists in this branch!' 
      });
    }

    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + error.message 
    });
  }
});

// GET all barbers
router.get('/', async (req, res) => {
  try {
    const barbers = await Barber.find().populate('branch', 'name city').sort({ createdAt: -1 });
    res.json(barbers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET single barber
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid ID' });
    }
    const barber = await Barber.findById(req.params.id).populate('branch', 'name city');
    if (!barber) return res.status(404).json({ message: 'Barber not found' });
    res.json(barber);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});


// UPDATE barber
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, experienceYears, gender, specialties, branch } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(branch)) {
      return res.status(400).json({ message: 'Invalid ID' });
    }

    const parsedSpecialties = parseSpecialties(specialties || []);
    if (parsedSpecialties.length === 0) {
      return res.status(400).json({ message: 'At least one specialty required' });
    }

    const updated = await Barber.findByIdAndUpdate(id, {
      name: name.trim(),
      experienceYears: Number(experienceYears),
      gender: gender.toLowerCase(),
      specialties: parsedSpecialties,
      branch
    }, { new: true, runValidators: true });

    if (!updated) return res.status(404).json({ message: 'Barber not found' });

    const populated = await Barber.findById(updated._id).populate('branch', 'name city');
    res.json(populated);

  } catch (error) {
    console.error('Update error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Barber name already exists in this branch' });
    }
    res.status(500).json({ message: error.message });
  }
});

// DELETE barber
router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid ID' });
    }
    const barber = await Barber.findByIdAndDelete(req.params.id);
    if (!barber) return res.status(404).json({ message: 'Not found' });
    res.json({ success: true, message: 'Barber deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;