import express from 'express';
import bcrypt from 'bcryptjs';
import Admin from '../models/Admins.js';
import { authenticateAdmin, checkPermission } from './auth.js'; 
import { generateOTP, sendOTPEmail, sendWelcomeEmail } from '../utils/email.js';

const router = express.Router();

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
    const { fullName, email, password, role, assignedBranch } = req.body;
    
    console.log('[ADMINS] Creation request:', { fullName, email, role });
    
    // Validation
    if (!fullName || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (role === 'branch_admin' && !assignedBranch) {
      return res.status(400).json({ message: 'Branch is required for Branch Admin' });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // 🔥 FIX: Check if email already exists (including unverified accounts)
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await Admin.findOne({ email: normalizedEmail });
    
    if (existing) {
      if (existing.isEmailVerified) {
        console.log('[ADMINS] Email already verified and exists:', email);
        return res.status(400).json({ message: 'This email is already registered with a verified account' });
      } else {
        // Delete old unverified account and create new one
        console.log('[ADMINS] Removing old unverified account for:', email);
        await Admin.findByIdAndDelete(existing._id);
      }
    }

    // Password validation
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create temporary admin (not verified)
    const adminData = {
      fullName: fullName.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: role || 'branch_admin',
      isActive: false,
      isEmailVerified: false,
      emailVerificationOTP: otp,
      otpExpiry: otpExpiry
    };

    if (role === 'branch_admin' && assignedBranch) {
      adminData.assignedBranch = assignedBranch;
    }

    const admin = new Admin(adminData);
    await admin.save();

    // Send OTP email
    try {
      await sendOTPEmail(normalizedEmail, otp, fullName);
      console.log('[ADMINS] OTP sent to:', normalizedEmail);
    } catch (emailError) {
      // If email fails, delete the created admin
      await Admin.findByIdAndDelete(admin._id);
      throw new Error('Failed to send verification email. Please try again.');
    }
    
    res.status(200).json({ 
      message: 'Verification code sent to email',
      adminId: admin._id,
      email: admin.email
    });
  } catch (err) {
    console.error('[ADMINS] Request creation error:', err);
    
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Email already exists' });
    }
    
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// Step 2: Verify OTP and activate admin
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

    // Activate admin
    admin.isEmailVerified = true;
    admin.isActive = true;
    admin.emailVerificationOTP = undefined;
    admin.otpExpiry = undefined;
    await admin.save();

    // Send welcome email
    try {
      await sendWelcomeEmail(
        admin.email, 
        admin.fullName, 
        admin.role, 
        admin.assignedBranch
      );
    } catch (emailError) {
      console.error('[ADMINS] Welcome email failed:', emailError);
      // Don't fail the verification if welcome email fails
    }

    const populated = await Admin.findById(admin._id)
      .select('-password -emailVerificationOTP -otpExpiry')
      .populate('assignedBranch', 'name city address');
    
    console.log('[ADMINS] Admin verified and activated:', admin.email);
    res.json({ 
      message: 'Email verified successfully! Admin account is now active.',
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

    // Generate new OTP
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    admin.emailVerificationOTP = otp;
    admin.otpExpiry = otpExpiry;
    await admin.save();

    // Send OTP email
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
      
      const normalizedEmail = email.toLowerCase().trim();
      
      const emailExists = await Admin.findOne({ 
        email: normalizedEmail,
        _id: { $ne: req.params.id }
      });
      
      if (emailExists) {
        return res.status(400).json({ message: 'Email already exists' });
      }
      
      updates.email = normalizedEmail;
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
      .select('-password -emailVerificationOTP -otpExpiry')
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