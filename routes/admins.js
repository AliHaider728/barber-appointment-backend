import express from 'express';
import bcrypt from 'bcryptjs';
import Admin from '../models/Admins.js';
import { authenticateAdmin, checkPermission } from './auth.js'; 

const router = express.Router();

// Get all admins
router.get('/', authenticateAdmin, checkPermission('manage_admins'), async (req, res) => {
  try {
    const admins = await Admin.find().select('-password');
    res.json(admins);
  } catch (err) {
    console.error('Get admins error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new admin
router.post('/', authenticateAdmin, checkPermission('manage_admins'), async (req, res) => {
  try {
    const { fullName, email, password } = req.body;
    
    if (!fullName || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const existing = await Admin.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const admin = new Admin({
      fullName,
      email,
      password: hashedPassword,
    });

    await admin.save();
    const { password: _, ...adminData } = admin.toObject();
    res.status(201).json(adminData);
  } catch (err) {
    console.error('Create admin error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update admin
router.put('/:id', authenticateAdmin, checkPermission('manage_admins'), async (req, res) => {
  try {
    const { fullName, email, password } = req.body;
    const updates = { fullName, email };

    if (password) {
      updates.password = await bcrypt.hash(password, 10);
    }

    const admin = await Admin.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password');
    
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    res.json(admin);
  } catch (err) {
    console.error('Update admin error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete admin
router.delete('/:id', authenticateAdmin, checkPermission('manage_admins'), async (req, res) => {
  try {
    const admin = await Admin.findByIdAndDelete(req.params.id);
    
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    res.json({ message: 'Admin deleted successfully' });
  } catch (err) {
    console.error('Delete admin error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;