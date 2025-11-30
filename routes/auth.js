import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// ✅ EXISTING /me ENDPOINT - Keep as is
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    res.json({
      id: user.id,
      email: user.email,
      role: user.user_metadata?.role || 'user',
      barberId: user.user_metadata?.barberId,
      fullName: user.user_metadata?.full_name
    });
  } catch (error) {
    console.error('/me error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ EXISTING /verify-admin ENDPOINT - Keep as is
router.get('/verify-admin', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'No token' });
    }

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    if (user.user_metadata?.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    res.json({ message: 'Admin verified', user });
  } catch (error) {
    console.error('/verify-admin error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ NEW: LOGIN ENDPOINT (For compatibility with your LoginSignup component)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required!'
      });
    }

    // Authenticate with Supabase
    const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: password
    });

    if (authError || !authData.user) {
      console.error('Login failed:', authError?.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password!'
      });
    }

    const user = authData.user;
    const role = user.user_metadata?.role || 'user';
    const barberId = user.user_metadata?.barberId;

    console.log('✓ User logged in:', user.email, '| Role:', role);

    // Return response
    res.json({
      success: true,
      message: 'Login successful!',
      token: authData.session.access_token,
      refreshToken: authData.session.refresh_token,
      user: {
        id: user.id,
        email: user.email,
        role: role,
        barberId: barberId,
        fullName: user.user_metadata?.full_name || user.email.split('@')[0]
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login: ' + error.message
    });
  }
});

// ✅ NEW: SIGNUP ENDPOINT (For regular users only)
router.post('/signup', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required!'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters!'
      });
    }

    // Create user in Supabase
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password: password,
      email_confirm: true, // Auto-confirm for now
      user_metadata: {
        role: 'user', // Default role for signup
        full_name: email.split('@')[0]
      }
    });

    if (error) {
      console.error('Signup error:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create account'
      });
    }

    console.log('✓ New user signed up:', data.user.email);

    res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      user: {
        id: data.user.id,
        email: data.user.email
      }
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during signup: ' + error.message
    });
  }
});

// ✅ VERIFY TOKEN (Optional - for protected routes)
router.post('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.user_metadata?.role || 'user',
        barberId: user.user_metadata?.barberId
      }
    });

  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ✅ LOGOUT (Optional)
router.post('/logout', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
      await supabaseAdmin.auth.signOut(token);
    }

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;