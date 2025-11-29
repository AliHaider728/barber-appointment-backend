import express from 'express';
import Barber from '../models/Barber.js';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken'; // Import jwt for verifyToken

const router = express.Router();

// Verify Token Middleware (from auth.js, but defined here for completeness)
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// Is Admin Middleware
const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied - Admin only' });
  }
  next();
};

// Is Barber or Admin
const isBarberOrAdmin = (req, res, next) => {
  if (req.user.role !== 'barber' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }
  next();
};

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


// CREATE - Barber Add (Admin only)
router.post('/', verifyToken, isAdmin, async (req, res) => {
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

// GET all barbers (Auth required, anyone with auth can view)
router.get('/', verifyToken, async (req, res) => {
  try {
    const barbers = await Barber.find().populate('branch', 'name city').sort({ createdAt: -1 });
    res.json(barbers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET single barber (Barber can get own, or admin)
router.get('/:id', verifyToken, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid ID' });
    }
    const barber = await Barber.findById(req.params.id).populate('branch', 'name city');
    if (!barber) return res.status(404).json({ message: 'Barber not found' });

    // Check access
    if (req.user.role !== 'admin' && req.user.barberRef?.toString() !== req.params.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(barber);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});


// UPDATE barber (Admin only)
router.put('/:id', verifyToken, isAdmin, async (req, res) => {
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

// DELETE barber (Admin only)
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
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