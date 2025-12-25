import express from 'express';
import Service from '../models/Service.js';
import Branch from '../models/Branch.js';
import { authenticateBranchAdmin, checkPermission } from './auth.js';

const router = express.Router();

// ✅ HELPER: Normalize branches to always be an array
const normalizeBranches = (branches) => {
  if (!branches) return [];
  if (Array.isArray(branches)) return branches;
  return [branches];
};

// ✅ HELPER: Extract branch ID safely
const extractBranchId = (branch) => {
  if (typeof branch === 'string') return branch;
  if (branch?._id) return branch._id.toString();
  return null;
};

// ✅ HELPER: Validate branch IDs exist in database
const validateBranches = async (branchIds) => {
  if (!branchIds || branchIds.length === 0) {
    return { valid: false, message: 'At least one branch is required' };
  }

  const validBranches = await Branch.find({ _id: { $in: branchIds } });
  
  if (validBranches.length !== branchIds.length) {
    const invalidIds = branchIds.filter(id => 
      !validBranches.some(b => b._id.toString() === id)
    );
    return { 
      valid: false, 
      message: `Invalid branch IDs: ${invalidIds.join(', ')}` 
    };
  }

  return { valid: true };
};

// GET all services - for main admin
router.get('/', async (req, res) => {
  try {
    const services = await Service.find()
      .populate('branches', 'name city')
      .sort({ gender: 1, name: 1 });
    
    console.log(`✅ GET /api/services → ${services.length} services found`);
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
    
    // ✅ Validate branch exists
    const branch = await Branch.findById(branchId);
    if (!branch) {
      return res.status(404).json({ message: 'Branch not found' });
    }
    
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

    // ✅ Validation
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

    // ✅ Normalize and validate branches
    const normalizedBranches = normalizeBranches(branches);
    const branchValidation = await validateBranches(normalizedBranches);
    
    if (!branchValidation.valid) {
      return res.status(400).json({ message: branchValidation.message });
    }

    // ✅ Check duplicate service (name + gender combination)
    const existingService = await Service.findOne({ 
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
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
      branches: normalizedBranches
    });

    await service.save();
    const populated = await Service.findById(service._id).populate('branches', 'name city');
    
    console.log('✅ Service created:', service._id, '-', service.name, '- branches:', normalizedBranches.length);
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

    // ✅ Find existing service first
    const existingService = await Service.findById(req.params.id);
    if (!existingService) {
      return res.status(404).json({ message: 'Service not found' });
    }

    // ✅ Validation
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

    // ✅ Handle branches update carefully
    let finalBranches;
    
    if (branches !== undefined && branches !== null) {
      // If branches provided, normalize and validate them
      const normalizedBranches = normalizeBranches(branches);
      
      if (normalizedBranches.length === 0) {
        return res.status(400).json({ 
          message: 'At least one branch is required. Cannot remove all branches.' 
        });
      }

      // Clean and remove duplicates
      const cleanBranches = [...new Set(
        normalizedBranches
          .map(extractBranchId)
          .filter(Boolean)
      )];

      // Validate branches exist
      const branchValidation = await validateBranches(cleanBranches);
      if (!branchValidation.valid) {
        return res.status(400).json({ message: branchValidation.message });
      }

      finalBranches = cleanBranches;
    } else {
      // If branches not provided, keep existing ones
      finalBranches = existingService.branches.map(b => {
        if (typeof b === 'string') return b;
        if (b._id) return b._id.toString();
        return null;
      }).filter(Boolean);
    }

    // ✅ Check for duplicate name (excluding current service)
    const duplicateService = await Service.findOne({
      _id: { $ne: req.params.id },
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
      gender: gender.toLowerCase()
    });

    if (duplicateService) {
      return res.status(400).json({
        message: `Another service with name "${name}" already exists for ${gender} category`
      });
    }

    const updateData = {
      name: name.trim(),
      duration: duration.trim(),
      price: price.trim(),
      gender: gender.toLowerCase(),
      branches: finalBranches
    };

    const service = await Service.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { new: true, runValidators: true }
    ).populate('branches', 'name city');

    console.log('✅ Service updated:', service._id, '- branches:', finalBranches.length);
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
    const fixedServices = [];

    for (const service of services) {
      // Check if branches is not an array or is empty
      if (!Array.isArray(service.branches)) {
        const normalizedBranches = normalizeBranches(service.branches);
        service.branches = normalizedBranches;
        await service.save();
        fixedCount++;
        fixedServices.push({
          id: service._id,
          name: service.name,
          oldBranches: service.branches,
          newBranches: normalizedBranches
        });
        console.log(`✅ Fixed service: ${service.name} - branches:`, normalizedBranches);
      }
      
      // Also check for empty branch arrays
      if (Array.isArray(service.branches) && service.branches.length === 0) {
        console.warn(`⚠️ Warning: Service "${service.name}" has no branches assigned`);
      }
    }

    res.json({ 
      message: `Fixed ${fixedCount} services`, 
      totalServices: services.length,
      fixedServices: fixedServices
    });
  } catch (error) {
    console.error('❌ Fix branches error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ✅ CLEAN DUPLICATES - Remove duplicate services with same name+gender
router.post('/clean-duplicates', async (req, res) => {
  try {
    const services = await Service.find().sort({ createdAt: 1 }); // Oldest first
    const seen = new Map();
    const duplicates = [];

    for (const service of services) {
      const key = `${service.name.toLowerCase()}-${service.gender}`;
      
      if (seen.has(key)) {
        // This is a duplicate - delete it
        await Service.findByIdAndDelete(service._id);
        duplicates.push({
          id: service._id,
          name: service.name,
          gender: service.gender
        });
        console.log(`🗑️ Deleted duplicate: ${service.name} (${service.gender})`);
      } else {
        seen.set(key, service);
      }
    }

    res.json({
      message: `Removed ${duplicates.length} duplicate services`,
      duplicates: duplicates
    });
  } catch (error) {
    console.error('❌ Clean duplicates error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// For branch admin - get services for their branch
router.get('/branch-admin', authenticateBranchAdmin, checkPermission('manage_services'), async (req, res) => {
  try {
    const services = await Service.find({ branches: req.branchId })
      .populate('branches', 'name city')
      .sort({ gender: 1, name: 1 });
    res.json(services);
  } catch (error) {
    console.error('❌ Branch admin GET services error:', error);
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

    // Check if service already exists globally
    const existingService = await Service.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
      gender: gender.toLowerCase()
    });

    if (existingService) {
      // Add branch to existing service if not already there
      if (!existingService.branches.includes(req.branchId)) {
        existingService.branches.push(req.branchId);
        await existingService.save();
        const populated = await Service.findById(existingService._id).populate('branches', 'name city');
        return res.status(200).json(populated);
      }
      return res.status(400).json({ message: 'Service already exists in your branch' });
    }

    const service = new Service({ 
      name: name.trim(), 
      duration: duration.trim(), 
      price: price.trim(),
      gender: gender.toLowerCase(),
      branches: [req.branchId]
    });

    await service.save();
    const populated = await Service.findById(service._id).populate('branches', 'name city');
    res.status(201).json(populated);
  } catch (error) {
    console.error('❌ Branch admin CREATE service error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;