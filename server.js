import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';
import passport from 'passport';
// ROUTES
import authRoutes from './routes/auth.js';
import appointmentRoutes from './routes/appointments.js';
import barberRoutes from "./routes/barbers.js";
import branchRoutes from './routes/branches.js';
import serviceRoutes from './routes/services.js';
import barberShiftRoutes from './routes/barberShifts.js';
import paymentRoute from './routes/payments.js';
import leaveRoutes from './routes/leaves.js'; 
import adminRoutes from './routes/admins.js';
import webhookRoutes from './routes/webhooks.js'; 
import otpRoutes from './routes/otpRoutes.js';

dotenv.config();

// CLOUDINARY
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

console.log('Cloudinary config loaded:', {
  cloud: process.env.CLOUDINARY_CLOUD_NAME,
  key: process.env.CLOUDINARY_API_KEY?.slice(0, 6) + '...',
});

// EXPRESS APP
const app = express();

// Passport init
app.use(passport.initialize());

// Set CSP and COOP headers
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://accounts.google.com");
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

// CORS 
const allowedOrigins = [
  'http://localhost:5173',
  'https://barber-appointment-six.vercel.app',
  'https://barber-appointment-b7dlepb5e-alis-projects-58e3c939.vercel.app',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// MONGODB CONNECTION -   FOR SERVERLESS
let isConnected = false;

async function connectToDatabase() {
  if (isConnected && mongoose.connection.readyState === 1) {
    console.log('Using existing database connection');
    return mongoose.connection;
  }

  console.log('Creating new database connection');
  mongoose.set('strictQuery', false);
  
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 1,
      minPoolSize: 0,
    });
    
    isConnected = true;
    console.log('MongoDB Connected Successfully');
    return mongoose.connection;
  } catch (err) {
    console.error('MongoDB Connection Error:', err);
    isConnected = false;
    throw err;
  }
}

// DATABASE CONNECTION MIDDLEWARE
app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    console.error('DB connection failed:', error);
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// IMPORTANT: Webhook route FIRST (before JSON parsing)
// Stripe needs raw body for signature verification
app.use('/api/webhooks', webhookRoutes);

// NOW apply JSON parsing for other routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use('/uploads', express.static('uploads'));

// HEALTH CHECK ENDPOINT
app.get('/', async (req, res) => {
  res.json({
    status: 'OK',
    message: 'API Running',
    timestamp: new Date().toISOString(),
    dbStatus: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    routes: [
      'GET /api/auth',
      'POST /api/auth/login',
      'POST /api/auth/signup',
      'POST /api/auth/google',
      'GET /api/barbers',
      'GET /api/branches',
      'GET /api/services',
      'POST /api/webhooks/stripe'
    ]
  });
});
 
// ROUTES 
app.use('/api/auth', authRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/barbers', barberRoutes);
app.use('/api/barber-shifts', barberShiftRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/payments', paymentRoute);
app.use('/api/leaves', leaveRoutes);
app.use('/api/admins', adminRoutes);
app.use('/api/otp', otpRoutes);

// 404 PAGE
app.use('*', (req, res) => {
  console.log('404 - Route not found:', req.originalUrl);
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// GLOBAL ERROR HANDLER
app.use((err, req, res, next) => {
  console.error('ERROR:', err);
  res.status(500).json({ error: err.message || 'Server Error' });
});

// VERCEL SERVERLESS EXPORT
export default app; 