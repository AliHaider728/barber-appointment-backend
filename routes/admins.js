import express from 'express';
import bcrypt from 'bcryptjs';
import Admin from '../models/Admins.js';
import { authenticateAdmin, checkPermission } from './auth.js'; 
import { generateOTP, sendOTPEmail, sendWelcomeEmail } from './../utils/email.js';

const router = express.Router();

// Clear duplicate emails on startup
router.get('/admin/clear-duplicates', async (req, res) => {
  try {
    const admins = await Admin.find();
    const emailMap = {};
    const duplicates = [];

    for (const admin of admins) {
      if (emailMap[admin.email]) {
        duplicates.push(admin._id);
      } else {
        emailMap[admin.email] = admin._id;
      }
    }

    if (duplicates.length > 0) {
      await Admin.deleteMany({ _id: { $in: duplicates } });
      console.log('[ADMINS] Deleted duplicate admins:', duplicates.length);
    }

    res.json({ message: 'Duplicates cleared', deleted: duplicates.length });
  } catch (err) {
    console.error('[ADMINS] Clear duplicates error:', err);
    res.status(500).json({ message: 'Error clearing duplicates' });
  }
});

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
      .select('-password -emailVerificationOTP -otpExpiry')
      .populate('assignedBranch', 'name city address');
    console.log('[ADMINS] Found admins:', admins.length);
    res.json(admins);
  } catch (err) {
    console.error('[ADMINS] Get error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Step 1: Request admin creation (sends OTP)
router.post('/request-creation', authenticateAdmin, checkPermission('manage_admins'), async (req, res) => {
  try {
    const { fullName, email } = req.body;
    
    console.log('[ADMINS] Creation request:', { fullName, email });
    
    if (!fullName || !email) {
      return res.status(400).json({ message: 'Full name and email are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    const lowerEmail = email.toLowerCase().trim();

    let admin = await Admin.findOne({ email: lowerEmail });

    if (admin) {
      if (admin.isEmailVerified) {
        console.log('[ADMINS] Verified email already exists:', email);
        return res.status(400).json({ message: 'Email already in use by a verified account. Use a different email.' });
      } else {
        // Reuse pending admin, update details and send new OTP
        console.log('[ADMINS] Reusing pending admin:', email);
        
        const otp = generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

        admin.fullName = fullName.trim();
        admin.emailVerificationOTP = otp;
        admin.otpExpiry = otpExpiry;
        
        await admin.save();

        await sendOTPEmail(admin.email, otp, admin.fullName);
        
        return res.status(200).json({ 
          message: 'New verification code sent to email for pending account',
          adminId: admin._id,
          email: admin.email
        });
      }
    } else {
      // Create new pending admin
      const otp = generateOTP();
      const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

      admin = new Admin({
        fullName: fullName.trim(),
        email: lowerEmail,
        isActive: false,
        isEmailVerified: false,
        emailVerificationOTP: otp,
        otpExpiry: otpExpiry
      });

      await admin.save();

      await sendOTPEmail(admin.email, otp, admin.fullName);
      
      console.log('[ADMINS] OTP sent to new email:', email);
      res.status(200).json({ 
        message: 'Verification code sent to email',
        adminId: admin._id,
        email: admin.email
      });
    }
  } catch (err) {
    console.error('[ADMINS] Request creation error:', err);
    
    // Handle duplicate key error
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      const value = err.keyValue[field];
      return res.status(400).json({ 
        message: `${field} '${value}' already exists. Please use a different ${field}.` 
      });
    }
    
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Step 2: Verify OTP
router.post('/verify-otp', authenticateAdmin, checkPermission('manage_admins'), async (req, res) => {
  try {
    const { adminId, otp } = req.body;
    
    console.log('[ADMINS] OTP verification attempt:', { adminId, otp });
    
    if (!adminId || !otp) {
      return res.status(400).json({ message: 'Admin ID and OTP are required' });
    }

    const admin = await Admin.findById(adminId).populate('assignedBranch', 'name city address');
    
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    if (admin.isEmailVerified) {
      return res.status(400).json({ message: 'Email already verified' });
    }

    if (!admin.emailVerificationOTP) {
      return res.status(400).json({ message: 'No verification code found. Please request a new one.' });
    }

    if (admin.otpExpiry < new Date()) {
      return res.status(400).json({ message: 'Verification code expired. Please request a new one.' });
    }

    if (admin.emailVerificationOTP !== otp.trim()) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }

    // Verify email
    admin.isEmailVerified = true;
    admin.emailVerificationOTP = undefined;
    admin.otpExpiry = undefined;
    await admin.save();

    const populated = await Admin.findById(admin._id)
      .select('-password -emailVerificationOTP -otpExpiry')
      .populate('assignedBranch', 'name city address');
    
    console.log('[ADMINS] Email verified:', admin.email);
    res.json({ 
      message: 'Email verified successfully! Proceed to complete setup.',
      admin: populated
    });
  } catch (err) {
    console.error('[ADMINS] OTP verification error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Resend OTP
router.post('/resend-otp', authenticateAdmin, checkPermission('manage_admins'), async (req, res) => {
  try {
    const { adminId } = req.body;
    
    if (!adminId) {
      return res.status(400).json({ message: 'Admin ID is required' });
    }

    const admin = await Admin.findById(adminId);
    
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    if (admin.isEmailVerified) {
      return res.status(400).json({ message: 'Email already verified' });
    }

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    admin.emailVerificationOTP = otp;
    admin.otpExpiry = otpExpiry;
    await admin.save();

    await sendOTPEmail(admin.email, otp, admin.fullName);
    
    console.log('[ADMINS] OTP resent to:', admin.email);
    res.json({ message: 'New verification code sent to email' });
  } catch (err) {
    console.error('[ADMINS] Resend OTP error:', err);
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
      
      const lowerEmail = email.toLowerCase().trim();
      const emailExists = await Admin.findOne({ 
        email: lowerEmail,
        _id: { $ne: req.params.id }
      });
      
      if (emailExists) {
        return res.status(400).json({ message: 'Email already in use. Please use a different email.' });
      }
      
      updates.email = lowerEmail;
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

    let admin = await Admin.findByIdAndUpdate(
      req.params.id, 
      updates, 
      { new: true, runValidators: true }
    )
      .populate('assignedBranch', 'name city address');

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    if (!admin.isActive && admin.isEmailVerified && admin.password && admin.role) {
      admin.isActive = true;
      await admin.save();

      await sendWelcomeEmail(
        admin.email, 
        admin.fullName, 
        admin.role, 
        admin.assignedBranch
      );
      console.log('[ADMINS] Admin activated and welcome email sent:', admin.email);
    }

    admin = await Admin.findById(admin._id)
      .select('-password -emailVerificationOTP -otpExpiry')
      .populate('assignedBranch', 'name city address');

    console.log('[ADMINS] Admin updated successfully:', admin.email);
    res.json(admin);
  } catch (err) {
    console.error('[ADMINS] Update error:', err);
    
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      const value = err.keyValue[field];
      return res.status(400).json({ 
        message: `${field} '${value}' already exists. Please use a different ${field}.` 
      });
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