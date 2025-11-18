// routes/payments.js
import express from 'express';
import Stripe from 'stripe';
import Appointment from '../models/Appointment.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv'
dotenv.config();
const router = express.Router();

// Initialize Stripe with secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// CREATE PAYMENT INTENT
router.post('/create-payment-intent', async (req, res) => {
  try {
    const { totalPrice, customerEmail, customerName } = req.body;

    // Validate
    if (!totalPrice || totalPrice <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid total price' 
      });
    }

    // Convert pounds to pence (Stripe uses smallest currency unit)
    const amountInPence = Math.round(totalPrice * 100);

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInPence,
      currency: 'gbp',
      automatic_payment_methods: {
        enabled: true,
      },
      receipt_email: customerEmail,
      description: `Barber appointment booking for ${customerName}`,
      metadata: {
        customerName: customerName,
        customerEmail: customerEmail
      }
    });

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });

  } catch (error) {
    console.error('Payment Intent Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
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
      paymentIntentId 
    } = req.body;

    // Validate required fields
    if (!customerName || !email || !phone || !date || !barber || !branch || !duration || !paymentIntentId) {
      return res.status(400).json({ 
        success: false,
        message: 'All fields are required' 
      });
    };

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

    // Verify payment with Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({ 
        success: false,
        message: 'Payment not completed. Please try again.' 
      });
    }

    // Create appointment
    const appointment = new Appointment({
      customerName: customerName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      date: new Date(date),
      services: selectedServices,
      totalPrice: totalPrice,
      totalPriceInCents: Math.round(totalPrice * 100),
      duration,
      barber,
      branch,
      status: 'confirmed', // Auto-confirm for paid bookings
      paymentIntentId: paymentIntentId,
      paymentStatus: 'paid'
    });

    await appointment.save();

    // Return populated appointment
    const populated = await Appointment.findById(appointment._id)
      .populate('barber', 'name')
      .populate('branch', 'name city address')
      .populate('services.serviceRef', 'name price duration');

    res.status(201).json({
      success: true,
      appointment: populated,
      message: 'Booking confirmed with payment!'
    });

  } catch (error) {
    console.error('Create Appointment with Payment Error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + error.message 
    });
  }
});

// WEBHOOK - Listen to Stripe events (Optional but recommended)
// router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
//   const sig = req.headers['stripe-signature'];
//   const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

//   let event;

//   try {
//     event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
//   } catch (err) {
//     console.error('Webhook signature verification failed:', err.message);
//     return res.status(400).send(`Webhook Error: ${err.message}`);
//   }

//   // Handle the event
//   switch (event.type) {
//     case 'payment_intent.succeeded':
//       const paymentIntent = event.data.object;
//       console.log('Payment succeeded:', paymentIntent.id);
      
//       // Update appointment status
//       await Appointment.findOneAndUpdate(
//         { paymentIntentId: paymentIntent.id },
//         { paymentStatus: 'paid', status: 'confirmed' }
//       );
//       break;

//     case 'payment_intent.payment_failed':
//       const failedPayment = event.data.object;
//       console.log('Payment failed:', failedPayment.id);
      
//       // Update appointment status
//       await Appointment.findOneAndUpdate(
//         { paymentIntentId: failedPayment.id },
//         { paymentStatus: 'failed', status: 'rejected' }
//       );
//       break;

//     default:
//       console.log(`Unhandled event type ${event.type}`);
//   }

//   res.json({ received: true });
// });

export default router;  