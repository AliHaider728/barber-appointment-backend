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

const PLATFORM_FEE_PERCENTAGE = 10;

let stripe = null;

if (process.env.STRIPE_SECRET_KEY) {
  try {
    const { Stripe } = await import('stripe');
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });
    console.log(' Stripe initialized successfully');
  } catch (err) {
    console.error(' Stripe import failed:', err.message);
  }
} else {
  console.log('  STRIPE_SECRET_KEY not found - payments disabled');
}

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

    const barber = await Barber.findById(barberId);
    if (!barber) {
      return res.status(404).json({ error: 'Barber not found' });
    }

    const platformFee = (totalPrice * PLATFORM_FEE_PERCENTAGE) / 100;
    const barberAmount = totalPrice - platformFee;

    const amountInCents = Math.round(totalPrice * 100);
    const platformFeeInCents = Math.round(platformFee * 100);

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

    if (!customerName || !email || !phone || !date || !barber || !branch || !duration) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (!selectedServices || !Array.isArray(selectedServices) || selectedServices.length === 0) {
      return res.status(400).json({ message: 'At least one service is required' });
    }

    if (!mongoose.Types.ObjectId.isValid(barber) || !mongoose.Types.ObjectId.isValid(branch)) {
      return res.status(400).json({ message: 'Invalid barber or branch ID' });
    }

    const serviceIds = selectedServices.map(s => s.serviceRef).filter(Boolean);
    if (serviceIds.some(id => !mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({ message: 'Invalid service ID' });
    }

    const services = await Service.find({ _id: { $in: serviceIds } });
    if (services.length !== serviceIds.length) {
      return res.status(400).json({ message: 'One or more services not found' });
    }

    const enrichedServices = selectedServices.map(sel => {
      const service = services.find(s => s._id.toString() === sel.serviceRef);
      return {
        serviceRef: service._id,
        name: service.name,
        price: service.price,
        duration: service.duration
      };
    });

    const calculatedTotalPrice = totalPrice || enrichedServices.reduce((sum, s) => {
      return sum + parseFloat(s.price.replace('£', '').trim());
    }, 0);

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

router.get('/stripe/status', verifyBarber, async (req, res) => {
  try {
    const barber = await Barber.findById(req.barber.id);
    if (!barber) {
      return res.status(404).json({ message: 'Barber not found' });
    }

    let connected = false;
    let chargesEnabled = false;
    let payoutsEnabled = false;
    let detailsSubmitted = false;

    if (barber.stripeAccountId && stripe) {
      try {
        const account = await stripe.accounts.retrieve(barber.stripeAccountId);
        connected = true;
        chargesEnabled = account.charges_enabled;
        payoutsEnabled = account.payouts_enabled;
        detailsSubmitted = account.details_submitted;
      } catch (stripeErr) {
        console.error('  Stripe account retrieve error:', stripeErr.message);
        if (stripeErr.code === 'resource_missing') {
          barber.stripeAccountId = null;
          await barber.save();
        }
      }
    }

    res.json({
      connected,
      chargesEnabled,
      payoutsEnabled,
      detailsSubmitted,
      stripeAccountId: barber.stripeAccountId || null
    });
  } catch (error) {
    console.error('Stripe status error:', error);
    res.status(500).json({ message: 'Failed to get Stripe status' });
  }
});

router.get('/barber/me', verifyBarber, async (req, res) => {
  try {
    const payments = await Payment.find({ barber: req.barber.id })
      .populate('appointment', 'customerName date totalPrice')
      .sort({ createdAt: -1 });

    const summary = {
      totalEarnings: payments.reduce((sum, p) => sum + (p.barberAmount || 0), 0),
      pendingAmount: payments.filter(p => p.transferStatus === 'pending').reduce((sum, p) => sum + (p.barberAmount || 0), 0),
      transferredAmount: payments.filter(p => p.transferStatus === 'completed').reduce((sum, p) => sum + (p.barberAmount || 0), 0),
      totalPayments: payments.length
    };

    res.json({ payments, summary });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ message: 'Failed to get payments' });
  }
});

