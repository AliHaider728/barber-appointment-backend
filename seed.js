import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Branch from './models/Branch.js';
import Service from './models/Service.js';
import Barber from './models/Barber.js';
import BarberShift from './models/BarberShift.js';
import bcrypt from 'bcryptjs';  // Add for password hashing

dotenv.config();
mongoose.set('strictQuery', false);

const maleNames = ['James', 'Ahmed', 'Liam', 'Omar', 'Ryan', 'Hassan', 'Zain', 'Ali'];
const femaleNames = ['Sarah', 'Emma', 'Aisha', 'Fatima', 'Zara', 'Nadia', 'Hira'];

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Starting Smart Seeding...');

    // 1. BRANCHES — insert only if not exists
    const branchData = [
      { name: 'Deansgate Premium', city: 'Manchester', address: '12 Deansgate', openingHours: '09:00 - 19:00', phone: '+44 161 834 5678' },
      { name: 'Central London Elite', city: 'London', address: '18 Baker Street', openingHours: '08:00 - 20:00', phone: '+44 20 7946 0958' },
      { name: 'City Centre Classic', city: 'Birmingham', address: '44 High Street', openingHours: '10:00 - 18:00', phone: '+44 121 634 8901' }
    ];
    

    const branches = [];
    for (const b of branchData) {
      let branch = await Branch.findOne({ name: b.name });
      if (!branch) branch = await Branch.create(b);
      branches.push(branch);
    }
    console.log(`Branches ready: ${branches.length}`);

    // 2. SERVICES — insert only if not exists
    const serviceData = [
      { name: "Men's Haircut", duration: "30 minutes", price: "£25", gender: "male" },
      { name: "Beard Trim", duration: "20 minutes", price: "£15", gender: "male" },
      { name: "Hot Towel Shave", duration: "25 minutes", price: "£20", gender: "male" },
      { name: "Hair Color", duration: "45 minutes", price: "£40", gender: "male" },
      { name: "Facial & Grooming", duration: "40 minutes", price: "£35", gender: "male" },
      { name: "Head Massage", duration: "15 minutes", price: "£12", gender: "male" },
      { name: "Hair Styling", duration: "30 minutes", price: "£28", gender: "female" },
      { name: "Waxing", duration: "20 minutes", price: "£15", gender: "female" },
      { name: "Hair Coloring", duration: "60 minutes", price: "£50", gender: "female" },
      { name: "Blow Dry", duration: "25 minutes", price: "£22", gender: "female" },
      { name: "Hair Treatment", duration: "45 minutes", price: "£45", gender: "female" },
      { name: "Nail Care", duration: "30 minutes", price: "£20", gender: "female" }
    ];

    const allServices = [];
    for (const s of serviceData) {
      let service = await Service.findOne({ name: s.name });
      if (!service) service = await Service.create(s);
      allServices.push(service);
    }
    console.log(`Services ready: ${allServices.length}`);

    // 3. BARBERS — only create if none exist, and only assign email/pwd to 2-3
    const existingBarbers = await Barber.countDocuments();
    if (existingBarbers === 0) {
      console.log('Creating new barbers...');
      const allBarbers = [];

      for (const branch of branches) {
        const maleServices = allServices.filter(s => s.gender === 'male');
        const femaleServices = allServices.filter(s => s.gender === 'female');

        for (let i = 0; i < 3; i++) {
          const specialties = maleServices
            .sort(() => 0.5 - Math.random())
            .slice(0, 3 + Math.floor(Math.random() * 2))
            .map(s => s.name);

          const barberData = {
            name: `${maleNames[(i + branches.indexOf(branch)) % maleNames.length]} ${branch.city}`,
            experienceYears: 3 + i + Math.floor(Math.random() * 3),
            gender: 'male',
            specialties,
            branch: branch._id
          };

          // Only assign email/pwd to first 2-3 barbers overall
          if (allBarbers.length < 3) {
            barberData.email = `${barberData.name.toLowerCase().replace(/\s+/g, '')}@barbershop.com`;
            barberData.password = await bcrypt.hash('barberpass123', 10);  // Hash password
          }

          allBarbers.push(barberData);
        }

        for (let i = 0; i < 2; i++) {
          const specialties = femaleServices
            .sort(() => 0.5 - Math.random())
            .slice(0, 3 + Math.floor(Math.random() * 2))
            .map(s => s.name);

          const barberData = {
            name: `${femaleNames[(i + branches.indexOf(branch)) % femaleNames.length]} ${branch.city}`,
            experienceYears: 2 + i + Math.floor(Math.random() * 4),
            gender: 'female',
            specialties,
            branch: branch._id
          };

          // Only if under limit
          if (allBarbers.length < 3) {
            barberData.email = `${barberData.name.toLowerCase().replace(/\s+/g, '')}@barbershop.com`;
            barberData.password = await bcrypt.hash('barberpass123', 10);
          }

          allBarbers.push(barberData);
        }
      }

      // Create barbers in MongoDB (no Supabase)
      const createdBarbers = await Barber.insertMany(allBarbers);
      console.log(`Barbers created in MongoDB: ${createdBarbers.length}`);
    } else {
      console.log('Barbers already exist, skipping creation.');
    }

    // 4. SHIFTS — only create if none exist
    const existingShifts = await BarberShift.countDocuments();
    if (existingShifts === 0) {
      console.log('Creating new shifts...');
      const barbers = await Barber.find();
      const shifts = [];

      for (const barber of barbers) {
        const branchData = branches.find(b => b._id.equals(barber.branch));
        const [openHour, closeHour] = branchData.openingHours.split(' - ').map(t => parseInt(t.split(':')[0]));
        const isPartTime = Math.random() > 0.7;

        for (let day = 1; day <= 5; day++) {
          shifts.push({
            barber: barber._id,
            dayOfWeek: day,
            startTime: isPartTime ? `${openHour + 2}:00` : `${openHour}:00`,
            endTime: isPartTime ? `${closeHour - 2}:00` : `${closeHour}:00`,
            isOff: false
          });
        }

        shifts.push({
          barber: barber._id,
          dayOfWeek: 6,
          startTime: `${openHour + 1}:00`,
          endTime: `${closeHour - 2}:00`,
          isOff: false
        });

        shifts.push({
          barber: barber._id,
          dayOfWeek: 0,
          isOff: true
        });
      }

      await BarberShift.insertMany(shifts);
      console.log(`Shifts created: ${shifts.length}`);
    } else {
      console.log('Shifts already exist, skipping creation.');
    }

    console.log('Smart seeding complete (no duplicates, no data loss).');
    mongoose.connection.close();
  })
  .catch(err => {
    console.error('Seed failed:', err.message);
    process.exit(1);
  });