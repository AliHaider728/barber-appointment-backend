// routes/auth.js
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Barber from '../models/Barber.js';
import Admin from '../models/Admins.js';
import { isEmailVerified, clearOTP } from './otpRoutes.js';

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey123456789';

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
    return res.status(401).json({ message: 'Invalid token' });
  }
};

router.get('/', (req, res) => {
  res.json({
    message: 'Auth API is running',
    routes: [
      'POST /api/auth/login',
      'POST /api/auth/signup', 
      'POST /api/auth/google',
      'GET /api/auth/me',
      'GET /api/auth/verify-admin',
      'GET /api/auth/verify-barber',
      'GET /api/auth/verify-user'
    ],
    emailConfigured: !!process.env.EMAIL_USER && !!process.env.EMAIL_APP_PASSWORD
  });
});

const getUserWithRole = async (email) => {
  let user = await Admin.findOne({ email });
  if (user) {
    return { 
      user, 
      role: 'admin', 
      fullName: user.fullName,
      userId: user._id 
    };
  }

  user = await Barber.findOne({ email }).populate('branch');
  if (user) {
    return { 
      user, 
      role: 'barber', 
      fullName: user.name,
      userId: user._id,
      barberId: user._id
    };
  }

  user = await User.findOne({ email });
  if (user) {
    return { 
      user, 
      role: 'user', 
      fullName: user.fullName,
      userId: user._id 
    };
  }

  return null;
};

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    const userData = await getUserWithRole(email);
    
    if (!userData) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const { user, role, fullName, userId, barberId } = userData;

    if (role === 'user' && user.googleId && !user.password) {
      return res.status(400).json({ 
        message: 'This account uses Google Sign-In. Please use Google to login.' 
      });
    }

    if (!user.password) {
      return res.status(400).json({ 
        message: 'Password not set. Please use Google Sign-In or reset your password.' 
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const jwtToken = jwt.sign(
      { 
        id: userId.toString(), 
        email, 
        role,
        fullName,
        ...(barberId && { barberId: barberId.toString() })
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token: jwtToken,
      user: {
        id: userId,
        email,
        fullName,
        ...(barberId && { barberId })
      },
      role
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

router.post('/signup', async (req, res) => {
  try {
    const { email, password, fullName = 'New User' } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    if (!isEmailVerified(email)) {
      return res.status(400).json({ 
        message: 'Please verify your email with OTP first',
        requiresOTP: true
      });
    }

    const existing = await getUserWithRole(email);
    if (existing) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({ 
      email, 
      password: hashedPassword, 
      fullName,
      role: 'user',
      emailVerified: true
    });

    clearOTP(email);

    const jwtToken = jwt.sign(
      { 
        id: newUser._id.toString(), 
        email, 
        role: 'user',
        fullName
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Account created successfully',
      token: jwtToken,
      user: { 
        id: newUser._id, 
        email, 
        fullName 
      },
      role: 'user'
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

router.post('/google', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: 'Google token required' });
    }

    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);
    
    if (!response.ok) {
      return res.status(401).json({ message: 'Invalid Google token' });
    }

    const googleUser = await response.json();

    if (googleUser.error) {
      return res.status(401).json({ message: 'Invalid Google token' });
    }

    const { email, name, picture, sub: googleId } = googleUser;

    let userData = await getUserWithRole(email);
    
    if (!userData) {
      const newUser = await User.create({
        email,
        googleId: googleId,
        fullName: name,
        profileImage: picture,
        role: 'user',
        emailVerified: true
      });

      userData = {
        user: newUser,
        role: 'user',
        fullName: name,
        userId: newUser._id
      };
    } else if (userData.role === 'user' && !userData.user.googleId) {
      await User.findByIdAndUpdate(userData.userId, {
        googleId: googleId,
        profileImage: picture,
        emailVerified: true
      });
    }

    const { role, fullName, userId, barberId } = userData;

    const jwtToken = jwt.sign(
      { 
        id: userId.toString(), 
        email, 
        role,
        fullName,
        ...(barberId && { barberId: barberId.toString() })
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token: jwtToken,
      user: {
        id: userId,
        email,
        fullName,
        profileImage: picture,
        ...(barberId && { barberId })
      },
      role
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

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
        userData.gender = barber.gender;
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
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

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
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

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
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

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
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export const authenticateAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }
    
    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      
      if (decoded.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const admin = await Admin.findById(decoded.id);
      if (!admin) {
        return res.status(404).json({ message: 'Admin not found' });
      }

      req.user = decoded;
      req.admin = admin;
      
      next();
    } catch (jwtError) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
  } catch (err) {
    return res.status(500).json({ message: 'Authentication error' });
  }
};

export const checkPermission = (permission) => (req, res, next) => {
  if (!req.admin) {
    return res.status(403).json({ message: 'Admin authentication required' });
  }

  if (!req.admin.permissions || !Array.isArray(req.admin.permissions)) {
    return res.status(403).json({ message: 'No permissions configured' });
  }

  if (!req.admin.permissions.includes(permission)) {
    return res.status(403).json({ 
      message: `Permission "${permission}" required`,
      userPermissions: req.admin.permissions
    });
  }
  
  next();
};

export default router;