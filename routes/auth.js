import express from 'express';
import { supabaseClient } from '../lib/supabase.js';
import User from '../models/User.js';
import Barber from '../models/Barber.js';
import Admin from '../models/Admins.js';

const router = express.Router();

// MIDDLEWARE: Verify Supabase Token
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }
  
  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error } = await supabaseClient.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    
    req.supabaseUser = user;
    next();
  } catch (err) {
    console.error('Token verification error:', err);
    return res.status(401).json({ message: 'Token verification failed' });
  }
};

// ROUTE: Health Check
router.get('/', (req, res) => {
  res.json({
    message: 'Auth API is running',
    routes: [
      'GET /api/auth/verify-admin',
      'GET /api/auth/verify-barber',
      'GET /api/auth/verify-user',
      'GET /api/auth/me'
    ]
  });
});

// ROUTE: Get Current User (Universal - any role)
router.get('/me', verifyToken, async (req, res) => {
  try {
    const { supabaseUser } = req;
    const role = supabaseUser.user_metadata?.role || 'user';

    let userData = {
      id: supabaseUser.id,
      email: supabaseUser.email,
      role: role,
      fullName: supabaseUser.user_metadata?.full_name || supabaseUser.email.split('@')[0]
    };

    // Extra details based on role
    if (role === 'admin') {
      let admin = await Admin.findOne({ supabaseId: supabaseUser.id });
      if (!admin) {
        admin = await Admin.create({
          supabaseId: supabaseUser.id,
          email: supabaseUser.email,
          fullName: supabaseUser.user_metadata?.full_name || 'Admin'
        });
      }
      userData.mongoId = admin._id;
      userData.permissions = admin.permissions;
    } else if (role === 'barber') {
      const barberId = supabaseUser.user_metadata?.barberId;
      if (barberId) {
        const barber = await Barber.findById(barberId).populate('branch');
        if (barber) {
          userData.barberId = barber._id;
          userData.branch = barber.branch;
          userData.specialties = barber.specialties;
          userData.experienceYears = barber.experienceYears;
        }
      }
    } else if (role === 'user') {
      let user = await User.findOne({ supabaseId: supabaseUser.id });
      if (!user) {
        user = await User.create({
          supabaseId: supabaseUser.id,
          email: supabaseUser.email,
          fullName: supabaseUser.user_metadata?.full_name || supabaseUser.email.split('@')[0],
          role: 'user'
        });
      }
      userData.mongoId = user._id;
      userData.phone = user.phone;
      userData.address = user.address;
      userData.city = user.city;
    }

    res.json({
      success: true,
      user: userData
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
});

// ROUTE: Verify Admin
router.get('/verify-admin', verifyToken, async (req, res) => {
  try {
    const { supabaseUser } = req;
    const role = supabaseUser.user_metadata?.role;

    if (role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied - admin only' });
    }

    // Create/update admin record
    let admin = await Admin.findOne({ supabaseId: supabaseUser.id });
    if (!admin) {
      admin = await Admin.create({
        supabaseId: supabaseUser.id,
        email: supabaseUser.email,
        fullName: supabaseUser.user_metadata?.full_name || 'Admin'
      });
    }

    res.json({
      success: true,
      message: 'Admin verified',
      user: {
        id: supabaseUser.id,
        mongoId: admin._id,
        email: supabaseUser.email,
        role: 'admin',
        fullName: admin.fullName,
        permissions: admin.permissions
      }
    });
  } catch (error) {
    console.error('Admin verification error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ROUTE: Verify Barber
router.get('/verify-barber', verifyToken, async (req, res) => {
  try {
    const { supabaseUser } = req;
    const role = supabaseUser.user_metadata?.role;
    const barberId = supabaseUser.user_metadata?.barberId;

    if (role !== 'barber') {
      return res.status(403).json({ success: false, message: 'Access denied - barber only' });
    }

    if (!barberId) {
      return res.status(400).json({ success: false, message: 'Barber ID not found' });
    }

    const barber = await Barber.findById(barberId).populate('branch', 'name city address phone');
    if (!barber) {
      return res.status(404).json({ success: false, message: 'Barber not found' });
    }

    res.json({
      success: true,
      message: 'Barber verified',
      user: {
        id: supabaseUser.id,
        barberId: barber._id,
        email: supabaseUser.email,
        role: 'barber',
        fullName: barber.name,
        branch: barber.branch,
        specialties: barber.specialties,
        experienceYears: barber.experienceYears,
        gender: barber.gender
      }
    });
  } catch (error) {
    console.error('Barber verification error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ROUTE: Verify User
router.get('/verify-user', verifyToken, async (req, res) => {
  try {
    const { supabaseUser } = req;
    const role = supabaseUser.user_metadata?.role || 'user';

    if (role !== 'user') {
      return res.status(403).json({ success: false, message: 'Access denied - user only' });
    }

    let user = await User.findOne({ supabaseId: supabaseUser.id });
    if (!user) {
      user = await User.create({
        supabaseId: supabaseUser.id,
        email: supabaseUser.email,
        role: 'user',
        fullName: supabaseUser.user_metadata?.full_name || supabaseUser.email.split('@')[0]
      });
    }

    res.json({
      success: true,
      message: 'User verified',
      user: {
        id: supabaseUser.id,
        mongoId: user._id,
        email: supabaseUser.email,
        role: 'user',
        fullName: user.fullName,
        phone: user.phone,
        address: user.address,
        city: user.city,
        profileImage: user.profileImage
      }
    });
  } catch (error) {
    console.error('User verification error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;