// routes/barbers.js (updated with stepped creation like admins: request-creation, verify-otp, resend-otp, update)
import express from 'express';
import bcrypt from 'bcryptjs';
import Barber from '../models/Barber.js';
import mongoose from 'mongoose';
import { generateOTP, sendOTPEmail, sendWelcomeEmail } from './../utils/email.js';
import { authenticateAdmin, checkPermission } from './auth.js';  // Assuming you have these for protection

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

// Step 1: Request barber creation (sends OTP) - Protected
router.post('/request-creation', authenticateAdmin, checkPermission('manage_barbers'), async (req, res) => {
  try {
    const { name, email } = req.body;
    
    console.log('[BARBERS] Creation request:', { name, email });
    
    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    const lowerEmail = email.toLowerCase().trim();

    let barber = await Barber.findOne({ email: lowerEmail });

    if (barber) {
      if (barber.isEmailVerified) {
        console.log('[BARBERS] Verified email already exists:', email);
        return res.status(400).json({ message: 'Email already in use by a verified account. Use a different email.' });
      } else {
        // Reuse pending barber, update details and send new OTP
        console.log('[BARBERS] Reusing pending barber:', email);
        
        const otp = generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

        barber.name = name.trim();
        barber.emailVerificationOTP = otp;
        barber.otpExpiry = otpExpiry;
        
        await barber.save();

        await sendOTPEmail(barber.email, otp, barber.name);
        
        return res.status(200).json({ 
          message: 'New verification code sent to email for pending account',
          barberId: barber._id,
          email: barber.email
        });
      }
    } else {
      // Create new pending barber
      const otp = generateOTP();
      const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

      barber = new Barber({
        name: name.trim(),
        email: lowerEmail,
        isActive: false,
        isEmailVerified: false,
        emailVerificationOTP: otp,
        otpExpiry: otpExpiry
      });

      await barber.save();

      await sendOTPEmail(barber.email, otp, barber.name);
      
      console.log('[BARBERS] OTP sent to new email:', email);
      res.status(200).json({ 
        message: 'Verification code sent to email',
        barberId: barber._id,
        email: barber.email
      });
    }
  } catch (err) {
    console.error('[BARBERS] Request creation error:', err);
    
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

// Step 2: Verify OTP - Protected
router.post('/verify-otp', authenticateAdmin, checkPermission('manage_barbers'), async (req, res) => {
  try {
    const { barberId, otp } = req.body;
    
    console.log('[BARBERS] OTP verification attempt:', { barberId, otp });
    
    if (!barberId || !otp) {
      return res.status(400).json({ message: 'Barber ID and OTP are required' });
    }

    const barber = await Barber.findById(barberId).populate('branch', 'name city address');
    
    if (!barber) {
      return res.status(404).json({ message: 'Barber not found' });
    }

    if (barber.isEmailVerified) {
      return res.status(400).json({ message: 'Email already verified' });
    }

    if (!barber.emailVerificationOTP) {
      return res.status(400).json({ message: 'No verification code found. Please request a new one.' });
    }

    if (barber.otpExpiry < new Date()) {
      return res.status(400).json({ message: 'Verification code expired. Please request a new one.' });
    }

    if (barber.emailVerificationOTP !== otp.trim()) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }

    // Verify email
    barber.isEmailVerified = true;
    barber.emailVerificationOTP = undefined;
    barber.otpExpiry = undefined;
    await barber.save();

    const populated = await Barber.findById(barber._id)
      .select('-password -emailVerificationOTP -otpExpiry')
      .populate('branch', 'name city address');
    
    console.log('[BARBERS] Email verified:', barber.email);
    res.json({ 
      message: 'Email verified successfully! Proceed to complete setup.',
      barber: populated
    });
  } catch (err) {
    console.error('[BARBERS] OTP verification error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Resend OTP - Protected
router.post('/resend-otp', authenticateAdmin, checkPermission('manage_barbers'), async (req, res) => {
  try {
    const { barberId } = req.body;
    
    if (!barberId) {
      return res.status(400).json({ message: 'Barber ID is required' });
    }

    const barber = await Barber.findById(barberId);
    
    if (!barber) {
      return res.status(404).json({ message: 'Barber not found' });
    }

    if (barber.isEmailVerified) {
      return res.status(400).json({ message: 'Email already verified' });
    }

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    barber.emailVerificationOTP = otp;
    barber.otpExpiry = otpExpiry;
    await barber.save();

    await sendOTPEmail(barber.email, otp, barber.name);
    
    console.log('[BARBERS] OTP resent to:', barber.email);
    res.json({ message: 'New verification code sent to email' });
  } catch (err) {
    console.error('[BARBERS] Resend OTP error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// GET all barbers - Protected if needed
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

// UPDATE barber (complete setup or edit) - Protected
router.put('/:id', authenticateAdmin, checkPermission('manage_barbers'), async (req, res) => {
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

    // For new barbers, ensure email is verified before setting other details
    if (!barber.isEmailVerified) {
      return res.status(400).json({ message: 'Email must be verified first' });
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

    // Activate if all required fields are set
    if (!updated.isActive && updated.password && updated.gender && updated.branch && updated.specialties.length > 0) {
      updated.isActive = true;
      await updated.save();

      await sendWelcomeEmail(
        updated.email, 
        updated.name, 
        'barber',  // Role for barber
        updated.branch  // Assuming branch is populated if needed
      );
      console.log('[BARBERS] Barber activated and welcome email sent:', updated.email);
    }

    const populated = await Barber.findById(updated._id)
      .select('-password -emailVerificationOTP -otpExpiry')
      .populate('branch', 'name city');
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

// DELETE barber - Protected
router.delete('/:id', authenticateAdmin, checkPermission('manage_barbers'), async (req, res) => {
  try {
    console.log('[BARBERS] Delete attempt:', req.params.id);
    
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid ID' });
    }
    
    const barber = await Barber.findByIdAndDelete(req.params.id);
    
    if (!barber) {
      return res.status(404).json({ message: 'Barber not found' });
    }
    
    console.log('[BARBERS] Barber deleted successfully:', barber.email);
    res.json({ message: 'Barber deleted successfully' });
  } catch (err) {
    console.error('[BARBERS] Delete error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

export default router;