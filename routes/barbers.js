import express from 'express';
import Barber from '../models/Barber.js';
import mongoose from 'mongoose';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

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

// ✅ CREATE - Barber Add (With Better Validation)
router.post('/', async (req, res) => {
  try {
    console.log('POST /api/barbers - Received:', req.body);

    const { name, experienceYears, gender, specialties, branch, email, password } = req.body;

    // Validation
    if (!name || !experienceYears || !gender || !branch || !email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Name, experience, gender, branch, email aur password required hain!' 
      });
    }

    // ✅ Password length check
    if (password.length < 6) {
      return res.status(400).json({ 
        success: false,
        message: 'Password kam se kam 6 characters ka hona chahiye!' 
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

    // Check duplicate email in MongoDB
    const existingEmail = await Barber.findOne({ email: email.trim().toLowerCase() });
    if (existingEmail) {
      return res.status(400).json({ 
        success: false,
        message: 'Ye email pehle se use ho raha hai!' 
      });
    }

    // ✅ Step 1: Create Supabase user FIRST
    const { data: supabaseUser, error: supabaseError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password: password,
      email_confirm: true,
      user_metadata: { 
        role: 'barber',
        full_name: name.trim()
      }
    });

    if (supabaseError) {
      console.error('Supabase user creation failed:', supabaseError);
      return res.status(400).json({ 
        success: false,
        message: 'Authentication setup failed: ' + supabaseError.message 
      });
    }

    // ✅ Step 2: Create barber in MongoDB with userId
    const barber = new Barber({
      name: name.trim(),
      experienceYears: Number(experienceYears),
      gender: gender.toLowerCase(),
      specialties: parsedSpecialties,
      branch,
      email: email.trim().toLowerCase(),
      userId: supabaseUser.user.id // Store Supabase user ID
    });

    await barber.save();

    // ✅ Step 3: Update Supabase user metadata with barberId
    await supabaseAdmin.auth.admin.updateUserById(supabaseUser.user.id, {
      user_metadata: { 
        role: 'barber',
        barberId: barber._id.toString(),
        full_name: name.trim()
      }
    });

    const populated = await Barber.findById(barber._id).populate('branch', 'name city');

    console.log('✓ New Barber Created:', populated.name);
    res.status(201).json(populated);

  } catch (error) {
    console.error('Barber Create Error:', error);

    // MongoDB Duplicate Key Error
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false,
        message: 'Barber with this name or email already exists!' 
      });
    }

    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + error.message 
    });
  }
});

// ✅ GET all barbers
router.get('/', async (req, res) => {
  try {
    const barbers = await Barber.find()
      .populate('branch', 'name city')
      .sort({ createdAt: -1 });
    res.json(barbers);
  } catch (error) {
    console.error('Get barbers error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ✅ GET single barber
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid ID' });
    }
    const barber = await Barber.findById(req.params.id).populate('branch', 'name city');
    if (!barber) return res.status(404).json({ message: 'Barber not found' });
    res.json(barber);
  } catch (error) {
    console.error('Get barber error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ UPDATE barber
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, experienceYears, gender, specialties, branch, email, password } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(branch)) {
      return res.status(400).json({ message: 'Invalid ID' });
    }

    if (!email) {
      return res.status(400).json({ message: 'Email required' });
    }

    const parsedSpecialties = parseSpecialties(specialties || []);
    if (parsedSpecialties.length === 0) {
      return res.status(400).json({ message: 'At least one specialty required' });
    }

    // Find existing barber
    const barber = await Barber.findById(id);
    if (!barber) return res.status(404).json({ message: 'Barber not found' });

    // Check if email changed and if new email is unique
    const newEmail = email.trim().toLowerCase();
    if (newEmail !== barber.email) {
      const existingEmail = await Barber.findOne({ email: newEmail });
      if (existingEmail) {
        return res.status(400).json({ message: 'This email is already in use' });
      }
    }

    // Update MongoDB
    const updatedData = {
      name: name.trim(),
      experienceYears: Number(experienceYears),
      gender: gender.toLowerCase(),
      specialties: parsedSpecialties,
      branch,
      email: newEmail
    };

    const updated = await Barber.findByIdAndUpdate(id, updatedData, { 
      new: true, 
      runValidators: true 
    });

    // ✅ Update Supabase if needed
    if (barber.userId) {
      const supabaseUpdate = {
        user_metadata: {
          role: 'barber',
          barberId: barber._id.toString(),
          full_name: name.trim()
        }
      };
      
      if (newEmail !== barber.email) {
        supabaseUpdate.email = newEmail;
      }
      
      // ⚠️ Password update - Only if provided
      if (password && password.trim() && password.length >= 6) {
        supabaseUpdate.password = password.trim();
      }

      const { error } = await supabaseAdmin.auth.admin.updateUserById(
        barber.userId, 
        supabaseUpdate
      );
      
      if (error) {
        console.error('Supabase update error:', error);
        // Don't fail the whole operation, just log
        console.warn('⚠️ MongoDB updated but Supabase sync failed');
      }
    }

    const populated = await Barber.findById(updated._id).populate('branch', 'name city');
    console.log('✓ Barber Updated:', populated.name);
    res.json(populated);

  } catch (error) {
    console.error('Update error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Barber name or email already exists' });
    }
    res.status(500).json({ message: error.message });
  }
});

// ✅ DELETE barber
router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid ID' });
    }
    
    const barber = await Barber.findById(req.params.id);
    if (!barber) return res.status(404).json({ message: 'Not found' });

    // ✅ Delete from Supabase first
    if (barber.userId) {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(barber.userId);
      if (error) {
        console.error('Supabase delete error:', error);
        // Continue anyway - we still want to delete from MongoDB
      }
    }

    // Delete from MongoDB
    await Barber.deleteOne({ _id: req.params.id });
    
    console.log('✓ Barber Deleted:', barber.name);
    res.json({ success: true, message: 'Barber deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;