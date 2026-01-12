import express from 'express';
import Appointment from '../models/Appointment.js';
import Service from '../models/Service.js';
import Branch from '../models/Branch.js';
import Barber from '../models/Barber.js';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { sendBookingConfirmation } from '../utils/emailService.js';

const router = express.Router();

// AUTH MIDDLEWARE - Optional authentication
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey123456789');
      const User = (await import('../models/User.js')).default;
      const user = await User.findById(decoded.userId || decoded.id);
      
      if (user) {
        req.user = user;
        req.token = token;
      }
    }
    next();
  } catch (error) {
    next();
  }
};

// REQUIRED AUTH MIDDLEWARE
const requireAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey123456789');
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(decoded.userId || decoded.id);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// CORS Headers
router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// ✅ NEW: TEST EMAIL ENDPOINT WITH DETAILED DIAGNOSTICS
router.get('/test-email', async (req, res) => {
  try {
    console.log('🧪 Testing email service...');
    console.log('📧 Environment check:', {
      EMAIL_USER: process.env.EMAIL_USER || 'NOT SET',
      EMAIL_APP_PASSWORD: process.env.EMAIL_APP_PASSWORD ? '✅ SET' : '❌ NOT SET',
      PASSWORD_LENGTH: process.env.EMAIL_APP_PASSWORD?.length || 0
    });
    
    const result = await sendBookingConfirmation('alihaideransari904@gmail.com', {
      customerName: 'Test User',
      bookingRef: 'TEST' + Date.now(),
      branchName: 'Test Branch',
      branchAddress: 'Test Address, City',
      barberName: 'Test Barber',
      services: [
        { name: 'Haircut', price: '£25' },
        { name: 'Beard Trim', price: '£15' }
      ],
      date: new Date(),
      time: '14:30',
      duration: 40,
      totalPrice: 40
    });
    
    if (result.success) {
      console.log('✅ Test email sent successfully');
      res.json({ 
        success: true, 
        message: 'Test email sent! Check alihaideransari904@gmail.com',
        messageId: result.messageId 
      });
    } else {
      console.error('❌ Test email failed:', result.error);
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('❌ Test email error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET appointments by barber and date
router.get('/barber/:barberId/date/:date', async (req, res) => {
  try {
    const { barberId, date } = req.params;

    if (!mongoose.Types.ObjectId.isValid(barberId)) {
      return res.status(400).json({ message: 'Invalid barber ID' });
    }

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const appointments = await Appointment.find({
      barber: barberId,
      date: { $gte: startOfDay, $lte: endOfDay },
      status: { $nin: ['rejected', 'cancelled'] }
    })
    .populate('barber', 'name email')
    .populate('branch', 'name')
    .populate('services.serviceRef', 'name duration')
    .select('date duration status customerName email phone services');

    res.json(appointments);
  } catch (error) {
    console.error('❌ GET barber appointments error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET all appointments
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { barber, branch, status, date } = req.query;
    
    let filter = {};
    
    if (req.user && req.user.role === 'user') {
      filter.$or = [
        { email: req.user.email },
        { userId: req.user._id }
      ];
      console.log('👤 Filtering appointments for user:', req.user.email);
    } else {
      console.log('👥 No user filter applied (admin/barber or no auth)');
    }
    
    if (barber && mongoose.Types.ObjectId.isValid(barber)) {
      filter.barber = barber;
    }
    
    if (branch && mongoose.Types.ObjectId.isValid(branch)) {
      filter.branch = branch;
    }
    
    if (status) {
      filter.status = status;
    }
    
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      filter.date = { $gte: startOfDay, $lte: endOfDay };
    }

    const appointments = await Appointment.find(filter)
      .populate('barber', 'name email')
      .populate('branch', 'name city address')
      .populate('services.serviceRef', 'name price duration')
      .sort({ date: -1, createdAt: -1 });

    console.log(`📋 Found ${appointments.length} appointments`);
    res.json(appointments);
    
  } catch (error) {
    console.error('❌ GET appointments error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET single appointment
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid appointment ID' });
    }

    const appointment = await Appointment.findById(req.params.id)
      .populate('barber', 'name email experienceYears')
      .populate('branch', 'name city address')
      .populate('services.serviceRef', 'name price duration');

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    if (req.user && req.user.role === 'user') {
      const isOwner = appointment.email === req.user.email || 
                      appointment.userId?.toString() === req.user._id.toString();
      
      if (!isOwner) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    res.json(appointment);
  } catch (error) {
    console.error('❌ GET appointment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ IMPROVED: CREATE APPOINTMENT WITH BETTER EMAIL HANDLING
router.post('/', optionalAuth, async (req, res) => {
  try {
    const {
      customerName,
      email,
      phone,
      date,
      selectedServices,
      barber,
      branch,
      duration,
      totalPrice
    } = req.body;

    console.log('📝 Creating appointment for:', email);
    console.log('📧 Email config status:', {
      EMAIL_USER: process.env.EMAIL_USER ? '✅' : '❌',
      EMAIL_PASSWORD: process.env.EMAIL_APP_PASSWORD ? '✅' : '❌'
    });

    // Validation
    if (!customerName || !email || !phone || !date || !barber || !branch || !duration) {
      return res.status(400).json({ 
        success: false,
        message: 'All fields are required' 
      });
    }

    if (!selectedServices || !Array.isArray(selectedServices) || selectedServices.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: 'At least one service is required' 
      });
    }

    // Validate ObjectIds
    if (!mongoose.Types.ObjectId.isValid(barber) || !mongoose.Types.ObjectId.isValid(branch)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid barber or branch ID' 
      });
    }

    // Validate services
    const serviceIds = selectedServices.map(s => s.serviceRef).filter(Boolean);
    if (serviceIds.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: 'No valid service IDs provided' 
      });
    }

    if (serviceIds.some(id => !mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid service ID format' 
      });
    }

    const services = await Service.find({ _id: { $in: serviceIds } });
    console.log(`📚 Found ${services.length} services from ${serviceIds.length} requested`);

    if (services.length !== serviceIds.length) {
      return res.status(400).json({ 
        success: false,
        message: 'One or more services not found in database' 
      });
    }

    // Enrich services with full data
    const enrichedServices = selectedServices.map(sel => {
      const service = services.find(s => s._id.toString() === sel.serviceRef);
      if (!service) {
        console.error('❌ Service not found for ID:', sel.serviceRef);
        return null;
      }
      return {
        serviceRef: service._id,
        name: service.name,
        price: service.price,
        duration: service.duration
      };
    }).filter(Boolean);

    if (enrichedServices.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Failed to process services' 
      });
    }

    console.log('✅ Enriched services:', enrichedServices);

    // Calculate total
    const calculatedTotal = totalPrice || enrichedServices.reduce((sum, s) => {
      const priceValue = parseFloat(s.price.replace('£', '').trim());
      return sum + priceValue;
    }, 0);

    console.log('💰 Total price:', calculatedTotal);

    // Create appointment
    const appointmentData = {
      customerName: customerName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      date: new Date(date),
      services: enrichedServices,
      totalPrice: calculatedTotal,
      totalPriceInCents: Math.round(calculatedTotal * 100),
      duration: duration || 30,
      barber,
      branch,
      status: 'pending',
      payOnline: false,
      paymentStatus: 'pending'
    };

    if (req.user) {
      appointmentData.userId = req.user._id;
      console.log('👤 Appointment linked to user:', req.user.email);
    }

    const appointment = new Appointment(appointmentData);
    await appointment.save();

    console.log('✅ Appointment saved to database:', appointment._id);

    // Populate for response
    const populated = await Appointment.findById(appointment._id)
      .populate('barber', 'name email')
      .populate('branch', 'name city address')
      .populate('services.serviceRef', 'name price duration');

    console.log('✅ Appointment populated successfully');

    // ✅ IMPROVED EMAIL SENDING WITH DETAILED LOGGING
    setImmediate(async () => {
      try {
        console.log('📧 [EMAIL PROCESS STARTED]');
        console.log('📧 Target email:', populated.email);
        
        // Check if email credentials are set
        if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
          console.error('❌ EMAIL CREDENTIALS NOT SET IN ENVIRONMENT!');
          console.error('❌ EMAIL_USER:', process.env.EMAIL_USER || 'MISSING');
          console.error('❌ EMAIL_APP_PASSWORD:', process.env.EMAIL_APP_PASSWORD ? 'SET' : 'MISSING');
          return;
        }

        console.log('✅ Email credentials found');

        // Fetch full data
        const branchData = await Branch.findById(branch);
        const barberData = await Barber.findById(barber);

        if (!branchData) {
          console.error('❌ Branch not found for ID:', branch);
          return;
        }
        if (!barberData) {
          console.error('❌ Barber not found for ID:', barber);
          return;
        }

        console.log('✅ Branch found:', branchData.name);
        console.log('✅ Barber found:', barberData.name);

        const appointmentDate = new Date(populated.date);
        const appointmentTime = appointmentDate.toLocaleTimeString('en-GB', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false
        });

        const emailData = {
          customerName: populated.customerName,
          bookingRef: populated._id.toString(),
          branchName: branchData.name,
          branchAddress: branchData.address || branchData.city || 'N/A',
          barberName: barberData.name,
          services: enrichedServices.map(s => ({
            name: s.name,
            price: s.price
          })),
          date: appointmentDate,
          time: appointmentTime,
          duration: populated.duration,
          totalPrice: populated.totalPrice
        };

        console.log('📧 Email data prepared:', {
          to: populated.email,
          customerName: emailData.customerName,
          bookingRef: emailData.bookingRef,
          services: emailData.services.length
        });

        console.log('📧 Calling sendBookingConfirmation...');
        const result = await sendBookingConfirmation(populated.email, emailData);
        
        if (result.success) {
          console.log('✅✅✅ EMAIL SENT SUCCESSFULLY!');
          console.log('✅ Message ID:', result.messageId);
          console.log('✅ To:', populated.email);
        } else {
          console.error('❌❌❌ EMAIL FAILED!');
          console.error('❌ Error:', result.error);
        }
      } catch (emailError) {
        console.error('❌❌❌ EMAIL EXCEPTION!');
        console.error('❌ Error type:', emailError.name);
        console.error('❌ Error message:', emailError.message);
        console.error('❌ Error stack:', emailError.stack);
      }
    });

    // Return response immediately
    res.status(201).json(populated);

  } catch (error) {
    console.error('❌ Create appointment error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to create appointment',
      error: error.message 
    });
  }
});

