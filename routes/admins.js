import express from 'express';
import bcrypt from 'bcryptjs';
import Admin from '../models/Admins.js';
import { authenticateAdmin, checkPermission } from './auth.js'; 

const router = express.Router();

// TEST ROUTE
router.get('/test-auth', authenticateAdmin, async (req, res) => {
  res.json({
    success: true,
    message: 'Authentication working',
    user: { id: req.user.id, email: req.user.email, role: req.user.role },
    admin: {
      id: req.admin._id,
      email: req.admin.email,
      fullName: req.admin.fullName,
      permissions: req.admin.permissions,
      assignedBranch: req.admin.assignedBranch
    }
  });
});

// Get all admins
router.get('/', authenticateAdmin, checkPermission('manage_admins'), async (req, res) => {
  try {
    console.log('[ADMINS] Fetching all admins');
    const admins = await Admin.find()
      .select('-password')
      .populate('assignedBranch', 'name city address');
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
    const { fullName, email, password, role, assignedBranch, permissions } = req.body;
    
    console.log('[ADMINS] Create attempt:', { fullName, email, role });
    
    if (!fullName || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (role === 'branch_admin' && !assignedBranch) {
      return res.status(400).json({ message: 'Branch is required for Branch Admin' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // ✅ FIX: Check email existence properly
    const existing = await Admin.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      console.log('[ADMINS] Email already exists:', email);
      return res.status(400).json({ message: 'Email already exists' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const adminData = {
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: role || 'branch_admin',
      isActive: true,
      permissions: role === 'branch_admin' ? [
        'manage_appointments',
        'manage_barbers',
        'manage_shifts',
        'manage_services',
        'manage_leaves'
      ] : []
    };

    if (role === 'branch_admin' && assignedBranch) {
      adminData.assignedBranch = assignedBranch;
    }

    if (permissions && Array.isArray(permissions)) {
      adminData.permissions = permissions;
    }

    const admin = new Admin(adminData);
    await admin.save();
    
    const populated = await Admin.findById(admin._id)
      .select('-password')
      .populate('assignedBranch', 'name city address');
    
    console.log('[ADMINS] Admin created successfully:', email);
    res.status(201).json(populated);
  } catch (err) {
    console.error('[ADMINS] Create error:', err);
    
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Email already exists' });
    }
    
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Update admin
router.put('/:id', authenticateAdmin, checkPermission('manage_admins'), async (req, res) => {
  try {
    const { fullName, email, password, role, assignedBranch, permissions } = req.body;
    
    console.log('[ADMINS] Update attempt:', req.params.id);
    
    const updates = {};
    
    if (fullName) updates.fullName = fullName.trim();
    
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: 'Invalid email format' });
      }
      
      // ✅ FIX: Check if email exists for OTHER admins only
      const emailExists = await Admin.findOne({ 
        email: email.toLowerCase().trim(),
        _id: { $ne: req.params.id } // Exclude current admin
      });
      
      if (emailExists) {
        return res.status(400).json({ message: 'Email already exists' });
      }
      
      updates.email = email.toLowerCase().trim();
    }

    if (role) {
      updates.role = role;
      
      if (role === 'branch_admin' && !assignedBranch) {
        return res.status(400).json({ message: 'Branch is required for Branch Admin' });
      }
      
      if (role === 'main_admin') {
        updates.assignedBranch = null;
      }
    }

    if (assignedBranch !== undefined) {
      updates.assignedBranch = assignedBranch || null;
    }

    if (permissions !== undefined) {
      updates.permissions = Array.isArray(permissions) ? permissions : [];
    }

    if (password && password.trim() !== '') {
      if (password.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
      }
      updates.password = await bcrypt.hash(password, 10);
      console.log('[ADMINS] Password will be updated');
    }

    const admin = await Admin.findByIdAndUpdate(
      req.params.id, 
      updates, 
      { new: true, runValidators: true }
    )
      .select('-password')
      .populate('assignedBranch', 'name city address');
    
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    console.log('[ADMINS] Admin updated successfully:', admin.email);
    res.json(admin);
  } catch (err) {
    console.error('[ADMINS] Update error:', err);
    
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Email already exists' });
    }
    
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Delete admin
router.delete('/:id', authenticateAdmin, checkPermission('manage_admins'), async (req, res) => {
  try {
    console.log('[ADMINS] Delete attempt:', req.params.id);
    
    if (req.user.id === req.params.id || req.admin._id.toString() === req.params.id) {
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