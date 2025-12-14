import express from 'express';
import bcrypt from 'bcryptjs';
import Admin from '../models/Admins.js';
import { authenticateAdmin, checkPermission } from './auth.js'; 

const router = express.Router();

// TEST ROUTE - Check auth and permissions
router.get('/test-auth', authenticateAdmin, async (req, res) => {
  res.json({
    success: true,
    message: 'Authentication working',
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

// Get all admins
router.get('/', authenticateAdmin, checkPermission('manage_admins'), async (req, res) => {
  try {
    console.log('[ADMINS] Fetching all admins');
    const admins = await Admin.find().select('-password');
    console.log('[ADMINS] Found admins:', admins.length);
    res.json(admins);
  } catch (err) {
    console.error('[ADMINS] Get error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Create new admin
router.post('/', authenticateAdmin, checkPermission('manage_admins'), async (req, res) => {
  try {
    const { fullName, email, password } = req.body;
    
    console.log('[ADMINS] Create attempt:', { fullName, email });
    
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
      permissions: ['manage_barbers', 'manage_branches', 'manage_services', 'manage_appointments', 'manage_admins']
    });

    await admin.save();
    const { password: _, ...adminData } = admin.toObject();
    
    console.log('[ADMINS] Admin created successfully:', email);
    res.status(201).json(adminData);
  } catch (err) {
    console.error('[ADMINS] Create error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Update admin
router.put('/:id', authenticateAdmin, checkPermission('manage_admins'), async (req, res) => {
  try {
    const { fullName, email, password } = req.body;
    
    console.log('[ADMINS] Update attempt:', req.params.id);
    
    const updates = { fullName, email };

    if (password && password.trim() !== '') {
      updates.password = await bcrypt.hash(password, 10);
      console.log('[ADMINS] Password will be updated');
    }

    const admin = await Admin.findByIdAndUpdate(
      req.params.id, 
      updates, 
      { new: true }
    ).select('-password');
    
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    console.log('[ADMINS] Admin updated successfully:', admin.email);
    res.json(admin);
  } catch (err) {
    console.error('[ADMINS] Update error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Delete admin
router.delete('/:id', authenticateAdmin, checkPermission('manage_admins'), async (req, res) => {
  try {
    console.log('[ADMINS] Delete attempt:', req.params.id);
    
    // Prevent deleting yourself
    if (req.user.id === req.params.id) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }
    
    const admin = await Admin.findByIdAndDelete(req.params.id);
    
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    console.log('[ADMINS] Admin deleted successfully:', admin.email);
    res.json({ message: 'Admin deleted successfully' });
  } catch (err) {
    console.error('[ADMINS] Delete error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

export default router;