// UPDATE appointment
router.put('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, paymentStatus, barber } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid appointment ID' });
    }

    const existingAppointment = await Appointment.findById(id);
    if (!existingAppointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    if (req.user && req.user.role === 'user') {
      const isOwner = existingAppointment.email === req.user.email || 
                      existingAppointment.userId?.toString() === req.user._id.toString();
      
      if (!isOwner) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    const updateData = {};
    
    if (status) {
      if (!['pending', 'confirmed', 'rejected', 'completed', 'cancelled'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
      }
      updateData.status = status;
    }

    if (paymentStatus) {
      if (!['pending', 'paid', 'failed', 'refunded'].includes(paymentStatus)) {
        return res.status(400).json({ message: 'Invalid payment status' });
      }
      updateData.paymentStatus = paymentStatus;
    }

    if (barber) {
      if (!mongoose.Types.ObjectId.isValid(barber)) {
        return res.status(400).json({ message: 'Invalid barber ID' });
      }
      updateData.barber = barber;
      console.log('🔄 Reassigning appointment to new barber:', barber);
    }

    const appointment = await Appointment.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('barber', 'name email')
      .populate('branch', 'name city address')
      .populate('services.serviceRef', 'name price duration');

    console.log('✅ Appointment updated:', id);
    res.json(appointment);

  } catch (error) {
    console.error('❌ Update appointment error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// DELETE appointment
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid appointment ID' });
    }

    const appointment = await Appointment.findById(id);

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    if (req.user.role === 'user') {
      const isOwner = appointment.email === req.user.email || 
                      appointment.userId?.toString() === req.user._id.toString();
      
      if (!isOwner) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    await Appointment.findByIdAndDelete(id);

    console.log('✅ Appointment deleted:', id);
    res.json({ 
      success: true, 
      message: 'Appointment deleted successfully' 
    });

  } catch (error) {
    console.error('❌ Delete appointment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;