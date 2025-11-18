// routes/payments.js — FINAL CRASH-PROOF VERSION (Vercel + Local Safe)
import express from 'express';
import Appointment from '../models/Appointment.js';
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
    }

    // Appointment banao
    const appointment = new Appointment({
      customerName: customerName?.trim() || 'Guest',
      email: email?.trim().toLowerCase() || 'no-email@temp.com',
      phone: phone?.trim() || 'N/A',
      date: new Date(date),
      services: selectedServices || [],
      totalPrice: totalPrice || 0,
      totalPriceInCents: Math.round((totalPrice || 0) * 100),
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