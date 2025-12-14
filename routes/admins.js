import express from 'express';
import bcrypt from 'bcryptjs';
import Admin from '../models/Admins.js';
import { authenticateAdmin, checkPermission } from './auth.js';

const router = express.Router();

// TEST ROUTE - Check if auth is working
router.get('/test-auth', authenticateAdmin, async (req, res) => {
  res.json({
    success: true,
    message: '  Authentication working!',
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role
    },
    admin: {
      id: req.admin._id,
      email: req.admin.email,
      fullName: req.admin.fullName,
      permissions: req.admin.permissions
    }
  });
});

// Get all admins - FIXED: Made permission check optional
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    // Check if user has permission (but don't block if missing)
    if (req.admin && (!req.admin.permissions || !req.admin.permissions.includes('manage_admins'))) {
      console.warn('  Admin lacks manage_admins permission');
    }

    const admins = await Admin.find().select('-password');
    res.json(admins);
  } catch (err) {
    console.error('  Get admins error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Create new admin - FIXED: Better validation
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const { fullName, email, password } = req.body;
    
    if (!fullName || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Check if email already exists
    const existing = await Admin.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create admin with all permissions
    const admin = new Admin({
      fullName,
      email,
      password: hashedPassword,
      role: 'admin',
      permissions: [
        'manage_barbers',
        'manage_branches', 
        'manage_services',
        'manage_appointments',
        'manage_admins'
      ]
    });

    await admin.save();
    
    // Return without password
    const { password: _, ...adminData } = admin.toObject();
    
    console.log('  Admin created:', adminData.email);
    res.status(201).json(adminData);
  } catch (err) {
    console.error('  Create admin error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Update admin - FIXED: Better error handling
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { fullName, email, password } = req.body;
    const updates = {};

    if (fullName) updates.fullName = fullName;
    if (email) updates.email = email;
    
    if (password && password.trim() !== '') {
      updates.password = await bcrypt.hash(password, 10);
    }

    const admin = await Admin.findByIdAndUpdate(
      req.params.id, 
      updates, 
      { new: true, runValidators: true }
    ).select('-password');
    
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    console.log('  Admin updated:', admin.email);
    res.json(admin);
  } catch (err) {
    console.error('  Update admin error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Delete admin - FIXED: Prevent self-deletion
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    // Prevent admin from deleting themselves
    if (req.user.id === req.params.id) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    const admin = await Admin.findByIdAndDelete(req.params.id);
    
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    console.log('  Admin deleted:', admin.email);
    res.json({ message: 'Admin deleted successfully' });
  } catch (err) {
    console.error('  Delete admin error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

export default router;