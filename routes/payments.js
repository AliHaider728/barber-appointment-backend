// backend/routes/payments.js
import express from 'express';
import Appointment from '../models/Appointment.js';
import Payment from '../models/Payment.js';
import Barber from '../models/Barber.js';
import Service from '../models/Service.js'; 
import mongoose from 'mongoose'; 
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config();
const router = express.Router();

// PLATFORM FEE PERCENTAGE (10% default, change karo agar chahiye)
const PLATFORM_FEE_PERCENTAGE = 10;

// Stripe initialization
let stripe = null;

if (process.env.STRIPE_SECRET_KEY) {
  try {
    const { Stripe } = await import('stripe');
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });
    console.log('Stripe initialized successfully');
  } catch (err) {
    console.error('Stripe import failed:', err.message);
  }
} else {
  console.log('STRIPE_SECRET_KEY not found - payments disabled (safe mode)');
}

// Middleware to verify barber token
const verifyBarber = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    if (decoded.role !== 'barber') {
      return res.status(403).json({ message: 'Access denied - barber only' });
    }

    req.barber = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// GET bookings for logged-in barber
router.get('/barber/me/bookings', verifyBarber, async (req, res) => {
  try {
    const barberId = req.barber.id;
    
    const bookings = await Appointment.find({ barber: barberId })
      .populate('branch', 'name city')
      .populate('services.serviceRef', 'name price duration')
      .sort({ date: -1 });

    res.json(bookings);
  } catch (error) {
    console.error('Get barber bookings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// CREATE PAYMENT INTENT WITH SPLIT
router.post('/create-payment-intent', async (req, res) => {
  if (!stripe) {
    return res.status(400).json({ 
      error: 'Payment gateway not configured yet. Contact admin.' 
    });
  }

  try {
    const { totalPrice, customerEmail, customerName, barberId } = req.body;

    if (!totalPrice || totalPrice <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    if (!barberId) {
      return res.status(400).json({ error: 'Barber ID required' });
    }

    // Get barber details
    const barber = await Barber.findById(barberId);
    if (!barber) {
      return res.status(404).json({ error: 'Barber not found' });
    }

    // Calculate platform fee and barber amount
    const platformFee = (totalPrice * PLATFORM_FEE_PERCENTAGE) / 100;
    const barberAmount = totalPrice - platformFee;

    const amountInCents = Math.round(totalPrice * 100);
    const platformFeeInCents = Math.round(platformFee * 100);

    // Create payment intent
    const paymentIntentData = {
      amount: amountInCents,
      currency: 'gbp',
      receipt_email: customerEmail || undefined,
      metadata: {
        customerName: customerName || 'Anonymous',
        customerEmail: customerEmail || 'no-email@temp.com',
        barberId: barberId,
        barberName: barber.name,
        platformFee: platformFee.toFixed(2),
        barberAmount: barberAmount.toFixed(2)
      }
    };

    // If barber has Stripe Connect, set application fee
    if (barber.stripeAccountId) {
      paymentIntentData.application_fee_amount = platformFeeInCents;
      paymentIntentData.transfer_data = {
        destination: barber.stripeAccountId,
      };
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      platformFee: platformFee.toFixed(2),
      barberAmount: barberAmount.toFixed(2)
    });
  } catch (error) {
    console.error('Payment intent error:', error.message);
    res.status(500).json({ error: 'Payment failed', details: error.message });
  }
});

// CREATE APPOINTMENT WITH PAYMENT
router.post('/create-appointment-with-payment', async (req, res) => {
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
      totalPrice,
      paymentIntentId,
      payOnline = true
    } = req.body;

    // Validation
    if (!customerName || !email || !phone || !date || !barber || !branch || !duration) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (!selectedServices || !Array.isArray(selectedServices) || selectedServices.length === 0) {
      return res.status(400).json({ message: 'At least one service is required' });
    }

    // Validate ObjectIds
    if (!mongoose.Types.ObjectId.isValid(barber) || !mongoose.Types.ObjectId.isValid(branch)) {
      return res.status(400).json({ message: 'Invalid barber or branch ID' });
    }

    // Validate service IDs
    const serviceIds = selectedServices.map(s => s.serviceRef).filter(Boolean);
    if (serviceIds.some(id => !mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({ message: 'Invalid service ID' });
    }

    const services = await Service.find({ _id: { $in: serviceIds } });
    if (services.length !== serviceIds.length) {
      return res.status(400).json({ message: 'One or more services not found' });
    }

    // Enrich services with full data
    const enrichedServices = selectedServices.map(sel => {
      const service = services.find(s => s._id.toString() === sel.serviceRef);
      return {
        serviceRef: service._id,
        name: service.name,
        price: service.price,
        duration: service.duration
      };
    });

    // Calculate total price if not provided
    const calculatedTotalPrice = totalPrice || enrichedServices.reduce((sum, s) => {
      return sum + parseFloat(s.price.replace('£', '').trim());
    }, 0);

    // Verify payment if payOnline
    if (payOnline && paymentIntentId && stripe) {
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (paymentIntent.status !== 'succeeded') {
          return res.status(400).json({ error: 'Payment not completed yet' });
        }
      } catch (err) {
        return res.status(400).json({ error: 'Invalid payment intent' });
      }
    } else if (payOnline && !stripe) {
      return res.status(400).json({ error: 'Payment system not available for online payments' });
    }

    // Conflict check
    const appointmentDate = new Date(date);
    const endDate = new Date(appointmentDate.getTime() + duration * 60000);

    const conflictingBookings = await Appointment.find({
      barber,
      status: { $nin: ['rejected', 'cancelled'] },
      $or: [
        {
          date: { $lte: appointmentDate },
          $expr: {
            $gte: [
              { $add: ['$date', { $multiply: ['$duration', 60000] }] },
              appointmentDate
            ]
          }
        },
        {
          date: {
            $gte: appointmentDate,
            $lt: endDate
          }
        }
      ]
    });

    if (conflictingBookings.length > 0) {
      return res.status(409).json({ 
        error: 'Time slot conflict detected',
        message: 'This time slot is no longer available. Please select another time.'
      });
    }
    
    // Create appointment
    const appointment = new Appointment({
      customerName: customerName?.trim() || 'Guest',
      email: email?.trim().toLowerCase() || 'no-email@temp.com',
      phone: phone?.trim() || 'N/A',
      date: appointmentDate,
      services: enrichedServices,
      totalPrice: calculatedTotalPrice,
      totalPriceInCents: Math.round(calculatedTotalPrice * 100),
      duration: duration || 30,
      barber,
      branch,
      status: payOnline && paymentIntentId ? 'confirmed' : 'pending',
      payOnline,
      paymentIntentId: payOnline ? paymentIntentId : null,
      paymentStatus: payOnline && paymentIntentId ? 'paid' : 'pending'
    });

    await appointment.save();

    // Create Payment record if paid online
    if (payOnline && paymentIntentId) {
      const platformFee = (calculatedTotalPrice * PLATFORM_FEE_PERCENTAGE) / 100;
      const barberAmount = calculatedTotalPrice - platformFee;

      const payment = new Payment({
        appointment: appointment._id,
        barber,
        customerEmail: email?.trim().toLowerCase(),
        customerName: customerName?.trim(),
        totalAmount: calculatedTotalPrice,
        platformFee,
        barberAmount,
        stripePaymentIntentId: paymentIntentId,
        status: 'succeeded',
        transferStatus: 'pending',
        paymentMethod: 'card'
      });

      await payment.save();
      console.log('Payment record created:', payment._id);
    }

    const populated = await Appointment.findById(appointment._id)
      .populate('barber', 'name')
      .populate('branch', 'name city address')
      .populate('services.serviceRef', 'name price duration');

    res.status(201).json({ 
      success: true, 
      appointment: populated 
    });

  } catch (error) {
    console.error('Create appointment error:', error.message);
    res.status(500).json({ error: 'Failed to create appointment', details: error.message });
  }
});

// Health check route
router.get('/', (req, res) => {
  res.json({ 
    message: 'Payments route active',
    stripeEnabled: !!stripe,
    platformFee: `${PLATFORM_FEE_PERCENTAGE}%`,
    tip: stripe ? 'Ready for payments' : 'Add STRIPE_SECRET_KEY to enable payments'
  });
});

export default router;