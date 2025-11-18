import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import appointmentRoutes from './routes/appointments.js';
import barberRoutes from "./routes/barbers.js";
import branchRoutes from './routes/branches.js';
import serviceRoutes from './routes/services.js';
import barberShiftRoutes from './routes/barberShifts.js';
import PaymentRoute from './routes/payments.js'
import { v2 as cloudinary } from 'cloudinary';

dotenv.config();

const app = express();

// CORS
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.options('*', cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Cloudinary Config (optional, won't crash if missing)
try {
  if (process.env.CLOUDINARY_CLOUD_NAME) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    console.log(' Cloudinary configured');
  }
} catch (err) {
  console.log(' Cloudinary config failed:', err.message);
}

// Health check BEFORE MongoDB
app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'API Running',
    timestamp: new Date().toISOString(),
    env: {
      mongodbConfigured: !!process.env.MONGODB_URI,
      cloudinaryConfigured: !!process.env.CLOUDINARY_CLOUD_NAME
    }
  });
});

// MongoDB Connection
if (!process.env.MONGODB_URI) {
  console.error(' MONGODB_URI is not defined!');
} else {
  mongoose.set('strictQuery', false);
  mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
    .then(() => console.log('  MongoDB Connected'))
    .catch(err => {
      console.error('  MongoDB Connection Error:', err.message);
      // Don't crash the server
    });
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/barbers', barberRoutes);
app.use('/api/barber-shifts', barberShiftRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/payments', PaymentRoute);

app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(' Server Error:', err);
  res.status(500).json({ 
    error: err.message || 'Server Error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Export for Vercel
export default app;

// Only listen in local development
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(` Server running on port ${PORT}`);
  });
}