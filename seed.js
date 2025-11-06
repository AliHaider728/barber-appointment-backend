//new code
// seed.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Branch from './models/Branch.js';
import Service from './models/Service.js';
import Barber from './models/Barber.js';
import BarberShift from './models/BarberShift.js';

dotenv.config();

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is missing!');
  process.exit(1);
}

mongoose.set('strictQuery', false);
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(async () => {
    console.log('MongoDB connected for seeding...');

    try {
      // CLEAR OLD DATA FIRST (FORCE FRESH SEED)
      await Branch.deleteMany({});
      await Service.deleteMany({});
      await Barber.deleteMany({});
      await BarberShift.deleteMany({});
      console.log('Old data cleared.');

      console.log('Seeding fresh data...');

      // SEED BRANCHES
      const branches = await Branch.insertMany([
        { name: 'Central London', city: 'London', address: '18 Baker Street, Central London, W1U 3EZ', openingHours: '09:00 - 19:00', phone: '+44 20 7946 0958' },
        { name: 'Deansgate', city: 'Manchester', address: '12 Deansgate, Manchester, M3 4EN', openingHours: '09:30 - 18:30', phone: '+44 161 834 5678' },
        { name: 'City Centre', city: 'Birmingham', address: '44 High Street, Birmingham, B2 5PR', openingHours: '10:00 - 19:00', phone: '+44 121 634 8901' },
        { name: 'Headingley', city: 'Leeds', address: '7 Otley Road, Headingley, LS6 3DG', openingHours: '09:00 - 17:00', phone: '+44 113 275 4321' },
        { name: 'Merchant City', city: 'Glasgow', address: '25 Ingram Street, Merchant City, G1 1HA', openingHours: '09:30 - 18:00', phone: '+44 141 552 7890' },
      ]);
      console.log(`${branches.length} branches seeded.`);

      // SEED SERVICES — WITH GENDER + ERROR HANDLING
      try {
        const services = await Service.insertMany([
          { name: "Men's Haircut", duration: "30 minutes", price: "£25", gender: "male" },
          { name: "Beard Trim", duration: "20 minutes", price: "£15", gender: "male" },
          { name: "Hair Color", duration: "45 minutes", price: "£40", gender: "male" },
          { name: "Facial & Grooming", duration: "40 minutes", price: "£35", gender: "male" },
          { name: "Kids Haircut", duration: "25 minutes", price: "£20", gender: "male" },
          { name: "Head Massage", duration: "30 minutes", price: "£30", gender: "male" },
          { name: "Hair Wash", duration: "10 minutes", price: "£10", gender: "male" },
          { name: "Shave", duration: "20 minutes", price: "£18", gender: "male" },
          { name: "Hair Styling", duration: "25 minutes", price: "£22", gender: "female" },
          { name: "Waxing", duration: "15 minutes", price: "£12", gender: "female" }
        ]);
        console.log(`${services.length} services seeded with gender!`);
      } catch (err) {
        console.error('SERVICE INSERT FAILED:', err.message);
        if (err.writeErrors) {
          err.writeErrors.forEach(e => console.error('→', e.err.errmsg));
        }
        process.exit(1);
      }

      // SEED BARBERS
      // SEED BARBERS — SPECIALTIES = EXACT SERVICE NAMES!
const barbers = await Barber.insertMany([
  { 
    name: 'James Cole', 
    experienceYears: 8, 
    specialties: ["Men's Haircut", "Beard Trim", "Hair Color", "Facial & Grooming"], 
    branch: branches[0]._id 
  },
  { 
    name: 'Ahmed Khan', 
    experienceYears: 5, 
    specialties: ["Men's Haircut", "Shave", "Kids Haircut", "Hair Wash"], 
    branch: branches[0]._id 
  },
  { 
    name: 'Sarah Miller', 
    experienceYears: 6, 
    specialties: ["Hair Styling", "Waxing", "Facial & Grooming"], 
    branch: branches[1]._id 
  },
  { 
    name: 'Liam Brown', 
    experienceYears: 4, 
    specialties: ["Men's Haircut", "Beard Trim", "Shave"], 
    branch: branches[2]._id 
  },
  { 
    name: 'Omar Farooq', 
    experienceYears: 7, 
    specialties: ["Men's Haircut", "Head Massage", "Shave", "Skin Fade"], 
    branch: branches[4]._id 
  },
]);
console.log(`${barbers.length} barbers seeded with matching specialties!`);

      // SEED BARBER SHIFTS
      const shifts = [];
      barbers.forEach(barber => {
        for (let day = 1; day <= 5; day++) {
          shifts.push({
            barber: barber._id,
            dayOfWeek: day,
            startTime: "09:00",
            endTime: "19:00"
          });
        }
        shifts.push({
          barber: barber._id,
          dayOfWeek: 6,
          startTime: "10:00",
          endTime: "16:00"
        });
      });

      await BarberShift.insertMany(shifts);
      console.log(`${shifts.length} barber shifts seeded.`);

      console.log('SEEDING COMPLETED SUCCESSFULLY!');
      process.exit(0);
    } catch (error) {
      console.error('SEEDING FAILED:', error.message);
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
//old code 
// import mongoose from 'mongoose';
// import dotenv from 'dotenv';
// import Branch from './models/Branch.js';
// import Service from './models/Service.js';
// import Barber from './models/Barber.js';

// dotenv.config();

// if (!process.env.MONGODB_URI) {
//   console.error('MONGODB_URI is missing!');
//   process.exit(1);
// }

// mongoose.connect(process.env.MONGODB_URI, {
//   useNewUrlParser: true,
//   useUnifiedTopology: true,
// })
//   .then(async () => {
//     console.log('MongoDB connected for seeding...');

//     try {
//       // SKIP IF DATA EXISTS
//       const branchCount = await Branch.countDocuments();
//       if (branchCount > 0) {
//         console.log('Data already exists. Skipping seeding.');
//         process.exit(0);
//       }

//       console.log('Seeding only static data...');

//       // SEED BRANCHES
//       const branches = await Branch.insertMany([
//         { name: 'Central London', city: 'London', address: '18 Baker Street, Central London, W1U 3EZ', openingHours: '09:00 - 19:00', phone: '+44 20 7946 0958' },
//         { name: 'Deansgate', city: 'Manchester', address: '12 Deansgate, Manchester, M3 4EN', openingHours: '09:30 - 18:30', phone: '+44 161 834 5678' },
//         { name: 'City Centre', city: 'Birmingham', address: '44 High Street, Birmingham, B2 5PR', openingHours: '10:00 - 19:00', phone: '+44 121 634 8901' },
//         { name: 'Headingley', city: 'Leeds', address: '7 Otley Road, Headingley, LS6 3DG', openingHours: '09:00 - 17:00', phone: '+44 113 275 4321' },
//         { name: 'Merchant City', city: 'Glasgow', address: '25 Ingram Street, Merchant City, G1 1HA', openingHours: '09:30 - 18:00', phone: '+44 141 552 7890' },
//       ]);
//       console.log(`${branches.length} branches seeded.`);

//       // SEED SERVICES
//       const services = await Service.insertMany([
//         { name: "Men's Haircut", duration: "30 minutes", price: "£25" },
//         { name: "Beard Trim", duration: "20 minutes", price: "£15" },
//         { name: "Hair Color", duration: "45 minutes", price: "£40" },
//         { name: "Facial & Grooming", duration: "40 minutes", price: "£35" },
//         { name: "Kids Haircut", duration: "25 minutes", price: "£20" },
//         { name: "Head Massage", duration: "30 minutes", price: "£30" },
//         { name: "Hair Wash", duration: "10 minutes", price: "£10" },
//         { name: "Shave", duration: "20 minutes", price: "£18" },
//         { name: "Hair Styling", duration: "25 minutes", price: "£22" },
//         { name: "Waxing", duration: "15 minutes", price: "£12" },
//       ]);
//       console.log(`${services.length} services seeded.`);

//       // SEED BARBERS
//       const barbers = await Barber.insertMany([
//         { name: 'James Cole', experienceYears: 8, specialties: ['Fade', 'Beard Trim', 'Hair Color'], branch: branches[0]._id },
//         { name: 'Ahmed Khan', experienceYears: 5, specialties: ['Classic Cut', 'Shave', 'Kids Haircut'], branch: branches[0]._id },
//         { name: 'Sarah Miller', experienceYears: 6, specialties: ['Hair Styling', 'Waxing', 'Facial'], branch: branches[1]._id },
//         { name: 'Liam Brown', experienceYears: 4, specialties: ['Buzz Cut', 'Line Up', 'Beard Trim'], branch: branches[2]._id },
//         { name: 'Omar Farooq', experienceYears: 7, specialties: ['Skin Fade', 'Head Massage', 'Shave'], branch: branches[4]._id },
//       ]);
//       console.log(`${barbers.length} barbers seeded.`);

//       console.log('Seeding completed! (No users, no appointments)');
//       process.exit(0);
//     } catch (error) {
//       console.error('Seeding failed:', error.message);
//       process.exit(1);
//     }
//   })
//   .catch((err) => {
//     console.error('MongoDB connection failed:', err.message);
//     process.exit(1);
//   });