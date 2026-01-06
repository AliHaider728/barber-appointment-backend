import express from 'express';
import Barber from '../models/Barber.js';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

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

// CREATE - Barber Add
router.post('/', async (req, res) => {
  try {
    console.log('POST /api/barbers - Received:', req.body);

    const { name, experienceYears, gender, specialties, branch, email, password } = req.body;

    // Validation
    if (!name || !experienceYears || !gender || !branch || !email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Name, experience, gender, branch, email aur password required hain!' 
      });
    }

    // Password length check
    if (password.length < 6) {
      return res.status(400).json({ 
        success: false,
        message: 'Password kam se kam 6 characters ka hona chahiye!' 
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

    // Check duplicate email
    const existingEmail = await Barber.findOne({ email: email.trim().toLowerCase() });
    if (existingEmail) {
      return res.status(400).json({ 
        success: false,
        message: 'Ye email pehle se use ho raha hai!' 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create barber
    const barber = new Barber({
      name: name.trim(),
      experienceYears: Number(experienceYears),
      gender: gender.toLowerCase(),
      specialties: parsedSpecialties,
      branch,
      email: email.trim().toLowerCase(),
      password: hashedPassword
    });

    await barber.save();

    const populated = await Barber.findById(barber._id).populate('branch', 'name city');

    console.log('✅ New Barber Created:', populated.name);
    res.status(201).json(populated);

  } catch (error) {
    console.error('❌ Barber Create Error:', error);

    // MongoDB Duplicate Key Error
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false,
        message: 'Barber with this name or email already exists!' 
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
    const barbers = await Barber.find()
      .populate('branch', 'name city')
      .sort({ createdAt: -1 });
    res.json(barbers);
  } catch (error) {
    console.error('❌ Get barbers error:', error);
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
    console.error('❌ Get barber error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// UPDATE barber - FIXED to handle partial updates
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, experienceYears, gender, specialties, branch, email, password } = req.body;

    console.log('🔄 PUT /api/barbers/:id - Received:', { id, body: req.body });

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid Barber ID' });
    }

    // Find existing barber
    const barber = await Barber.findById(id);
    if (!barber) {
      return res.status(404).json({ message: 'Barber not found' });
    }

    // Build update object - only update provided fields
    const updatedData = {};

    if (name !== undefined) updatedData.name = name.trim();
    if (experienceYears !== undefined) updatedData.experienceYears = Number(experienceYears);
    if (gender !== undefined) updatedData.gender = gender.toLowerCase();
    if (branch !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(branch)) {
        return res.status(400).json({ message: 'Invalid Branch ID' });
      }
      updatedData.branch = branch;
    }

    // Handle specialties
    if (specialties !== undefined) {
      const parsedSpecialties = parseSpecialties(specialties);
      if (parsedSpecialties.length === 0) {
        return res.status(400).json({ message: 'At least one specialty required' });
      }
      updatedData.specialties = parsedSpecialties;
    }

    // Handle email change
    if (email !== undefined) {
      const newEmail = email.trim().toLowerCase();
      if (newEmail !== barber.email) {
        const existingEmail = await Barber.findOne({ email: newEmail });
        if (existingEmail) {
          return res.status(400).json({ message: 'This email is already in use' });
        }
      }
      updatedData.email = newEmail;
    }

    // Handle password change
    if (password && password.trim() && password.length >= 6) {
      updatedData.password = await bcrypt.hash(password.trim(), 10);
    }

    // Perform update
    const updated = await Barber.findByIdAndUpdate(
      id, 
      updatedData, 
      { 
        new: true, 
        runValidators: true 
      }
    );

    const populated = await Barber.findById(updated._id).populate('branch', 'name city');
    console.log('✅ Barber Updated:', populated.name);
    res.json(populated);

  } catch (error) {
    console.error('❌ Update error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Barber name or email already exists' });
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
    
    const barber = await Barber.findById(req.params.id);
    if (!barber) return res.status(404).json({ message: 'Not found' });

    // Delete from MongoDB
    await Barber.deleteOne({ _id: req.params.id });
    
    console.log('✅ Barber Deleted:', barber.name);
    res.json({ success: true, message: 'Barber deleted successfully' });
  } catch (error) {
    console.error('❌ Delete error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;