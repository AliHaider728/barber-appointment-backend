import express from 'express';
import bcrypt from 'bcryptjs';
import Admin from '../models/Admins.js';
import { authenticateAdmin, checkPermission } from './auth.js';

const router = express.Router();

// Get all admins (sirf main admin dekh sakta hai)
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    // Agar branch admin hai, toh sirf apni info dikhao
    if (req.admin.role === 'branch_admin') {
      const admin = await Admin.findById(req.admin._id)
        .select('-password')
        .populate('assignedBranch', 'name city address');
      return res.json([admin]);
    }

    // Main admin ko sab admins dikhaao
    const admins = await Admin.find()
      .select('-password')
      .populate('assignedBranch', 'name city address');
    res.json(admins);
  } catch (err) {
    console.error('[ADMINS] Get error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Create new admin (sirf main admin kar sakta hai)
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    // Sirf main admin naye admins bana sakta hai
    if (req.admin.role !== 'main_admin') {
      return res.status(403).json({ 
        message: 'Only Main Admin can create new admins' 
      });
    }

    const { fullName, email, password, role, assignedBranch } = req.body;
    
    if (!fullName || !email || !password || !role) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Branch admin ke liye branch required hai
    if (role === 'branch_admin' && !assignedBranch) {
      return res.status(400).json({ 
        message: 'Branch is required for Branch Admin' 
      });
    }

    const existing = await Admin.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const adminData = {
      fullName,
      email,
      password: hashedPassword,
      role
    };

    // Agar branch admin hai toh branch assign karo
    if (role === 'branch_admin') {
      adminData.assignedBranch = assignedBranch;
    }

    const admin = new Admin(adminData);
    await admin.save();

    const populatedAdmin = await Admin.findById(admin._id)
      .select('-password')
      .populate('assignedBranch', 'name city address');
    
    res.status(201).json(populatedAdmin);
  } catch (err) {
    console.error('[ADMINS] Create error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Update admin
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { fullName, email, password, role, assignedBranch } = req.body;
    
    // Branch admin apni hi profile update kar sakta hai
    if (req.admin.role === 'branch_admin' && req.admin._id.toString() !== req.params.id) {
      return res.status(403).json({ 
        message: 'You can only update your own profile' 
      });
    }

    const updates = { fullName, email };

    // Sirf main admin role change kar sakta hai
    if (req.admin.role === 'main_admin' && role) {
      updates.role = role;
      if (role === 'branch_admin' && assignedBranch) {
        updates.assignedBranch = assignedBranch;
      }
    }

    if (password && password.trim() !== '') {
      updates.password = await bcrypt.hash(password, 10);
    }

    const admin = await Admin.findByIdAndUpdate(
      req.params.id, 
      updates, 
      { new: true }
    )
    .select('-password')
    .populate('assignedBranch', 'name city address');
    
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    res.json(admin);
  } catch (err) {
    console.error('[ADMINS] Update error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Delete admin (sirf main admin kar sakta hai)
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    if (req.admin.role !== 'main_admin') {
      return res.status(403).json({ 
        message: 'Only Main Admin can delete admins' 
      });
    }
    
    if (req.user.id === req.params.id) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }
    
    const admin = await Admin.findByIdAndDelete(req.params.id);
    
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    res.json({ message: 'Admin deleted successfully' });
  } catch (err) {
    console.error('[ADMINS] Delete error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

export default router;