import express from 'express';
import Appointment from '../models/Appointment.js';
import Service from '../models/Service.js'; // Added import for service enrichment
import mongoose from 'mongoose'; // Added for ObjectId validation
import dotenv from 'dotenv';


dotenv.config();
const router = express.Router();

// Safe Stripe initialization — ye line crash nahi karegi chahe key na ho
let stripe = null;

if (process.env.STRIPE_SECRET_KEY) {
  try {
    const { Stripe } = await import('stripe');
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16', // latest stable
    });
    console.log('Stripe initialized successfully');
  } catch (err) {
    console.error('Stripe import failed:', err.message);
  }
} else {
  console.log('STRIPE_SECRET_KEY not found — payments disabled (safe mode)');
}

// CREATE PAYMENT INTENT
router.post('/create-payment-intent', async (req, res) => {
  if (!stripe) {
    return res.status(400).json({ 
      error: 'Payment gateway not configured yet. Contact admin.' 
    });
  }

  try {
    const { totalPrice, customerEmail, customerName } = req.body;

    if (!totalPrice || totalPrice <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const amountInCents = Math.round(totalPrice * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'gbp',
      receipt_email: customerEmail || undefined,
      metadata: {
        customerName: customerName || 'Anonymous',
        customerEmail: customerEmail || 'no-email@temp.com'
      }
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
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

    // Validate required fields
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

    // Enrich services with full data (FIX: Added this to match pay-later route and satisfy schema)
    const enrichedServices = selectedServices.map(sel => {
      const service = services.find(s => s._id.toString() === sel.serviceRef);
      return {
        serviceRef: service._id,
        name: service.name,
        price: service.price,
        duration: service.duration
      };
    });

    // Calculate total price if not provided (FIX: Added for consistency)
    const calculatedTotalPrice = totalPrice || enrichedServices.reduce((sum, s) => {
      return sum + parseFloat(s.price.replace('£', '').trim());
    }, 0);

    // Agar payOnline true hai aur paymentIntentId hai → verify karo
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
      // FIX: Fail if payOnline but no Stripe to prevent unverified 'paid' bookings
      return res.status(400).json({ error: 'Payment system not available for online payments' });
    }

    // FIX: Add basic conflict check (query existing bookings for overlap)
    const appointmentDate = new Date(date); // Assuming UTC for consistency
    const endDate = new Date(appointmentDate.getTime() + duration * 60000); // duration in minutes
    const conflictingBookings = await Appointment.find({
      barber,
      date: { $lt: endDate },
      $or: [{ status: { $ne: 'rejected' } }],
      // Simple overlap check: existing end > new start AND existing start < new end
      // Note: For full accuracy, store endDate or use more precise logic
    }).where({ $expr: { $gt: [{ $add: ['$date', { $multiply: ['$duration', 60000] }] }, appointmentDate] } });

    if (conflictingBookings.length > 0) {
      return res.status(409).json({ error: 'Time slot conflict detected' });
    }
    
    // Appointment banao
    const appointment = new Appointment({
      customerName: customerName?.trim() || 'Guest',
      email: email?.trim().toLowerCase() || 'no-email@temp.com',
      phone: phone?.trim() || 'N/A',
      date: appointmentDate, // FIX: Ensure UTC consistency
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
    tip: stripe ? 'Ready for payments' : 'Add STRIPE_SECRET_KEY to enable payments'
  });
});

export default router;