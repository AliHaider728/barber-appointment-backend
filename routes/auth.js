import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Barber from '../models/Barber.js';
import Admin from '../models/Admins.js';
import nodemailer from 'nodemailer';

const router = express.Router();

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey123456789';

// OTP Storage (production mein Redis ya Database use karein)
const otpStore = new Map();

// Nodemailer Setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD
  }
});

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

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
      'POST /api/auth/login',
      'POST /api/auth/signup', 
      'POST /api/auth/google',
      'POST /api/auth/send-otp',
      'POST /api/auth/verify-otp',
      'POST /api/auth/resend-otp',
      'GET /api/auth/me',
      'GET /api/auth/verify-admin',
      'GET /api/auth/verify-barber',
      'GET /api/auth/verify-user'
    ]
  });
});

// HELPER: Determine user role and get user data
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

//  OTP ROUTES 

// ROUTE: Send OTP
router.post('/send-otp', async (req, res) => {
  try {
    const { email, fullName } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email required' });
    }

    // Generate OTP
    const otp = generateOTP();
    const expiryTime = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store OTP
    otpStore.set(email, {
      otp,
      expiryTime,
      fullName: fullName || 'User',
      verified: false
    });

    console.log(`[OTP] Generated for ${email}: ${otp}`);

    // Send Email
    const mailOptions = {
      from: `"Barber Appointment" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '  Email Verification - OTP Code',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #D4AF37 0%, #F4D03F 100%); padding: 30px; text-align: center; }
            .header h1 { color: #000; margin: 0; font-size: 28px; }
            .content { padding: 40px 30px; text-align: center; }
            .otp-box { background-color: #f8f9fa; border: 2px dashed #D4AF37; border-radius: 8px; padding: 20px; margin: 30px 0; }
            .otp-code { font-size: 36px; font-weight: bold; color: #D4AF37; letter-spacing: 8px; margin: 10px 0; }
            .warning { color: #dc3545; font-size: 14px; margin-top: 20px; }
            .footer { background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #6c757d; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>  Email Verification</h1>
            </div>
            <div class="content">
              <h2>Hello ${fullName || 'User'}!  </h2>
              <p>Thank you for signing up with Barber Appointment System.</p>
              <p>Your One-Time Password (OTP) for email verification is:</p>
              
              <div class="otp-box">
                <div class="otp-code">${otp}</div>
              </div>
              
              <p>Please enter this code to verify your email address.</p>
              <p class="warning">  This OTP will expire in 10 minutes.</p>
              <p style="font-size: 14px; color: #6c757d; margin-top: 30px;">
                If you didn't request this code, please ignore this email.
              </p>
            </div>
            <div class="footer">
              <p>Powered by TecnoSphere  </p>
              <p>© 2025 Barber Appointment System. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`[OTP] Email sent to ${email}`);

    res.json({
      success: true,
      message: 'OTP sent successfully to your email'
    });

  } catch (error) {
    console.error('[OTP] Send error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to send OTP: ' + error.message 
    });
  }
});

// ROUTE: Verify OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ 
        success: false,
        message: 'Email and OTP required' 
      });
    }

    const storedData = otpStore.get(email);

    if (!storedData) {
      return res.status(400).json({ 
        success: false,
        message: 'No OTP found. Please request a new one.' 
      });
    }

    // Check expiry
    if (Date.now() > storedData.expiryTime) {
      otpStore.delete(email);
      return res.status(400).json({ 
        success: false,
        message: 'OTP has expired. Please request a new one.' 
      });
    }

    // Verify OTP
    if (storedData.otp !== otp.toString()) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid OTP. Please try again.' 
      });
    }

    // Mark as verified
    storedData.verified = true;
    otpStore.set(email, storedData);

    console.log(`[OTP] Verified successfully for ${email}`);

    res.json({
      success: true,
      message: 'Email verified successfully! You can now login.'
    });

  } catch (error) {
    console.error('[OTP] Verify error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Verification failed: ' + error.message 
    });
  }
});

// ROUTE: Resend OTP
router.post('/resend-otp', async (req, res) => {
  try {
    const { email, fullName } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email required' });
    }

    otpStore.delete(email);

    const otp = generateOTP();
    const expiryTime = Date.now() + 10 * 60 * 1000;

    otpStore.set(email, {
      otp,
      expiryTime,
      fullName: fullName || 'User',
      verified: false
    });

    console.log(`[OTP] Resent for ${email}: ${otp}`);

    const mailOptions = {
      from: `"Barber Appointment" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '  New OTP Code',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #D4AF37 0%, #F4D03F 100%); padding: 30px; text-align: center; }
            .header h1 { color: #000; margin: 0; font-size: 28px; }
            .content { padding: 40px 30px; text-align: center; }
            .otp-box { background-color: #f8f9fa; border: 2px dashed #D4AF37; border-radius: 8px; padding: 20px; margin: 30px 0; }
            .otp-code { font-size: 36px; font-weight: bold; color: #D4AF37; letter-spacing: 8px; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>  New OTP Code</h1>
            </div>
            <div class="content">
              <h2>Hello ${fullName || 'User'}!</h2>
              <p>Your new OTP code is:</p>
              <div class="otp-box">
                <div class="otp-code">${otp}</div>
              </div>
              <p>  This OTP will expire in 10 minutes.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);

    res.json({
      success: true,
      message: 'New OTP sent successfully'
    });

  } catch (error) {
    console.error('[OTP] Resend error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to resend OTP: ' + error.message 
    });
  }
});

//  AUTH ROUTES 

// ROUTE: Email/Password Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('[AUTH] Login attempt:', { email });

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

    console.log('[AUTH] Login successful:', { email, role });

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
    console.error('[AUTH] Login error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// ROUTE: Email/Password Signup (WITH OTP CHECK)
router.post('/signup', async (req, res) => {
  try {
    const { email, password, fullName = 'New User' } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    // Check if email is verified
    const otpData = otpStore.get(email);
    if (!otpData || !otpData.verified) {
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

    // Clear OTP after successful signup
    otpStore.delete(email);

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
    console.error('[AUTH] Signup error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// ROUTE: Google OAuth Login
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
    console.error('[AUTH] Google login error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
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
    console.error('[AUTH] Get user error:', error);
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
    console.error('[AUTH] Admin verification error:', error);
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
    console.error('[AUTH] Barber verification error:', error);
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
    console.error('[AUTH] User verification error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// MIDDLEWARE: Admin Authentication
export const authenticateAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('[AUTH] No token provided');
      return res.status(401).json({ message: 'No token provided' });
    }
    
    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      
      if (decoded.role !== 'admin') {
        console.error('[AUTH] Not an admin:', decoded.role);
        return res.status(403).json({ message: 'Admin access required' });
      }

      const admin = await Admin.findById(decoded.id);
      if (!admin) {
        console.error('[AUTH] Admin not found:', decoded.id);
        return res.status(404).json({ message: 'Admin not found' });
      }

      req.user = decoded;
      req.admin = admin;
      
      console.log('[AUTH] Admin authenticated:', admin.email);
      next();
    } catch (jwtError) {
      console.error('[AUTH] JWT verification failed:', jwtError.message);
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
  } catch (err) {
    console.error('[AUTH] Admin auth error:', err);
    return res.status(500).json({ message: 'Authentication error' });
  }
};

// MIDDLEWARE: Check Permission
export const checkPermission = (permission) => (req, res, next) => {
  if (!req.admin) {
    return res.status(403).json({ message: 'Admin authentication required' });
  }

  if (!req.admin.permissions || !Array.isArray(req.admin.permissions)) {
    console.warn('[AUTH] Admin has no permissions array');
    return res.status(403).json({ message: 'No permissions configured' });
  }

  if (!req.admin.permissions.includes(permission)) {
    console.warn(`[AUTH] Permission denied: ${permission}`);
    return res.status(403).json({ 
      message: `Permission "${permission}" required`,
      userPermissions: req.admin.permissions
    });
  }
  
  next();
};

export default router;