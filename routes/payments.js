// routes/payments.js
import express from 'express';
import Appointment from '../models/Appointment.js';
import dotenv from 'dotenv';
dotenv.config();

const router = express.Router();

// Safe Stripe init
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  try {
    const { Stripe } = await import('stripe');
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });
    console.log('Stripe loaded successfully');
  } catch (err) {
    console.error('Stripe failed to load:', err.message);
  }
}

// 1. Create Payment Intent
router.post('/create-payment-intent', async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Payment system not ready' });

  const { totalPrice, customerEmail, customerName } = req.body;

  if (!totalPrice || totalPrice <= 0)
    return res.status(400).json({ error: 'Invalid amount' });

  try {
    const amount = Math.round(totalPrice * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'gbp',
      receipt_email: customerEmail || undefined,
      metadata: {
        customerName: customerName || 'Guest',
        customerEmail: customerEmail || 'no-email@temp.com',
      },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (err) {
    console.error('PaymentIntent error:', err.message);
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
});

// 2. Create Appointment AFTER Successful Payment (NO MORE 500!)
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
      payOnline = true,
    } = req.body;

    // Verify payment if online
    if (payOnline && paymentIntentId && stripe) {
      try {
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (pi.status !== 'succeeded') {
          return res.status(400).json({ error: 'Payment not successful' });
        }
      } catch (err) {
        return res.status(400).json({ error: 'Invalid payment' });
      }
    }

    // Create appointment
    const appointment = new Appointment({
      customerName: customerName?.trim() || 'Guest',
      email: email?.trim().toLowerCase() || 'no-email@temp.com',
      phone: phone?.trim() || 'N/A',
      date: new Date(date),
      services: selectedServices || [],
      totalPrice: Number(totalPrice) || 0,
      totalPriceInCents: Math.round((Number(totalPrice) || 0) * 100),
      duration: Number(duration) || 30,
      barber,
      branch,
      status: payOnline && paymentIntentId ? 'confirmed' : 'pending',
      payOnline,
      paymentIntentId: payOnline ? paymentIntentId : null,
      paymentStatus: payOnline && paymentIntentId ? 'paid' : 'pending',
    });

    await appointment.save();

    // SAFE POPULATE — never crash again!
    let populated;
    try {
      populated = await Appointment.findById(appointment._id)
        .populate('barber', 'name')
        .populate('branch', 'name city address')
        .populate('services.serviceRef', 'name price duration')
        .lean({ getters: true });
    } catch (err) {
      console.warn('Populate failed, sending raw:', err.message);
      populated = appointment.toObject();
    }

    res.status(201).json({
      success: true,
      appointment: populated,
    });
  } catch (error) {
    console.error('Appointment creation failed:', error);
    res.status(500).json({
      error: 'Failed to book appointment',
      details: error.message,
    });
  }
});

// Health check
router.get('/', (req, res) => {
  res.json({ status: 'Payments API alive', stripe: !!stripe });
});

export default router;