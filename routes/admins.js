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
      permissions: req.admin.permissions,
      assignedBranch: req.admin.assignedBranch
    }
  });
});

// ✅ Get all admins (with populated branch data)
router.get('/', authenticateAdmin, checkPermission('manage_admins'), async (req, res) => {
  try {
    console.log('[ADMINS] Fetching all admins');
    const admins = await Admin.find()
      .select('-password')
      .populate('assignedBranch', 'name city address'); // ✅ Populate branch
    console.log('[ADMINS] Found admins:', admins.length);
    res.json(admins);
  } catch (err) {
    console.error('[ADMINS] Get error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// ✅ Create new admin (with branch validation)
router.post('/', authenticateAdmin, checkPermission('manage_admins'), async (req, res) => {
  try {
    const { fullName, email, password, role, assignedBranch } = req.body;
    
    console.log('[ADMINS] Create attempt:', { fullName, email, role });
    
    // Validation
    if (!fullName || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // ✅ Validate branch for branch_admin
    if (role === 'branch_admin' && !assignedBranch) {
      return res.status(400).json({ message: 'Branch is required for Branch Admin' });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // Check if email already exists
    const existing = await Admin.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    // Password validation
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // ✅ Create admin with role-based data
    const adminData = {
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: role || 'branch_admin',
      isActive: true
    };

    // ✅ Add branch only for branch_admin
    if (role === 'branch_admin' && assignedBranch) {
      adminData.assignedBranch = assignedBranch;
    }

    const admin = new Admin(adminData);
    await admin.save();
    
    // ✅ Return admin with populated branch
    const populated = await Admin.findById(admin._id)
      .select('-password')
      .populate('assignedBranch', 'name city address');
    
    console.log('[ADMINS] Admin created successfully:', email);
    res.status(201).json(populated);
  } catch (err) {
    console.error('[ADMINS] Create error:', err);
    
    // Handle specific MongoDB errors
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

// ✅ Update admin (with branch validation)
router.put('/:id', authenticateAdmin, checkPermission('manage_admins'), async (req, res) => {
  try {
    const { fullName, email, password, role, assignedBranch } = req.body;
    
    console.log('[ADMINS] Update attempt:', req.params.id);
    
    // Build updates object
    const updates = {};
    
    if (fullName) updates.fullName = fullName.trim();
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: 'Invalid email format' });
      }
      updates.email = email.toLowerCase().trim();
    }

    // ✅ Update role and branch
    if (role) {
      updates.role = role;
      
      // If changing to branch_admin, require branch
      if (role === 'branch_admin' && !assignedBranch) {
        return res.status(400).json({ message: 'Branch is required for Branch Admin' });
      }
      
      // If changing to main_admin, remove branch
      if (role === 'main_admin') {
        updates.assignedBranch = null;
      }
    }

    // ✅ Update branch if provided
    if (assignedBranch !== undefined) {
      updates.assignedBranch = assignedBranch || null;
    }

    // Only update password if provided
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
    
    // Prevent deleting yourself
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