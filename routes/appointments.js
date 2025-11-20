import express from 'express';
import Appointment from '../models/Appointment.js';
import Service from '../models/Service.js';
import mongoose from 'mongoose';

const router = express.Router();

// CREATE APPOINTMENT (Updated with payment fields)
router.post('/', async (req, res) => {
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
      payOnline = false,
      paymentIntentId = null  
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

    // Create appointment with payment fields
    const appointment = new Appointment({
      customerName: customerName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      date: new Date(date),
      services: enrichedServices,
      totalPrice: calculatedTotalPrice,
      totalPriceInCents: Math.round(calculatedTotalPrice * 100),
      duration,
      barber,
      branch,
      status: 'pending',
      payOnline,
      paymentIntentId,
      paymentStatus: payOnline && paymentIntentId ? 'paid' : 'pending'
    });

    await appointment.save();

    // Return populated appointment
    const populated = await Appointment.findById(appointment._id)
      .populate('barber', 'name')
      .populate('branch', 'name city address')
      .populate('services.serviceRef', 'name price duration');

    res.status(201).json(populated);
  } catch (error) {
    console.error('Create appointment error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET ALL APPOINTMENTS – POPULATED
router.get('/', async (req, res) => {
  try {
    const appointments = await Appointment.find()
      .populate('barber', 'name')
      .populate('branch', 'name city address')
      .populate('services.serviceRef', 'name price duration')
      .sort({ date: -1 });

    res.json(appointments);
  } catch (error) {
    console.error('GET all appointments error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET APPOINTMENTS BY BARBER & DATE (for time slots)
router.get('/barber/:barberId/date/:date', async (req, res) => {
  try {
    const { barberId, date } = req.params;

    if (!mongoose.Types.ObjectId.isValid(barberId)) {
      return res.status(400).json({ message: 'Invalid barber ID' });
    }

    const start = new Date(date);
    const end = new Date(date);
    end.setDate(end.getDate() + 1);

    const bookings = await Appointment.find({
      barber: barberId,
      date: { $gte: start, $lt: end },
      status: { $ne: 'rejected' } // Don't include rejected appointments
    }).select('date duration status');

    res.json(bookings);
  } catch (error) {
    console.error('GET bookings by barber/date error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// UPDATE STATUS (Approve / Reject)
router.put('/:id', async (req, res) => {
  try {
    const { status } = req.body;

    if (!['pending', 'confirmed', 'rejected', 'completed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    )
      .populate('barber', 'name')
      .populate('branch', 'name city')
      .populate('services.serviceRef', 'name price duration');

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    res.json(appointment);
  } catch (error) {
    console.error('Update appointment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE APPOINTMENT
router.delete('/:id', async (req, res) => {
  try {
    const appointment = await Appointment.findByIdAndDelete(req.params.id);

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    res.json({ message: 'Appointment deleted successfully' });
  } catch (error) {
    console.error('Delete appointment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;