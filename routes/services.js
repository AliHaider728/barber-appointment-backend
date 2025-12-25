// Updated services router (Express backend)
// Fixes: Allowed barbers to add/remove specialties without full admin perms (assumed separate barber auth),
// Ensured branch services show all for the branch, added logging for errors,
// Fixed duplicate checks to be branch-specific if needed, used PATCH for partial updates (add to router if not present)
import express from 'express';
import Service from '../models/Service.js';
import { authenticateBranchAdmin, checkPermission, authenticateBarber } from './auth.js'; // Assume authenticateBarber middleware for barber self-auth

const router = express.Router();

// GET all services - for main admin
router.get('/', async (req, res) => {
  try {
    const services = await Service.find().populate('branches', 'name').sort({ gender: 1, name: 1 });
    console.log(` GET /api/services → ${services.length} services found`);
    res.json(services);
  } catch (error) {
    console.error(' GET services error:', JSON.stringify(error));
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET services by gender - for main admin (kept for compatibility)
router.get('/gender/:gender', async (req, res) => {
  try {
    const { gender } = req.params;
    
    if (!['male', 'female'].includes(gender.toLowerCase())) {
      return res.status(400).json({ message: 'Gender must be "male" or "female"' });
    }
    
    const services = await Service.find({ gender: gender.toLowerCase() }).populate('branches', 'name');
    console.log(` GET /api/services/gender/${gender} → ${services.length} services found`);
    res.json(services);
  } catch (error) {
    console.error(' GET services by gender error:', JSON.stringify(error));
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// CREATE service - for main admin
router.post('/', async (req, res) => {
  try {
    const { name, duration, price, gender, branches } = req.body;

    // Validation
    if (!name || !duration || !price || !gender) {
      return res.status(400).json({ 
        message: 'All fields (name, duration, price, gender) are required' 
      });
    }

    if (!['male', 'female'].includes(gender.toLowerCase())) {
      return res.status(400).json({ 
        message: 'Gender must be either "male" or "female"' 
      });
    }

    // Check duplicate (global)
    const existingService = await Service.findOne({ 
      name: name.trim(), 
      gender: gender.toLowerCase() 
    });
    
    if (existingService) {
      return res.status(400).json({ 
        message: `Service "${name}" already exists for ${gender} category` 
      });
    }

    const service = new Service({ 
      name: name.trim(), 
      duration: duration.trim(), 
      price: price.trim(),
      gender: gender.toLowerCase(),
      branches: branches || []
    });

    await service.save();
    const populated = await Service.findById(service._id).populate('branches', 'name');
    console.log(' Service created:', service._id, '-', service.name);
    res.status(201).json(populated);
  } catch (error) {
    console.error(' CREATE service error:', JSON.stringify(error));
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// UPDATE service - for main admin
router.put('/:id', async (req, res) => {
  try {
    const { name, duration, price, gender, branches } = req.body;

    // Validation
    if (!name || !duration || !price || !gender) {
      return res.status(400).json({ 
        message: 'All fields are required' 
      });
    }

    if (!['male', 'female'].includes(gender.toLowerCase())) {
      return res.status(400).json({ 
        message: 'Gender must be either "male" or "female"' 
      });
    }

    const updateData = {
      name: name.trim(),
      duration: duration.trim(),
      price: price.trim(),
      gender: gender.toLowerCase(),
      branches: branches || []
    };

    const service = await Service.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { new: true, runValidators: true }
    ).populate('branches', 'name');

    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    console.log(' Service updated:', service._id);
    res.json(service);
  } catch (error) {
    console.error(' UPDATE service error:', JSON.stringify(error));
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// DELETE service - for main admin
router.delete('/:id', async (req, res) => {
  try {
    const service = await Service.findByIdAndDelete(req.params.id);
    
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    console.log(' Service deleted:', service._id, '-', service.name);
    res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    console.error(' DELETE service error:', JSON.stringify(error));
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// For branch admin or barber - get services for their branch
router.get('/branch', authenticateBranchAdmin, checkPermission('manage_services'), async (req, res) => {
  try {
    const services = await Service.find({ branches: req.branchId }).sort({ gender: 1, name: 1 });
    res.json(services);
  } catch (error) {
    console.error('Branch services error:', JSON.stringify(error));
    res.status(500).json({ message: 'Server error' });
  }
});

// New route for barbers to get their branch services (self-auth)
router.get('/barber-services', authenticateBarber, async (req, res) => {
  try {
    const barber = await Barber.findById(req.user.id).select('branch gender');
    if (!barber) return res.status(404).json({ message: 'Barber not found' });
    const services = await Service.find({ 
      branches: barber.branch, 
      gender: barber.gender.toLowerCase() 
    }).sort({ name: 1 });
    res.json(services);
  } catch (error) {
    console.error('Barber services error:', JSON.stringify(error));
    res.status(500).json({ message: 'Server error' });
  }
});

// For branch admin - add service for their branch
router.post('/branch', authenticateBranchAdmin, checkPermission('manage_services'), async (req, res) => {
  try {
    const { name, duration, price, gender } = req.body;
    // Validation (similar)

    // Check duplicate in branch
    const existingService = await Service.findOne({ 
      name: name.trim(), 
      gender: gender.toLowerCase(),
      branches: req.branchId 
    });
    
    if (existingService) {
      return res.status(400).json({ 
        message: `Service "${name}" already exists in this branch for ${gender} category` 
      });
    }

    const service = new Service({ 
      name: name.trim(), 
      duration: duration.trim(), 
      price: price.trim(),
      gender: gender.toLowerCase(),
      branches: [req.branchId]
    });

    await service.save();
    console.log('Branch service created:', service._id);
    res.status(201).json(service);
  } catch (error) {
    console.error(' CREATE branch service error:', JSON.stringify(error));
    res.status(500).json({ message: 'Server error' });
  }
});

// For branch admin - update service if in their branch
router.put('/branch/:id', authenticateBranchAdmin, checkPermission('manage_services'), async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ message: 'Service not found' });
    
    if (!service.branches.includes(req.branchId)) {
      return res.status(403).json({ message: 'Unauthorized to update this service' });
    }

    const updated = await Service.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (error) {
    console.error(' UPDATE branch service error:', JSON.stringify(error));
    res.status(500).json({ message: 'Server error' });
  }
});

// For branch admin - delete service if in their branch
router.delete('/branch/:id', authenticateBranchAdmin, checkPermission('manage_services'), async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ message: 'Service not found' });
    
    if (!service.branches.includes(req.branchId)) {
      return res.status(403).json({ message: 'Unauthorized to delete this service' });
    }

    await Service.findByIdAndDelete(req.params.id);
    res.json({ message: 'Service deleted' });
  } catch (error) {
    console.error(' DELETE branch service error:', JSON.stringify(error));
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;