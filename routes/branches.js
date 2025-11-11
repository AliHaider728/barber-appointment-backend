// routes/branches.js
import express from 'express';
import Branch from '../models/Branch.js';
import { v2 as cloudinary } from 'cloudinary';  

const router = express.Router();

 
// ---------- GET ALL ----------
router.get('/', async (req, res) => {
  try {
    const branches = await Branch.find().sort({ createdAt: -1 });
    console.log(`GET /api/branches → ${branches.length} branches`);
    res.json(branches);
  } catch (err) {
    console.error('GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- CREATE ----------
router.post('/', async (req, res) => {
  console.log('POST /api/branches – body:', req.body);

  const { name, city, address, openingHours, phone, image } = req.body;
  if (!name || !city || !address || !openingHours || !phone) {
    return res.status(400).json({ error: 'All fields required' });
  }

  let imageUrl = null;
  if (image && image.startsWith('data:')) {
    try {
      console.log('Uploading to Cloudinary...');
      const result = await cloudinary.uploader.upload(image, {
        folder: 'barber-branches',
        width: 800,
        crop: 'limit',
        format: 'jpg',
      });
      imageUrl = result.secure_url;
      console.log('Cloudinary upload OK →', imageUrl);
    } catch (upErr) {
      console.error('Cloudinary upload error:', upErr);
      return res.status(500).json({ error: 'Image upload failed' });
    }
  }

  const branch = new Branch({
    name: name.trim(),
    city: city.trim(),
    address: address.trim(),
    openingHours: openingHours.trim(),
    phone: phone.trim(),
    image: imageUrl,
  });

  try {
    await branch.save();
    console.log('Branch saved →', branch._id);
    res.status(201).json(branch);
  } catch (saveErr) {
    console.error('Mongo save error:', saveErr);
    res.status(500).json({ error: saveErr.message });
  }
});

// ---------- UPDATE ----------
router.put('/:id', async (req, res) => {
  console.log(`PUT /api/branches/${req.params.id} – body:`, req.body);
  const { name, city, address, openingHours, phone, image } = req.body;

  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) return res.status(404).json({ error: 'Branch not found' });

    branch.name = name?.trim() ?? branch.name;
    branch.city = city?.trim() ?? branch.city;
    branch.address = address?.trim() ?? branch.address;
    branch.openingHours = openingHours?.trim() ?? branch.openingHours;
    branch.phone = phone?.trim() ?? branch.phone;

    if (image && image.startsWith('data:')) {
      if (branch.image) {
        const publicId = branch.image.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`barber-branches/${publicId}`);
        console.log('Deleted old image:', publicId);
      }
      const result = await cloudinary.uploader.upload(image, {
        folder: 'barber-branches',
        width: 800,
        crop: 'limit',
      });
      branch.image = result.secure_url;
      console.log('New image uploaded →', branch.image);
    }

    await branch.save();
    console.log('Branch updated →', branch._id);
    res.json(branch);
  } catch (err) {
    console.error('PUT error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- DELETE ----------
router.delete('/:id', async (req, res) => {
  console.log(`DELETE /api/branches/${req.params.id}`);
  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) return res.status(404).json({ error: 'Not found' });

    if (branch.image) {
      const publicId = branch.image.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(`barber-branches/${publicId}`);
      console.log('Deleted Cloudinary image:', publicId);
    }

    await branch.deleteOne();
    console.log('Branch deleted');
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('DELETE error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;