router.post('/stripe/connect', verifyBarber, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ 
      error: 'Stripe not configured',
      message: 'Payment processing is not available. Please contact support.'
    });
  }

  if (!process.env.FRONTEND_URL) {
    console.error(' FRONTEND_URL not configured');
    return res.status(500).json({ 
      error: 'Configuration error',
      message: 'Payment setup incomplete. Contact administrator.'
    });
  }

  try {
    const barber = await Barber.findById(req.barber.id);
    if (!barber) {
      return res.status(404).json({ error: 'Barber not found' });
    }

    if (!barber.email || !barber.email.includes('@')) {
      return res.status(400).json({ 
        error: 'Invalid email',
        message: 'Please update your profile with a valid email before connecting Stripe.'
      });
    }

    let accountId = barber.stripeAccountId;

    if (!accountId) {
      console.log('  Creating new Stripe Connect account for:', barber.name);
      
      try {
        const nameParts = barber.name.trim().split(' ');
        const firstName = nameParts[0] || barber.name;
        const lastName = nameParts.slice(1).join(' ') || firstName;

        const account = await stripe.accounts.create({
          type: 'express',
          country: 'GB',
          email: barber.email,
          business_type: 'individual',
          individual: {
            first_name: firstName,
            last_name: lastName,
            email: barber.email,
          },
          business_profile: {
            name: barber.name,
            product_description: 'Professional barber services',
          },
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
        });

        accountId = account.id;
        barber.stripeAccountId = accountId;
        await barber.save();
        
        console.log(' Stripe account created:', accountId);
      } catch (createError) {
        console.error(' Stripe account creation failed:', createError);
        
        return res.status(500).json({ 
          error: 'Account creation failed',
          message: createError.message || 'Failed to create Stripe account. Please try again.',
          details: createError.raw?.message || createError.message
        });
      }
    } else {
      console.log(' Using existing Stripe account:', accountId);
      
      try {
        await stripe.accounts.retrieve(accountId);
      } catch (retrieveError) {
        if (retrieveError.code === 'resource_missing') {
          console.log('  Previous account deleted, creating new one');
          barber.stripeAccountId = null;
          await barber.save();
          return res.status(400).json({
            error: 'Account reset required',
            message: 'Please try connecting again.'
          });
        }
        throw retrieveError;
      }
    }

    try {
      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${process.env.FRONTEND_URL}/barber-dashboard?refresh=stripe`,
        return_url: `${process.env.FRONTEND_URL}/barber-dashboard?success=stripe`,
        type: 'account_onboarding',
        collect: 'eventually_due',
      });

      console.log(' Onboarding link created');
      
      res.json({ 
        success: true,
        onboardingUrl: accountLink.url 
      });

    } catch (linkError) {
      console.error(' Account link creation failed:', linkError);
      
      return res.status(500).json({ 
        error: 'Link creation failed',
        message: linkError.message || 'Failed to create onboarding link. Please try again.',
        details: linkError.raw?.message || linkError.message
      });
    }

  } catch (error) {
    console.error(' Stripe connect error:', error);
    
    res.status(500).json({ 
      error: error.type || 'Connection failed',
      message: error.message || 'Failed to connect Stripe account',
      code: error.code,
      details: error.raw?.message || error.message
    });
  }
});

router.get('/', (req, res) => {
  res.json({ 
    message: 'Payments route active',
    stripeEnabled: !!stripe,
    platformFee: `${PLATFORM_FEE_PERCENTAGE}%`,
    frontendUrl: process.env.FRONTEND_URL ? 'configured' : 'missing',
    tip: stripe ? 'Ready for payments' : 'Add STRIPE_SECRET_KEY to enable payments'
  });
});

export default router;