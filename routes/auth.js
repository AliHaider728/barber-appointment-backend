// Updated backend/routes/auth.js with /login and /signup routes added
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Barber from '../models/Barber.js';
import Admin from '../models/Admins.js';

const router = express.Router();

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

// MIDDLEWARE: Verify JWT Token
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }
  
  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Token verification error:', err);
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// ROUTE: Health Check
router.get('/', (req, res) => {
  res.json({
    message: 'Auth API is running',
    routes: [
      'POST /api/auth/google',
      'GET /api/auth/me',
      'GET /api/auth/verify-admin',
      'GET /api/auth/verify-barber',
      'GET /api/auth/verify-user'
    ]
  });
});

// ROUTE: Google OAuth Login
router.post('/google', async (req, res) => {
  try {
    const { token } = req.body;

    // Verify Google token
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);
    const googleUser = await response.json();

    if (googleUser.error) {
      return res.status(401).json({ message: 'Invalid Google token' });
    }

    const { email, name, picture } = googleUser;

    // Check if user exists
    let user = await User.findOne({ email });
    let role = 'user';
    let userId = null;

    if (!user) {
      // Check if barber
      const barber = await Barber.findOne({ email });
      if (barber) {
        role = 'barber';
        userId = barber._id;
      } else {
        // Check if admin
        const admin = await Admin.findOne({ email });
        if (admin) {
          role = 'admin';
          userId = admin._id;
        } else {
          // Create new user
          user = await User.create({
            email,
            fullName: name,
            profileImage: picture,
            role: 'user'
          });
          userId = user._id;
        }
      }
    } else {
      userId = user._id;
    }

    // Generate JWT
    const jwtToken = jwt.sign(
      { 
        id: userId.toString(), 
        email, 
        role,
        fullName: name 
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token: jwtToken,
      user: {
        id: userId,
        email,
        role,
        fullName: name,
        profileImage: picture
      }
    });

  } catch (error) {
    console.error('Google login error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// ROUTE: Email/Password Signup (example: create new User; extend for Barber/Admin if needed)
router.post('/signup', async (req, res) => {
  try {
    const { email, password, role = 'user' } = req.body; // Add more fields as needed (e.g., fullName)
    
    // Check if email exists in any model
    const existingUser = await User.findOne({ email }) || await Barber.findOne({ email }) || await Admin.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    let newUser;
    let userId;

    if (role === 'admin') {
      newUser = await Admin.create({ email, password: hashedPassword, fullName: 'New Admin' });
    } else if (role === 'barber') {
      newUser = await Barber.create({ email, password: hashedPassword, name: 'New Barber' /* add branch, etc. */ });
    } else {
      newUser = await User.create({ email, password: hashedPassword, fullName: 'New User' });
    }
    
    userId = newUser._id;

    const jwtToken = jwt.sign(
      { id: userId.toString(), email, role, fullName: newUser.fullName || newUser.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      token: jwtToken,
      user: { id: userId, email, role, fullName: newUser.fullName || newUser.name }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ROUTE: Email/Password Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user in any model
    let user = await User.findOne({ email }) || await Barber.findOne({ email }) || await Admin.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Compare password (only if user has a password field; Google users might not)
    if (user.password) {
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
    } else {
      return res.status(400).json({ message: 'Use Google to login' });
    }

    const role = user instanceof Admin ? 'admin' : user instanceof Barber ? 'barber' : 'user';
    const fullName = user.fullName || user.name;
    const userId = user._id;

    const jwtToken = jwt.sign(
      { id: userId.toString(), email, role, fullName },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token: jwtToken,
      user: { id: userId, email, role, fullName }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ROUTE: Get Current User
router.get('/me', verifyToken, async (req, res) => {
  try {
    const { id, role } = req.user;

    let userData = {
      id,
      email: req.user.email,
      role,
      fullName: req.user.fullName
    };

    if (role === 'admin') {
      const admin = await Admin.findById(id);
      if (admin) {
        userData.permissions = admin.permissions;
      }
    } else if (role === 'barber') {
      const barber = await Barber.findById(id).populate('branch');
      if (barber) {
        userData.barberId = barber._id;
        userData.branch = barber.branch;
        userData.specialties = barber.specialties;
        userData.experienceYears = barber.experienceYears;
      }
    } else if (role === 'user') {
      const user = await User.findById(id);
      if (user) {
        userData.phone = user.phone;
        userData.address = user.address;
        userData.city = user.city;
        userData.profileImage = user.profileImage;
      }
    }

    res.json({
      success: true,
      user: userData
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ROUTE: Verify Admin
router.get('/verify-admin', verifyToken, async (req, res) => {
  try {
    const { id, role } = req.user;

    if (role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied - admin only' });
    }

    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    res.json({
      success: true,
      message: 'Admin verified',
      user: {
        id: admin._id,
        email: admin.email,
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
    const { id, role } = req.user;

    if (role !== 'barber') {
      return res.status(403).json({ success: false, message: 'Access denied - barber only' });
    }

    const barber = await Barber.findById(id).populate('branch');
    if (!barber) {
      return res.status(404).json({ success: false, message: 'Barber not found' });
    }

    res.json({
      success: true,
      message: 'Barber verified',
      user: {
        id: barber._id,
        barberId: barber._id,
        email: barber.email,
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
    const { id, role } = req.user;

    if (role !== 'user') {
      return res.status(403).json({ success: false, message: 'Access denied - user only' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      message: 'User verified',
      user: {
        id: user._id,
        mongoId: user._id,
        email: user.email,
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