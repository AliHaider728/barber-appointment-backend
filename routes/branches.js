import express from 'express';
import Branch from '../models/Branch.js';
import { v2 as cloudinary } from 'cloudinary';

const router = express.Router();

//CLOUDINARY CONFIG (MUST BE BEFORE ANY UPLOAD)  
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

//CLOUDINARY HELPERS  
const uploadToCloudinary = async (base64Image) => {
  try {
    const result = await cloudinary.uploader.upload(base64Image, {
      folder: 'barber-branches',
      width: 800,
      crop: 'limit',
      format: 'jpg',
      quality: 'auto'
    });
    return result.secure_url;
  } catch (error) {
    console.error('CLOUDINARY UPLOAD FAILED:', error);
    throw new Error('Image upload failed. Check Cloudinary config.');
  }
};

const deleteFromCloudinary = async (imageUrl) => {
  try {
    if (!imageUrl?.includes('cloudinary.com')) return;
    const publicId = imageUrl.split('/').slice(-2).join('/').split('.')[0];
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('CLOUDINARY DELETE FAILED:', error);
  }
};

// GET ALL 
router.get('/', async (req, res) => {
  try {
    const branches = await Branch.find().sort({ createdAt: -1 });
    res.json(branches);
  } catch (err) {
    console.error('GET ALL ERROR:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

//  GET SINGLE 
router.get('/:id', async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) return res.status(404).json({ error: 'Branch not found' });
    res.json(branch);
  } catch (err) {
    console.error('GET SINGLE ERROR:', err);
    res.status(500).json({ error: 'Invalid ID or server error' });
  }
});

// CREATE BRANCH  
router.post('/', async (req, res) => {
  console.log('CREATE BRANCH REQUEST:', req.body); // LOG FOR DEBUG

  const { name, city, address, openingHours, phone, image } = req.body;

  // Validate required fields
  if (!name || !city || !address || !openingHours || !phone) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  let imageUrl = null;

  // Handle image upload
  if (image) {
    if (image.startsWith('data:')) {
      try {
        imageUrl = await uploadToCloudinary(image);
      } catch (err) {
        console.error('IMAGE UPLOAD FAILED:', err);
        return res.status(500).json({ error: err.message });
      }
    } else if (image.startsWith('https://res.cloudinary.com')) {
      imageUrl = image;
    }
  }

  try {
    const newBranch = await Branch.create({
      name: name.trim(),
      city: city.trim(),
      address: address.trim(),
      openingHours: openingHours.trim(),
      phone: phone.trim(),
      image: imageUrl || undefined // Don't save null
    });

    console.log('BRANCH CREATED:', newBranch);
    res.status(201).json(newBranch);
  } catch (err) {
    console.error('MONGO CREATE ERROR:', err);
    res.status(500).json({ 
      error: 'Failed to save branch', 
      details: err.message 
    });
  }
});

//UPDATE BRANCH 
router.put('/:id', async (req, res) => {
  const { name, city, address, openingHours, phone, image } = req.body;

  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) return res.status(404).json({ error: 'Branch not found' });

    // Update fields
    branch.name = name?.trim() || branch.name;
    branch.city = city?.trim() || branch.city;
    branch.address = address?.trim() || branch.address;
    branch.openingHours = openingHours?.trim() || branch.openingHours;
    branch.phone = phone?.trim() || branch.phone;

    const oldImage = branch.image;

    if (image) {
      if (image.startsWith('data:')) {
        const newImageUrl = await uploadToCloudinary(image);
        branch.image = newImageUrl;
        if (oldImage) await deleteFromCloudinary(oldImage);
      } else if (image.startsWith('https://res.cloudinary.com')) {
        branch.image = image;
        if (oldImage && oldImage !== image) await deleteFromCloudinary(oldImage);
      }
    } else if (image === null) {
      branch.image = null;
      if (oldImage) await deleteFromCloudinary(oldImage);
    }

    await branch.save();
    res.json(branch);
  } catch (err) {
    console.error('UPDATE ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

//  DELETE BRANCH  
router.delete('/:id', async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) return res.status(404).json({ error: 'Branch not found' });

    if (branch.image) await deleteFromCloudinary(branch.image);
    await branch.deleteOne();
    res.json({ message: 'Branch deleted' });
  } catch (err) {
    console.error('DELETE ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;