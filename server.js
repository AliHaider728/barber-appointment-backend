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
      callback(null, true); // allow all for dev
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use('/uploads', express.static('uploads'));

// MONGODB CONNECTION
mongoose.set('strictQuery', false);
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB Error:', err));

// HEALTH CHECK ENDPOINT
app.get('/', async (req, res) => {
  res.json({
    status: 'OK',
    message: 'API Running',
    timestamp: new Date().toISOString()
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
// 404 PAGE
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});
// GLOBAL ERROR HANDLER
app.use((err, req, res, next) => {
  console.error('ERROR:', err);
  res.status(500).json({ error: err.message || 'Server Error' });
});

// VERCEL SERVERLESS FIX
export default app;