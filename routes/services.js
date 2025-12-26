// Updated services route (services.js)
import express from 'express';
import Service from '../models/Service.js';
import Barber from '../models/Barber.js'; // Added import for Barber model
import { authenticateBranchAdmin, checkPermission } from './auth.js';

const router = express.Router();

// ✅ HELPER: Normalize branches to always be an array
const normalizeBranches = (branches) => {
  if (!branches) return [];
  if (Array.isArray(branches)) return branches;
  return [branches]; // Convert single value to array
};

// ✅ HELPER: Extract branch ID safely
const extractBranchId = (branch) => {
  if (typeof branch === 'string') return branch;
  if (branch?._id) return branch._id.toString();
  return null;
};

// GET all services - for main admin
router.get('/', async (req, res) => {
  try {
    const services = await Service.find().populate('branches', 'name').sort({ gender: 1, name: 1 });
    console.log(` GET /api/services → ${services.length} services found`);
    res.json(services);
  } catch (error) {
    console.error('❌ GET services error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET services by gender - for barbers/customers
router.get('/gender/:gender', async (req, res) => {
  try {
    const { gender } = req.params;
    
    if (!['male', 'female'].includes(gender.toLowerCase())) {
      return res.status(400).json({ message: 'Gender must be "male" or "female"' });
    }
    
    const services = await Service.find({ gender: gender.toLowerCase() })
      .populate('branches', 'name city')
      .sort({ name: 1 });
    
    console.log(`✅ GET /api/services/gender/${gender} → ${services.length} services found`);
    res.json(services);
  } catch (error) {
    console.error('❌ GET services by gender error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET services by branch - for filtering
router.get('/branch/:branchId', async (req, res) => {
  try {
    const { branchId } = req.params;
    
    const services = await Service.find({ branches: branchId })
      .populate('branches', 'name city')
      .sort({ gender: 1, name: 1 });
    
    console.log(`✅ GET /api/services/branch/${branchId} → ${services.length} services found`);
    res.json(services);
  } catch (error) {
    console.error('❌ GET services by branch error:', error);
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

    // Check duplicate
    const existingService = await Service.findOne({ 
      name: name.trim(), 
      gender: gender.toLowerCase() 
    });
    
    if (existingService) {
      return res.status(400).json({ 
        message: `Service "${name}" already exists for ${gender} category` 
      });
    }

    // ✅ Normalize branches to array
    const normalizedBranches = normalizeBranches(branches);

    const service = new Service({ 
      name: name.trim(), 
      duration: duration.trim(), 
      price: price.trim(),
      gender: gender.toLowerCase(),
      branches: normalizedBranches
    });

    await service.save();

    // ✅ Auto-add to matching barbers' specialties
    try {
      const matchingBarbers = await Barber.find({
        gender: service.gender,
        branch: { $in: service.branches }
      });

      let addedCount = 0;
      for (const b of matchingBarbers) {
        if (!b.specialties.includes(service.name)) {
          b.specialties.push(service.name);
          await b.save();
          addedCount++;
        }
      }
      console.log(`✅ Auto-added new service "${service.name}" to ${addedCount} matching barbers`);
    } catch (autoErr) {
      console.error('❌ Auto-add to barbers error:', autoErr);
      // Continue without failing the response
    }

    const populated = await Service.findById(service._id).populate('branches', 'name city');
    console.log('✅ Service created:', service._id, '-', service.name);
    res.status(201).json(populated);
  } catch (error) {
    console.error('❌ CREATE service error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// UPDATE service - for main admin/barbers
router.put('/:id', async (req, res) => {
  try {
    const { name, duration, price, gender, branches } = req.body;

    // Find existing service first
    const existingService = await Service.findById(req.params.id);
    if (!existingService) {
      return res.status(404).json({ message: 'Service not found' });
    }

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

    // ✅ Normalize branches - handle both array and single values
    let normalizedBranches = normalizeBranches(branches);
    
    // If branches is provided, use it; otherwise keep existing
    if (!branches || normalizedBranches.length === 0) {
      // ✅ Keep existing branches if none provided
      normalizedBranches = normalizeBranches(existingService.branches);
    }

    // ✅ Remove duplicates and clean branch IDs
    const cleanBranches = [...new Set(
      normalizedBranches
        .map(extractBranchId)
        .filter(Boolean)
    )];

    const updateData = {
      name: name.trim(),
      duration: duration.trim(),
      price: price.trim(),
      gender: gender.toLowerCase(),
      branches: cleanBranches
    };

    const service = await Service.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { new: true, runValidators: true }
    ).populate('branches', 'name city');

    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    console.log('✅ Service updated:', service._id, '- branches:', cleanBranches.length);
    res.json(service);
  } catch (error) {
    console.error('❌ UPDATE service error:', error);
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

    console.log('✅ Service deleted:', service._id, '-', service.name);
    res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    console.error('❌ DELETE service error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ✅ FIX DATABASE - Convert any non-array branches to arrays
router.post('/fix-branches', async (req, res) => {
  try {
    const services = await Service.find();
    let fixedCount = 0;

    for (const service of services) {
      // Check if branches is not an array
      if (!Array.isArray(service.branches)) {
        const normalizedBranches = normalizeBranches(service.branches);
        service.branches = normalizedBranches;
        await service.save();
        fixedCount++;
        console.log(`✅ Fixed service: ${service.name} - branches:`, normalizedBranches);
      }
    }

    res.json({ 
      message: `Fixed ${fixedCount} services`, 
      totalServices: services.length 
    });
  } catch (error) {
    console.error('❌ Fix branches error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// For branch admin - get services for their branch
router.get('/branch-admin', authenticateBranchAdmin, checkPermission('manage_services'), async (req, res) => {
  try {
    const services = await Service.find({ branches: req.branchId })
      .sort({ gender: 1, name: 1 });
    res.json(services);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// For branch admin - add service for their branch
router.post('/branch-admin', authenticateBranchAdmin, checkPermission('manage_services'), async (req, res) => {
  try {
    const { name, duration, price, gender } = req.body;

    if (!name || !duration || !price || !gender) {
      return res.status(400).json({ message: 'All fields required' });
    }

    const service = new Service({ 
      name: name.trim(), 
      duration: duration.trim(), 
      price: price.trim(),
      gender: gender.toLowerCase(),
      branches: [req.branchId] // ✅ Always as array
    });

    await service.save();

    // ✅ Auto-add to matching barbers' specialties
    try {
      const matchingBarbers = await Barber.find({
        gender: service.gender,
        branch: req.branchId
      });

      let addedCount = 0;
      for (const b of matchingBarbers) {
        if (!b.specialties.includes(service.name)) {
          b.specialties.push(service.name);
          await b.save();
          addedCount++;
        }
      }
      console.log(`✅ Auto-added new service "${service.name}" to ${addedCount} matching barbers in branch`);
    } catch (autoErr) {
      console.error('❌ Auto-add to barbers error:', autoErr);
      // Continue without failing the response
    }

    res.status(201).json(service);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;