// routes/branches.js

import express from 'express';
import Branch from '../models/Branch.js';
import { v2 as cloudinary } from 'cloudinary';

const router = express.Router();

// === CLOUDINARY HELPERS ===
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
    throw new Error('Image upload failed: ' + error.message);
  }
};

const deleteFromCloudinary = async (imageUrl) => {
  try {
    if (!imageUrl?.includes('cloudinary')) return;
    const parts = imageUrl.split('/');
    const filename = parts[parts.length - 1];
    const publicId = `barber-branches/${filename.split('.')[0]}`;
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Cloudinary delete error:', error);
  }
};

// === GET ALL ===
router.get('/', async (req, res) => {
  try {
    const branches = await Branch.find().sort({ createdAt: -1 });
    res.json(branches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === GET SINGLE BRANCH (MISSING ROUTE!) ===
router.get('/:id', async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) {
      return res.status(404).json({ error: 'Branch not found' });
    }
    res.json(branch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === CREATE ===
router.post('/', async (req, res) => {
  const { name, city, address, openingHours, phone, image } = req.body;

  if (!name || !city || !address || !openingHours || !phone) {
    return res.status(400).json({ error: 'All fields required' });
  }

  let imageUrl = null;
  if (image && image.startsWith('data:')) {
    try {
      imageUrl = await uploadToCloudinary(image);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  } else if (image && image.startsWith('https://res.cloudinary.com')) {
    imageUrl = image;
  }

  try {
    const branch = await Branch.create({
      name: name.trim(),
      city: city.trim(),
      address: address.trim(),
      openingHours: openingHours.trim(),
      phone: phone.trim(),
      image: imageUrl
    });
    res.status(201).json(branch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === UPDATE ===
router.put('/:id', async (req, res) => {
  const { name, city, address, openingHours, phone, image } = req.body;

  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) return res.status(404).json({ error: 'Branch not found' });

    if (name) branch.name = name.trim();
    if (city) branch.city = city.trim();
    if (address) branch.address = address.trim();
    if (openingHours) branch.openingHours = openingHours.trim();
    if (phone) branch.phone = phone.trim();

    const oldImage = branch.image;

    if (image && image.startsWith('data:')) {
      const newImageUrl = await uploadToCloudinary(image);
      branch.image = newImageUrl;
      if (oldImage) await deleteFromCloudinary(oldImage);
    } else if (image && image.startsWith('https://res.cloudinary.com')) {
      branch.image = image;
      if (oldImage && oldImage !== image) await deleteFromCloudinary(oldImage);
    } else if (image === null) {
      branch.image = null;
      if (oldImage) await deleteFromCloudinary(oldImage);
    }

    await branch.save();
    res.json(branch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === DELETE ===
router.delete('/:id', async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) return res.status(404).json({ error: 'Branch not found' });

    if (branch.image) await deleteFromCloudinary(branch.image);
    await branch.deleteOne();
    res.json({ message: 'Branch deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;""