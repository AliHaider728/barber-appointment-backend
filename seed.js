import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User.js';
import Branch from './models/Branch.js';
import Service from './models/Service.js';
import Barber from './models/Barber.js';
import Appointment from './models/Appointment.js';


dotenv.config();

// Validate MongoDB URI
if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is missing in .env file!');
  process.exit(1);
}

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(async () => {
    console.log('MongoDB connected for seeding...');

    try {
      // === 1. Clear existing data ===
      await Promise.all([
        User.deleteMany({}),
        Branch.deleteMany({}),
        Service.deleteMany({}),
        Barber.deleteMany({}),
        Appointment.deleteMany({}),
      ]);
      console.log('Old data cleared.');

      // === 2. Seed Admin User ===
      const adminUser = new User({
        email: 'aliAdmin123@gmail.com',
        password: 'ali123', // Will be hashed automatically by pre-save hook
        role: 'admin',
      });
      await adminUser.save();
      console.log('Admin user created:', adminUser.email);

      // === 3. Seed Branches ===
      const branches = await Branch.insertMany([
        {
          name: 'Central London',
          city: 'London',
          address: '18 Baker Street, Central London, W1U 3EZ',
          openingHours: '09:00 - 19:00',
          phone: '+44 20 7946 0958',
        },
        {
          name: 'Deansgate',
          city: 'Manchester',
          address: '12 Deansgate, Manchester, M3 4EN',
          openingHours: '09:30 - 18:30',
          phone: '+44 161 834 5678',
        },
        {
          name: 'City Centre',
          city: 'Birmingham',
          address: '44 High Street, Birmingham, B2 5PR',
          openingHours: '10:00 - 19:00',
          phone: '+44 121 634 8901',
        },
        {
          name: 'Headingley',
          city: 'Leeds',
          address: '7 Otley Road, Headingley, LS6 3DG',
          openingHours: '09:00 - 17:00',
          phone: '+44 113 275 4321',
        },
        {
          name: 'Merchant City',
          city: 'Glasgow',
          address: '25 Ingram Street, Merchant City, G1 1HA',
          openingHours: '09:30 - 18:00',
          phone: '+44 141 552 7890',
        },
      ]);
      console.log(`${branches.length} branches seeded.`);

      // === 4. Seed Services ===
      const services = await Service.insertMany([
        { name: "Men's Haircut", duration: "30 minutes", price: "£25" },
        { name: "Beard Trim", duration: "20 minutes", price: "£15" },
        { name: "Hair Color", duration: "45 minutes", price: "£40" },
        { name: "Facial & Grooming", duration: "40 minutes", price: "£35" },
        { name: "Kids Haircut", duration: "25 minutes", price: "£20" },
        { name: "Head Massage", duration: "30 minutes", price: "£30" },
        { name: "Hair Wash", duration: "10 minutes", price: "£10" },
        { name: "Shave", duration: "20 minutes", price: "£18" },
        { name: "Hair Styling", duration: "25 minutes", price: "£22" },
        { name: "Waxing", duration: "15 minutes", price: "£12" },
      ]);
      console.log(`${services.length} services seeded.`);

      // === 5. Seed Barbers (with valid branch reference) ===
      const barbers = await Barber.insertMany([
        {
          name: 'James Cole',
          experienceYears: 8,
          specialties: ['Fade', 'Beard Trim', 'Hair Color'],
          branch: branches[0]._id, // Central London
        },
        {
          name: 'Ahmed Khan',
          experienceYears: 5,
          specialties: ['Classic Cut', 'Shave', 'Kids Haircut'],
          branch: branches[0]._id,
        },
        {
          name: 'Sarah Miller',
          experienceYears: 6,
          specialties: ['Hair Styling', 'Waxing', 'Facial'],
          branch: branches[1]._id, // Deansgate
        },
        {
          name: 'Liam Brown',
          experienceYears: 4,
          specialties: ['Buzz Cut', 'Line Up', 'Beard Trim'],
          branch: branches[2]._id, // Birmingham
        },
        {
          name: 'Omar Farooq',
          experienceYears: 7,
          specialties: ['Skin Fade', 'Head Massage', 'Shave'],
          branch: branches[4]._id, // Glasgow
        },
      ]);
      console.log(`${barbers.length} barbers seeded.`);

      // === 6. Seed Sample Appointments ===
      const appointments = await Appointment.insertMany([
        {
          customerName: 'John Doe',
          email: 'john@example.com',
          phone: '+44 7700 900123',
          date: new Date('2025-11-05T10:00:00'),
          service: services[0].name,
          barber: barbers[0].name,
          branch: branches[0]._id,
          status: 'confirmed',
        },
        {
          customerName: 'Emma Wilson',
          email: 'emma@example.com',
          phone: '+44 7700 900456',
          date: new Date('2025-11-06T14:30:00'),
          service: services[3].name,
          barber: barbers[2].name,
          branch: branches[1]._id,
          status: 'pending',
        },
      ]);
      console.log(`${appointments.length} sample appointments seeded.`);

      console.log('Seeding completed successfully!');
      process.exit(0);
    } catch (error) {
      console.error('Seeding failed:', error.message);
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });