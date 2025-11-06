// routes/appointments.js
import express from 'express';
import Appointment from '../models/Appointment.js';
import Service from '../models/Service.js';

const router = express.Router();

// POST - Create appointment with totalPrice
router.post('/', async (req, res) => {
  try {
    const { customerName, email, phone, date, selectedServices, barber, branch } = req.body;

    if (!selectedServices || selectedServices.length === 0) {
      return res.status(400).json({ message: 'At least one service required' });
    }

    // Fetch service details
    const serviceIds = selectedServices.map(s => s.serviceRef);
    const services = await Service.find({ _id: { $in: serviceIds } });

    // Build services array with price
    const enrichedServices = selectedServices.map(selected => {
      const service = services.find(s => s._id.toString() === selected.serviceRef);
      if (!service) throw new Error(`Service not found: ${selected.serviceRef}`);
      return {
        serviceRef: service._id,
        name: service.name,
        price: service.price
      };
    });

    // Calculate total
    const totalPrice = enrichedServices.reduce((sum, s) => {
      return sum + parseFloat(s.price.replace('£', ''));
    }, 0);

    // Save appointment
    const appointment = new Appointment({
      customerName,
      email,
      phone,
      date: new Date(date),
      services: enrichedServices,
      totalPrice,
      barber,
      branch,
      status: 'pending'
    });

    await appointment.save();

    // Populate for response
    const populated = await Appointment.findById(appointment._id)
      .populate('branch', 'name city')
      .populate('services.serviceRef', 'name price');

    res.status(201).json(populated);
  } catch (error) {
    console.error('POST appointment error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET all with totalPrice
router.get('/', async (req, res) => {
  try {
    const appointments = await Appointment.find()
      .populate('branch', 'name city')
      .populate('services.serviceRef', 'name price')
      .sort({ date: -1 });

    res.json(appointments);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT - Update status
router.put('/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'confirmed', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    )
      .populate('branch', 'name city')
      .populate('services.serviceRef', 'name price');

    res.json(appointment);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;

// // routes/appointments.js
// import express from 'express';
// import Appointment from '../models/Appointment.js';
// import Service from '../models/Service.js';
// import sendEmail from '../utils/sendEmail.js';
// import { bookingRequestEmail, statusUpdateEmail } from '../utils/emailTemplates.js';

// const router = express.Router();
// // POST route ke start mein
// console.log('POST /appointments - Booking request received');
// // POST - Create appointment
// router.post('/', async (req, res) => {
//   try {
//     const { customerName, email, phone, date, selectedServices, barber, branch } = req.body;

//     if (!selectedServices || selectedServices.length === 0) {
//       return res.status(400).json({ message: 'At least one service required' });
//     }

//     const serviceIds = selectedServices.map(s => s.serviceRef);
//     const services = await Service.find({ _id: { $in: serviceIds } });

//     const enrichedServices = selectedServices.map(selected => {
//       const service = services.find(s => s._id.toString() === selected.serviceRef);
//       if (!service) throw new Error(`Service not found: ${selected.serviceRef}`);
//       return {
//         serviceRef: service._id,
//         name: service.name,
//         price: service.price
//       };
//     });

//     const totalPrice = enrichedServices.reduce((sum, s) => {
//       return sum + parseFloat(s.price.replace('£', ''));
//     }, 0);

//     const appointment = new Appointment({
//       customerName,
//       email,
//       phone,
//       date: new Date(date),
//       services: enrichedServices,
//       totalPrice,
//       barber,
//       branch,
//       status: 'pending'
//     });

//     await appointment.save();

//     const populated = await Appointment.findById(appointment._id)
//       .populate('branch', 'name city')
//       .populate('services.serviceRef', 'name price');

//     // Extract data for email
//     const serviceNames = enrichedServices.map(s => s.name).join(', ');
//     const [appointmentDate, appointmentTime] = new Date(date).toISOString().split('T');
//     const time = appointmentTime.slice(0, 5);

//     // Send Booking Request Email
//     try {
//       await sendEmail(
//         email,
//         'Your Barber Appointment Request',
//         bookingRequestEmail(
//           customerName,
//           appointmentDate,
//           time,
//           serviceNames,
//           populated.branch.name,
//           totalPrice.toFixed(2)
//         )
//       );
//     } catch (emailError) {
//       console.error('Failed to send booking email:', emailError);
//       // Don't fail the booking if email fails
//     }

//     res.status(201).json(populated);
//   } catch (error) {
//     console.error('POST appointment error:', error);
//     res.status(500).json({ message: 'Server error', error: error.message });
//   }
// });

// // PUT - Update status (Approve/Reject)
// router.put('/:id', async (req, res) => {
//   try {
//     const { status } = req.body;
//     if (!['pending', 'confirmed', 'rejected'].includes(status)) {
//       return res.status(400).json({ message: 'Invalid status' });
//     }

//     const appointment = await Appointment.findByIdAndUpdate(
//       req.params.id,
//       { status },
//       { new: true }
//     )
//       .populate('branch', 'name city')
//       .populate('services.serviceRef', 'name price');

//     if (!appointment) {
//       return res.status(404).json({ message: 'Appointment not found' });
//     }

//     // Send status update email
//     const serviceNames = appointment.services.map(s => s.name).join(', ');
//     const [date, timeWithSec] = new Date(appointment.date).toISOString().split('T');
//     const time = timeWithSec.slice(0, 5);

//     try {
//       await sendEmail(
//         appointment.email,
//         `Appointment ${status === 'confirmed' ? 'Approved' : 'Rejected'}`,
//         statusUpdateEmail(
//           appointment.customerName,
//           status,
//           date,
//           time,
//           serviceNames,
//           appointment.branch.name,
//           appointment.totalPrice.toFixed(2)
//         )
//       );
//     } catch (emailError) {
//       console.error('Failed to send status email:', emailError);
//     }

//     res.json(appointment);
//   } catch (error) {
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// export default router;