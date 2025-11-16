import express from 'express';
import Stripe from 'stripe';
import Barber from '../models/Barber.js';
import Appointment from '../models/Appointment.js';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// ONBOARD BARBER
router.post('/barber/:id/onboard', async (req, res) => {
  try {
    const barber = await Barber.findById(req.params.id);
    if (!barber) return res.status(404).json({ error: 'Barber not found' });

    let account;
    if (barber.stripeAccountId) {
      account = await stripe.accounts.retrieve(barber.stripeAccountId);
    } else {
      account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: `${barber.name.replace(' ', '.')}@test.com`,
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      });
      barber.stripeAccountId = account.id;
      await barber.save();
    }

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${process.env.FRONTEND_URL}/admin/barbers`,
      return_url: `${process.env.FRONTEND_URL}/admin/barbers?onboarded=true`,
      type: 'account_onboarding',
    });

    res.json({ url: accountLink.url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREATE INTENT
router.post('/create-intent', async (req, res) => {
  const { appointmentId } = req.body;
  const appointment = await Appointment.findById(appointmentId).populate('barber');

  if (!appointment.barber.stripeAccountId) {
    return res.status(400).json({ error: 'Barber not connected' });
  }

  const amount = Math.round(appointment.totalPrice * 100);
  const intent = await stripe.paymentIntents.create({
    amount,
    currency: 'usd',
    payment_method_types: ['card'],
    application_fee_amount: Math.round(amount * 0.1),
    transfer_data: { destination: appointment.barber.stripeAccountId },
    metadata: { appointmentId: appointment._id.toString() },
    capture_method: 'manual'
  });

  await Appointment.findByIdAndUpdate(appointmentId, {
    paymentIntentId: intent.id,
    totalPriceInCents: amount,
    paymentStatus: 'pending'
  });

  res.json({ clientSecret: intent.client_secret });
});

// CAPTURE
router.post('/capture/:intentId', async (req, res) => {
  try {
    await stripe.paymentIntents.capture(req.params.intentId);
    await Appointment.findOneAndUpdate(
      { paymentIntentId: req.params.intentId },
      { paymentStatus: 'captured' }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;