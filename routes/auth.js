import express from 'express';
import { supabaseClient } from '../lib/supabase.js';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';   

const router = express.Router();

// Middleware to verify Supabase JWT
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
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
    res.status(401).json({ message: 'Token verification failed' });
  }
};

// SIGNUP (Uses Supabase Auth, then sync to MongoDB)
router.post('/signup', async (req, res) => {
  const { email, password, role = 'user' } = req.body;  // Role: 'admin' only if you want

  try {
    // Supabase mein user banao
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { role } }  // Custom metadata for role
    });

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    if (data.user) {
      // MongoDB mein sync karo (optional, for extra data)
      const newUser = new User({
        supabaseId: data.user.id,
        email: data.user.email,
        role: data.user.user_metadata?.role || 'user'
      });
      await newUser.save();
    }

    // Email confirmation link Supabase bhej dega (if enabled in dashboard)
    res.status(201).json({ 
      message: 'User created! Check email for confirmation.', 
      user: data.user 
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// LOGIN (Supabase Auth)
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    if (data.user) {
      // Optional: MongoDB se role fetch karo
      const mongoUser = await User.findOne({ supabaseId: data.user.id });
      const role = mongoUser?.role || data.user.user_metadata?.role || 'user';

      res.json({ 
        token: data.session.access_token,  // Supabase JWT
        role,
        user: { id: data.user.id, email: data.user.email }
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// VERIFY ADMIN (For admin-only access)
router.get('/verify-admin', verifyToken, async (req, res) => {
  const { supabaseUser } = req;
  const mongoUser = await User.findOne({ supabaseId: supabaseUser.id });

  if (!mongoUser || mongoUser.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admins only.' });
  }

  res.json({ 
    message: 'Admin verified', 
    user: { email: supabaseUser.email, role: mongoUser.role } 
  });
});

// Logout (Supabase)
router.post('/logout', verifyToken, async (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  const { error } = await supabaseClient.auth.signOut(token);
  if (error) return res.status(400).json({ message: error.message });
  res.json({ message: 'Logged out' });
});

export default router;