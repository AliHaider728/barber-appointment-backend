// routes/branches.js
import express from 'express';
import Branch from '../models/Branch.js';
import { v2 as cloudinary } from 'cloudinary';

const router = express.Router();

// Helper function to upload to Cloudinary
const uploadToCloudinary = async (base64Image) => {
  try {
    const result = await cloudinary.uploader.upload(base64Image, {
      folder: 'barber-branches',
      width: 800,
      crop: 'limit',
      format: 'jpg',
      quality: 'auto'
    });
    console.log(' Cloudinary upload success:', result.secure_url);
    return result.secure_url;
  } catch (error) {
    console.error('Cloudinary upload failed:', error);
    throw new Error('Image upload failed: ' + error.message);
  }
};

// Helper function to delete from Cloudinary
const deleteFromCloudinary = async (imageUrl) => {
  try {
    if (!imageUrl || !imageUrl.includes('cloudinary')) return;
    
    // Extract public_id from URL
    const parts = imageUrl.split('/');
    const filename = parts[parts.length - 1];
    const publicId = `barber-branches/${filename.split('.')[0]}`;
    
    await cloudinary.uploader.destroy(publicId);
    console.log(' Cloudinary image deleted:', publicId);
  } catch (error) {
    console.error('⚠️ Cloudinary delete error:', error);
  }
};

// ---------- GET ALL ----------
router.get('/', async (req, res) => {
  try {
    const branches = await Branch.find().sort({ createdAt: -1 });
    console.log(` GET /api/branches → ${branches.length} branches found`);
    res.json(branches);
  } catch (err) {
    console.error('GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- CREATE ----------
// POST route (simplified)
router.post('/', async (req, res) => {
  const { name, city, address, openingHours, phone, image } = req.body;

  if (!name || !city || !address || !openingHours || !phone) {
    return res.status(400).json({ error: 'All fields required' });
  }

  // image = Cloudinary URL (optional)
  if (image && !image.startsWith('https://res.cloudinary.com')) {
    return res.status(400).json({ error: 'Invalid image URL' });
  }

  const branch = await Branch.create({
    name: name.trim(),
    city: city.trim(),
    address: address.trim(),
    openingHours: openingHours.trim(),
    phone: phone.trim(),
    image: image || null
  });

  res.status(201).json(branch);
});

// ---------- UPDATE ----------
router.put('/:id', async (req, res) => {
  console.log(`📝 PUT /api/branches/${req.params.id} – Updating branch...`);
  
  const { name, city, address, openingHours, phone, image } = req.body;

  try {
    const branch = await Branch.findById(req.params.id);
    
    if (!branch) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    // Update text fields
    if (name) branch.name = name.trim();
    if (city) branch.city = city.trim();
    if (address) branch.address = address.trim();
    if (openingHours) branch.openingHours = openingHours.trim();
    if (phone) branch.phone = phone.trim();

    // Update image if new one provided
    if (image && image.startsWith('data:')) {
      console.log('📤 New image detected, uploading to Cloudinary...');
      
      const oldImage = branch.image;
      
      try {
        // Upload new image
        const newImageUrl = await uploadToCloudinary(image);
        branch.image = newImageUrl;
        
        // Delete old image from Cloudinary
        if (oldImage) {
          await deleteFromCloudinary(oldImage);
        }
        
        console.log(' Image updated successfully');
      } catch (uploadErr) {
        console.error('Image update failed:', uploadErr);
        return res.status(500).json({ error: 'Image update failed: ' + uploadErr.message });
      }
    }

    await branch.save();
    console.log(' Branch updated successfully →', branch._id);
    res.json(branch);
    
  } catch (err) {
    console.error('PUT error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- DELETE ----------
router.delete('/:id', async (req, res) => {
  console.log(`🗑️ DELETE /api/branches/${req.params.id}`);
  
  try {
    const branch = await Branch.findById(req.params.id);
    
    if (!branch) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    // Delete image from Cloudinary
    if (branch.image) {
      await deleteFromCloudinary(branch.image);
    }

    await branch.deleteOne();
    console.log(' Branch deleted successfully');
    res.json({ message: 'Branch deleted successfully' });
    
  } catch (err) {
    console.error('DELETE error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;