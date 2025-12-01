import express from 'express';
import Appointment from '../models/Appointment.js';
import Service from '../models/Service.js';
import mongoose from 'mongoose';

const router = express.Router();

//   GET all appointments (with filters)
router.get('/', async (req, res) => {
  try {
    const { barber, branch, status, date } = req.query;
    
    let filter = {};
    
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
      .sort({ date: -1 });

    res.json(appointments);
  } catch (error) {
    console.error('GET appointments error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

//   GET single appointment
router.get('/:id', async (req, res) => {
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

    res.json(appointment);
  } catch (error) {
    console.error('GET appointment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

//   GET appointments by barber and date (for booking conflicts)
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
      status: { $ne: 'rejected' }
    }).select('date duration status');

    res.json(appointments);
  } catch (error) {
    console.error('GET barber appointments error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

//   CREATE appointment (pay-later)
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
      totalPrice
    } = req.body;

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
    if (serviceIds.some(id => !mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid service ID' 
      });
    }

    const services = await Service.find({ _id: { $in: serviceIds } });
    if (services.length !== serviceIds.length) {
      return res.status(400).json({ 
        success: false,
        message: 'One or more services not found' 
      });
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

    // Calculate total if not provided
    const calculatedTotal = totalPrice || enrichedServices.reduce((sum, s) => {
      return sum + parseFloat(s.price.replace('£', '').trim());
    }, 0);

    // Create appointment
    const appointment = new Appointment({
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
    });

    await appointment.save();

    const populated = await Appointment.findById(appointment._id)
      .populate('barber', 'name email')
      .populate('branch', 'name city address')
      .populate('services.serviceRef', 'name price duration');

    console.log('  Appointment created:', appointment._id);
    res.status(201).json(populated);

  } catch (error) {
    console.error('  Create appointment error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to create appointment',
      error: error.message 
    });
  }
});

// UPDATE appointment status
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, paymentStatus } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid appointment ID' });
    }

    const updateData = {};
    
    if (status) {
      if (!['pending', 'confirmed', 'rejected', 'completed'].includes(status)) {
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

    const appointment = await Appointment.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('barber', 'name email')
      .populate('branch', 'name city address')
      .populate('services.serviceRef', 'name price duration');

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    console.log('  Appointment updated:', id);
    res.json(appointment);

  } catch (error) {
    console.error('  Update appointment error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

//   DELETE appointment
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid appointment ID' });
    }

    const appointment = await Appointment.findByIdAndDelete(id);

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    console.log('  Appointment deleted:', id);
    res.json({ 
      success: true, 
      message: 'Appointment deleted successfully' 
    });

  } catch (error) {
    console.error('  Delete appointment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;