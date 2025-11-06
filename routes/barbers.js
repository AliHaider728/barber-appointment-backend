//new code 
// routes/barbers.js → YE FULL FILE REPLACE KAR DO

import express from 'express';
import Barber from '../models/Barber.js';
import Service from '../models/Service.js'; // YE ZAROORI HAI!
import mongoose from 'mongoose';

const router = express.Router();

// Helper: Parse specialties (string ya array)
const parseSpecialties = (specialties) => {
  if (Array.isArray(specialties)) return specialties.map(s => s.trim()).filter(Boolean);
  if (typeof specialties === 'string') return specialties.split(',').map(s => s.trim()).filter(Boolean);
  return [];
};

// GET all barbers
router.get('/', async (req, res) => {
  try {
    const barbers = await Barber.find().populate('branch', 'name city');
    res.json(barbers);
  } catch (error) {
  }
});

// GET single barber
router.get('/:id', async (req, res) => {
  try {
    const barber = await Barber.findById(req.params.id).populate('branch', 'name city');
    if (!barber) return res.status(404).json({ message: 'Barber not found' });
    res.json(barber);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /available — YE ROUTE 404 KA FIX HAI!
router.post('/available', async (req, res) => {
  const { branch, serviceIds } = req.body;

  if (!branch || !Array.isArray(serviceIds) || serviceIds.length === 0) {
    return res.status(400).json({ message: 'Branch and serviceIds required' });
  }

  try {
    // 1. Get barbers in selected branch
    const barbers = await Barber.find({ branch }).populate('branch', 'name city');

    // 2. Get selected service names
    const services = await Service.find({ _id: { $in: serviceIds } });
    const serviceNames = services.map(s => s.name);

    // 3. Filter barbers who can do ALL selected services
    const available = barbers.filter(barber =>
      serviceNames.every(name => barber.specialties.includes(name))
    );

    res.json(available);
  } catch (error) {
    console.error('POST /available error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// UPDATE barber
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, experienceYears, specialties, branch } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid barber ID' });
    if (!name || !experienceYears || !branch) return res.status(400).json({ message: 'Name, experience, and branch required' });

    const parsedSpecialties = parseSpecialties(specialties);
    if (parsedSpecialties.length === 0) return res.status(400).json({ message: 'At least one specialty required' });

    if (!mongoose.Types.ObjectId.isValid(branch)) return res.status(400).json({ message: 'Invalid branch ID' });

    const updateData = {
      name: name.trim(),
      experienceYears: Number(experienceYears),
      specialties: parsedSpecialties,
      branch
    };

    const updatedBarber = await Barber.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
    if (!updatedBarber) return res.status(404).json({ message: 'Barber not found' });

    const populated = await Barber.findById(updatedBarber._id).populate('branch', 'name city');
    res.json(populated);
  } catch (error) {
    console.error('PUT /:id error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE barber
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid barber ID' });

    const barber = await Barber.findByIdAndDelete(id);
    if (!barber) return res.status(404).json({ message: 'Barber not found' });

    res.json({ message: 'Barber deleted successfully' });
  } catch (error) {
    console.error('DELETE /:id error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
//old code 
// import express from 'express';
// import Barber from '../models/Barber.js';
// import mongoose from 'mongoose';

// const router = express.Router();

// // Helper: Convert string to array if needed
// const parseSpecialties = (specialties) => {
//   if (Array.isArray(specialties)) return specialties.map(s => s.trim()).filter(s => s);
//   if (typeof specialties === 'string') return specialties.split(',').map(s => s.trim()).filter(s => s);
//   return [];
// };

// // GET all barbers with branch
// router.get('/', async (req, res) => {
//   try {
//     const barbers = await Barber.find().populate('branch', 'name city');
//     res.json(barbers);
//   } catch (error) {
//     console.error('GET /barbers error:', error);
//     res.status(500).json({ message: 'Server error', error: error.message });
//   }
// });

// // GET single
// router.get('/:id', async (req, res) => {
//   try {
//     const barber = await Barber.findById(req.params.id).populate('branch', 'name city');
//     if (!barber) return res.status(404).json({ message: 'Barber not found' });
//     res.json(barber);
//   } catch (error) {
//     console.error('GET /:id error:', error);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // CREATE
// router.post('/', async (req, res) => {
//   try {
//     const { name, experienceYears, specialties, branch } = req.body;

//     // Validation
//     if (!name || !experienceYears || !branch) {
//       return res.status(400).json({ message: 'Name, experience, and branch are required' });
//     }

//     const parsedSpecialties = parseSpecialties(specialties);
//     if (parsedSpecialties.length === 0) {
//       return res.status(400).json({ message: 'At least one specialty required' });
//     }

//     // Validate ObjectId
//     if (!mongoose.Types.ObjectId.isValid(branch)) {
//       return res.status(400).json({ message: 'Invalid branch ID' });
//     }

//     const barber = new Barber({
//       name: name.trim(),
//       experienceYears: Number(experienceYears),
//       specialties: parsedSpecialties,
//       branch
//     });

//     await barber.save();
//     const populated = await Barber.findById(barber._id).populate('branch', 'name city');
//     res.status(201).json(populated);
//   } catch (error) {
//     console.error('POST /barbers error:', error);
//     res.status(500).json({ message: 'Server error', error: error.message });
//   }
// });

// // UPDATE
// router.put('/:id', async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { name, experienceYears, specialties, branch } = req.body;

//     // Validate ID
//     if (!mongoose.Types.ObjectId.isValid(id)) {
//       return res.status(400).json({ message: 'Invalid barber ID' });
//     }

//     // Validation
//     if (!name || !experienceYears || !branch) {
//       return res.status(400).json({ message: 'Name, experience, and branch are required' });
//     }

//     const parsedSpecialties = parseSpecialties(specialties);
//     if (parsedSpecialties.length === 0) {
//       return res.status(400).json({ message: 'At least one specialty required' });
//     }

//     if (!mongoose.Types.ObjectId.isValid(branch)) {
//       return res.status(400).json({ message: 'Invalid branch ID' });
//     }

//     const updateData = {
//       name: name.trim(),
//       experienceYears: Number(experienceYears),
//       specialties: parsedSpecialties,
//       branch
//     };

//     const updatedBarber = await Barber.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
//     if (!updatedBarber) {
//       return res.status(404).json({ message: 'Barber not found' });
//     }

//     const populated = await Barber.findById(updatedBarber._id).populate('branch', 'name city');
//     res.json(populated);
//   } catch (error) {
//     console.error('PUT /:id error:', error);
//     res.status(500).json({ message: 'Server error', error: error.message });
//   }
// });

// // DELETE
// router.delete('/:id', async (req, res) => {
//   try {
//     const { id } = req.params;
//     if (!mongoose.Types.ObjectId.isValid(id)) {
//       return res.status(400).json({ message: 'Invalid barber ID' });
//     }

//     const barber = await Barber.findByIdAndDelete(id);
//     if (!barber) {
//       return res.status(404).json({ message: 'Barber not found' });
//     }

//     res.json({ message: 'Barber deleted successfully' });
//   } catch (error) {
//     console.error('DELETE /:id error:', error);
//     res.status(500).json({ message: 'Server error', error: error.message });
//   }
// });

// export default router;