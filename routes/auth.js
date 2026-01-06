import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Barber from '../models/Barber.js';
import Admin from '../models/Admins.js';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config()
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET ;
const otpStore = new Map();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD
  }
});

console.log("JWT_SECRET:", process.env.JWT_SECRET);
 

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

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

const getUserWithRole = async (email) => {
  let user = await Admin.findOne({ email }).populate('assignedBranch');
  if (user) {
    return { 
      user, 
      role: user.role === 'main_admin' ? 'admin' : 'branch_admin', 
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

// Health Check
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
      'GET /api/auth/me'
    ],
    emailConfigured: !!process.env.EMAIL_USER && !!process.env.EMAIL_APP_PASSWORD
  });
});

// Send OTP
router.post('/send-otp', async (req, res) => {
  try {
    const { email, fullName } = req.body;
    console.log('[OTP] Request received:', { email, fullName });

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email required' });
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
      console.error('  [OTP] Email credentials not configured');
      return res.status(500).json({ 
        success: false, 
        message: 'Email service not configured. Please contact administrator.' 
      });
    }

    const otp = generateOTP();
    const expiryTime = Date.now() + 10 * 60 * 1000;

    otpStore.set(email, {
      otp,
      expiryTime,
      fullName: fullName || 'User',
      verified: false
    });

    console.log(` [OTP] Generated for ${email}: ${otp}`);

    const mailOptions = {
      from: `"Barber Appointment" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '🔐 Email Verification - OTP Code',
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
              <h1>🔐 Email Verification</h1>
            </div>
            <div class="content">
              <h2>Hello ${fullName || 'User'}! 👋</h2>
              <p>Thank you for signing up with Barber Appointment System.</p>
              <p>Your One-Time Password (OTP) for email verification is:</p>
              
              <div class="otp-box">
                <div class="otp-code">${otp}</div>
              </div>
              
              <p>Please enter this code to verify your email address.</p>
              <p class="warning">⚠️ This OTP will expire in 10 minutes.</p>
              <p style="font-size: 14px; color: #6c757d; margin-top: 30px;">
                If you didn't request this code, please ignore this email.
              </p>
            </div>
            <div class="footer">
              <p>Powered by TecnoSphere ✨</p>
              <p>© 2025 Barber Appointment System. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(` [OTP] Email sent successfully to ${email}`);

    res.json({
      success: true,
      message: 'OTP sent successfully to your email'
    });

  } catch (error) {
    console.error('  [OTP] Send error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to send OTP: ' + error.message 
    });
  }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    console.log('[OTP] Verify request:', { email, otp: otp ? '******' : 'missing' });

    if (!email || !otp) {
      return res.status(400).json({ 
        success: false,
        message: 'Email and OTP required' 
      });
    }

    const storedData = otpStore.get(email);

    if (!storedData) {
      console.log(`  [OTP] No OTP found for ${email}`);
      return res.status(400).json({ 
        success: false,
        message: 'No OTP found. Please request a new one.' 
      });
    }

    if (Date.now() > storedData.expiryTime) {
      otpStore.delete(email);
      console.log(`  [OTP] Expired for ${email}`);
      return res.status(400).json({ 
        success: false,
        message: 'OTP has expired. Please request a new one.' 
      });
    }

    if (storedData.otp !== otp.toString()) {
      console.log(`  [OTP] Invalid OTP for ${email}`);
      return res.status(400).json({ 
        success: false,
        message: 'Invalid OTP. Please try again.' 
      });
    }

    storedData.verified = true;
    otpStore.set(email, storedData);

    console.log(` [OTP] Verified successfully for ${email}`);

    res.json({
      success: true,
      message: 'Email verified successfully! You can now complete signup.'
    });

  } catch (error) {
    console.error('  [OTP] Verify error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Verification failed: ' + error.message 
    });
  }
});

// Resend OTP
router.post('/resend-otp', async (req, res) => {
  try {
    const { email, fullName } = req.body;
    console.log('[OTP] Resend request:', { email });

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email required' });
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
      return res.status(500).json({ 
        success: false, 
        message: 'Email service not configured.' 
      });
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

    console.log(` [OTP] New OTP generated for ${email}: ${otp}`);

    const mailOptions = {
      from: `"Barber Appointment" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '🔐 New OTP Code',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: 30px auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #D4AF37 0%, #F4D03F 100%); padding: 30px; text-align: center; }
            .header h1 { color: #000; margin: 0; font-size: 28px; }
            .content { padding: 40px 30px; text-align: center; }
            .otp-box { background: #f8f9fa; border: 2px dashed #D4AF37; border-radius: 8px; padding: 20px; margin: 30px 0; }
            .otp-code { font-size: 36px; font-weight: bold; color: #D4AF37; letter-spacing: 8px; }
          </style> 
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 New OTP Code</h1>
            </div>
            <div class="content">
              <h2>Hello ${fullName || 'User'}!</h2>
              <p>Your new OTP code is:</p>
              <div class="otp-box">
                <div class="otp-code">${otp}</div>
              </div>
              <p>⚠️ This OTP will expire in 2 minutes.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(` [OTP] Resent successfully to ${email}`);

    res.json({
      success: true,
      message: 'New OTP sent successfully'
    });

  } catch (error) {
    console.error('  [OTP] Resend error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to resend OTP: ' + error.message 
    });
  }
});

// LOGIN - UPDATED FOR BRANCH ADMIN
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('[AUTH] Login attempt:', { email });

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    // Check Admin (Main Admin ya Branch Admin)
    const admin = await Admin.findOne({ email }).populate('assignedBranch');
    if (admin) {
      if (!admin.isActive) {
        return res.status(403).json({ message: 'Account is disabled. Contact administrator.' });
      }

      const isMatch = await bcrypt.compare(password, admin.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      let jwtRole = admin.role === 'main_admin' ? 'admin' : 'branch_admin';

      const token = jwt.sign(
        { 
          id: admin._id, 
          email: admin.email, 
          role: jwtRole
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      const userData = {
        id: admin._id,
        email: admin.email,
        fullName: admin.fullName,
        adminRole: admin.role
      };

      if (admin.role === 'branch_admin' && admin.assignedBranch) {
        userData.assignedBranch = {
          id: admin.assignedBranch._id,
          name: admin.assignedBranch.name,
          city: admin.assignedBranch.city,
          address: admin.assignedBranch.address
        };
      }

      console.log(' [AUTH] Admin login successful:', admin.role);
      return res.json({
        token,
        user: userData,
        role: jwtRole
      });
    }

    // Check Barber
    const barber = await Barber.findOne({ email }).populate('branch');
    if (barber) {
      if (!barber.isActive) {
        return res.status(403).json({ message: 'Account is disabled. Contact administrator.' });
      }
      if (!barber.isEmailVerified) {
        return res.status(403).json({ message: 'Email not verified. Please verify your email.' });
      }

      const isMatch = await bcrypt.compare(password, barber.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const token = jwt.sign(
        { id: barber._id, email: barber.email, role: 'barber' },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      console.log(' [AUTH] Barber login successful');
      return res.json({
        token,
        user: {
          id: barber._id,
          email: barber.email,
          fullName: barber.name,
          barberId: barber._id
        },
        role: 'barber'
      });
    }

    // Check User
    const user = await User.findOne({ email });
    if (user) {
      if (user.googleId && !user.password) {
        return res.status(400).json({ 
          message: 'This account uses Google Sign-In. Please use Google to login.' 
        });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const token = jwt.sign(
        { id: user._id, email: user.email, role: 'user' },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      console.log(' [AUTH] User login successful');
      return res.json({
        token,
        user: {
          id: user._id,
          email: user.email,
          fullName: user.fullName
        },
        role: 'user'
      });
    }

    console.log('  [AUTH] No account found for:', email);
    return res.status(401).json({ message: 'Invalid credentials' });
  } catch (err) {
    console.error('  [AUTH] Login error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Signup
router.post('/signup', async (req, res) => {
  try {
    const { email, password, fullName = 'New User' } = req.body;
    console.log('[AUTH] Signup attempt:', { email, fullName });

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    const otpData = otpStore.get(email);
    if (!otpData || !otpData.verified) {
      console.log(`  [AUTH] Email not verified: ${email}`);
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

    otpStore.delete(email);
    console.log(` [AUTH] OTP cleared for ${email}`);

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

    console.log(` [AUTH] Signup successful: ${email}`);

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
    console.error('  [AUTH] Signup error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Google OAuth Login
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

    console.log(' [AUTH] Google login successful:', { email, role });

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
    console.error('  [AUTH] Google login error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Get Current User
router.get('/me', verifyToken, async (req, res) => {
  try {
    const { id, role } = req.user;

    let userData = {
      id,
      email: req.user.email,
      role,
      fullName: req.user.fullName
    };

    if (role === 'admin' || role === 'branch_admin') {
      const admin = await Admin.findById(id).populate('assignedBranch');
      if (admin) {
        userData.permissions = admin.permissions;
        userData.adminRole = admin.role;
        if (admin.assignedBranch) {
          userData.assignedBranch = admin.assignedBranch;
        }
      }
    } else if (role === 'barber') {
      const barber = await Barber.findById(id).populate('branch');
      if (barber) {
        userData.barberId = barber._id;
        userData.branch = barber.branch;
        userData.specialties = barber.specialties;
      }
    } else if (role === 'user') {
      const user = await User.findById(id);
      if (user) {
        userData.phone = user.phone;
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

//  Main Admin Authentication Middleware (FIXED)
export const authenticateAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    
    if (decoded.role !== 'admin' && decoded.role !== 'main_admin') {
      return res.status(403).json({ message: 'Main Admin access required' });
    }

    //  FIX: Add .populate here
    const admin = await Admin.findById(decoded.id).populate('assignedBranch');
    if (!admin || admin.role !== 'main_admin') {
      return res.status(404).json({ message: 'Main Admin not found' });
    }

    if (!admin.isActive) {
      return res.status(403).json({ message: 'Admin account is disabled' });
    }

    req.user = decoded;
    req.admin = admin;
    console.log(' [AUTH] Main Admin authenticated:', admin.email);
    next();
  } catch (err) {
    console.error('  [AUTH] Admin auth error:', err);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

//  Branch Admin Authentication Middleware (FIXED)
export const authenticateBranchAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    
    if (decoded.role !== 'branch_admin') {
      return res.status(403).json({ message: 'Branch Admin access required' });
    }

    //  FIX: Add .populate here
    const admin = await Admin.findById(decoded.id).populate('assignedBranch');
    if (!admin || admin.role !== 'branch_admin') {
      return res.status(404).json({ message: 'Branch Admin not found' });
    }

    if (!admin.isActive) {
      return res.status(403).json({ message: 'Admin account is disabled' });
    }

    //  FIX: Check if branch is assigned
    if (!admin.assignedBranch) {
      console.error('  [AUTH] Branch admin missing assignedBranch:', admin.email);
      return res.status(400).json({ message: 'No branch assigned' });
    }

    req.user = decoded;
    req.admin = admin;
    req.branchId = admin.assignedBranch._id;
    console.log(' [AUTH] Branch Admin authenticated:', admin.email);
    next();
  } catch (err) {
    console.error('  [AUTH] Branch Admin auth error:', err);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};


// Check Permission Middleware
export const checkPermission = (permission) => {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    // Main admin has all permissions
    if (req.admin.role === 'main_admin') {
      return next();
    }

    // Check if branch admin has the required permission
    if (!req.admin.permissions || !req.admin.permissions.includes(permission)) {
      return res.status(403).json({ 
        message: 'Permission denied',
        required: permission
      });
    }

    next();
  };
};

export { verifyToken };
export default router;