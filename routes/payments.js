import express from 'express';
import Stripe from 'stripe';
import Appointment from '../models/Appointment.js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// CREATE PAYMENT INTENT
router.post('/create-payment-intent', async (req, res) => {
  try {
    const { totalPrice, customerEmail, customerName } = req.body;

    if (!totalPrice || totalPrice <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Convert to cents (Stripe uses smallest currency unit)
    const amountInCents = Math.round(totalPrice * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'gbp',
      receipt_email: customerEmail,
      metadata: {
        customerName,
        customerEmail
      }
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    console.error('Payment intent error:', error);
    res.status(500).json({ error: error.message });
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

    // Validate payment intent
    if (payOnline && paymentIntentId) {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      if (paymentIntent.status !== 'succeeded') {
        return res.status(400).json({ error: 'Payment not completed' });
      }
    }

    // Create appointment
    const appointment = new Appointment({
      customerName: customerName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      date: new Date(date),
      services: selectedServices,
      totalPrice,
      totalPriceInCents: Math.round(totalPrice * 100),
      duration,
      barber,
      branch,
      status: 'confirmed', // Auto-confirm if payment succeeded
      payOnline,
      paymentIntentId,
      paymentStatus: 'paid'
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
    console.error('Create appointment with payment error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
 
 