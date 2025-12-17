// app.js
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';
import passport from 'passport';

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

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();

app.use(passport.initialize());

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://accounts.google.com");
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://barber-appointment-six.vercel.app',
  'https://barber-appointment-b7dlepb5e-alis-projects-58e3c939.vercel.app',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

let isConnected = false;

async function connectToDatabase() {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }
  mongoose.set('strictQuery', false);
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 1,
      minPoolSize: 0,
    });
    isConnected = true;
    return mongoose.connection;
  } catch (err) {
    isConnected = false;
    throw err;
  }
}

app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    res.status(500).json({ 
      error: 'Database connection failed',
      message: 'Please try again later'
    });
  }
});

app.use('/api/webhooks', webhookRoutes);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use('/uploads', express.static('uploads'));

app.get('/', async (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
  const emailConfigured = !!(process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD);
  res.json({
    status: 'OK',
    message: 'Barber Appointment API is running',
    timestamp: new Date().toISOString(),
    version: '2.0',
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: dbStatus,
      email: emailConfigured ? 'Configured' : 'Not Configured',
      cloudinary: process.env.CLOUDINARY_CLOUD_NAME ? 'Configured' : 'Not Configured'
    },
    endpoints: {
      auth: [
        'POST /api/auth/login',
        'POST /api/auth/signup',
        'POST /api/auth/google',
        'GET /api/auth/me'
      ],
      otp: [
        'POST /api/otp/send-otp',
        'POST /api/otp/verify-otp',
        'POST /api/otp/resend-otp'
      ],
      business: [
        'GET /api/barbers',
        'GET /api/branches',
        'GET /api/services',
        'GET /api/appointments'
      ]
    }
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/otp', otpRoutes);

app.use('/api/appointments', appointmentRoutes);
app.use('/api/barbers', barberRoutes);
app.use('/api/barber-shifts', barberShiftRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/payments', paymentRoute);
app.use('/api/leaves', leaveRoutes);
app.use('/api/admins', adminRoutes);

app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    message: 'The requested endpoint does not exist'
  });
});

app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ 
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

process.on('SIGTERM', () => {
  mongoose.connection.close(false, () => {
    process.exit(0);
  });
});

export default app;