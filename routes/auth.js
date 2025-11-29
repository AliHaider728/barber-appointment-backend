import express from 'express';
import { supabaseClient } from '../lib/supabase.js';
import User from '../models/User.js';
import Barber from '../models/Barber.js';

const router = express.Router();

// Middleware: Verify Supabase Token
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error } = await supabaseClient.auth.getUser(token);
    if (error || !user) return res.status(401).json({ message: 'Invalid token' });
    req.supabaseUser = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token verification failed' });
  }
};

// GET /api/auth/verify-role → Yeh wahi route jo frontend call karta hai
router.get('/verify-role', verifyToken, async (req, res) => {
  try {
    const { supabaseUser } = req;

    let mongoUser = await User.findOne({ supabaseId: supabaseUser.id });

    if (!mongoUser) {
      mongoUser = await User.create({
        supabaseId: supabaseUser.id,
        email: supabaseUser.email,
        role: supabaseUser.user_metadata?.role || 'user',
        fullName: supabaseUser.user_metadata?.fullName || ''
      });
    }

    let barberDetails = null;
    if (mongoUser.role === 'barber' && mongoUser.barberRef) {
      barberDetails = await Barber.findById(mongoUser.barberRef).populate('branch').lean();
    }

    res.json({
      success: true,
      user: {
        id: mongoUser._id,
        email: mongoUser.email,
        role: mongoUser.role,
        fullName: mongoUser.fullName || supabaseUser.email.split('@')[0],
        barberRef: mongoUser.barberRef,
        barberDetails
      }
    });
  } catch (error) {
    console.error('Verify role error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;