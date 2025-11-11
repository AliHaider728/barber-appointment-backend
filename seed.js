import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Branch from './models/Branch.js';
import Service from './models/Service.js';
import Barber from './models/Barber.js';
import BarberShift from './models/BarberShift.js';

dotenv.config();
mongoose.set('strictQuery', false);

const maleNames = ['James', 'Ahmed', 'Liam', 'Omar', 'Ryan', 'Hassan', 'Zain', 'Ali'];
const femaleNames = ['Sarah', 'Emma', 'Aisha', 'Fatima', 'Zara', 'Nadia', 'Hira'];

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Starting Realistic Seeding...');

    //  PEHLE PURANA DATA DELETE KARO
    console.log('Deleting old data...');
    await BarberShift.deleteMany({});
    await Barber.deleteMany({});
    await Service.deleteMany({});
    await Branch.deleteMany({});
    console.log('Old data deleted');

    // CREATE BRANCHES
    const branches = await Branch.insertMany([
      { name: 'Deansgate Premium', city: 'Manchester', address: '12 Deansgate', openingHours: '09:00 - 19:00', phone: '+44 161 834 5678' },
      { name: 'Central London Elite', city: 'London', address: '18 Baker Street', openingHours: '08:00 - 20:00', phone: '+44 20 7946 0958' },
      { name: 'City Centre Classic', city: 'Birmingham', address: '44 High Street', openingHours: '10:00 - 18:00', phone: '+44 121 634 8901' }
    ]);

    console.log(`Created ${branches.length} Branches\n`);

    // CREATE SERVICES
    const allServices = await Service.insertMany([
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
    ]);

    console.log(`Created ${allServices.length} Services`);

    // CREATE BARBERS
    const allBarbers = [];
    const shifts = [];

    for (const branch of branches) {
      const maleServices = allServices.filter(s => s.gender === 'male');
      const femaleServices = allServices.filter(s => s.gender === 'female');

      for (let i = 0; i < 3; i++) {
        const specialties = maleServices
          .sort(() => 0.5 - Math.random())
          .slice(0, 3 + Math.floor(Math.random() * 2))
          .map(s => s.name);

        const barber = {
          name: `${maleNames[(i + branches.indexOf(branch)) % maleNames.length]} ${branch.city}`,
          experienceYears: 3 + i + Math.floor(Math.random() * 3),
          gender: 'male',
          specialties,
          branch: branch._id
        };

        allBarbers.push(barber);
      }

      for (let i = 0; i < 2; i++) {
        const specialties = femaleServices
          .sort(() => 0.5 - Math.random())
          .slice(0, 3 + Math.floor(Math.random() * 2))
          .map(s => s.name);

        const barber = {
          name: `${femaleNames[(i + branches.indexOf(branch)) % femaleNames.length]} ${branch.city}`,
          experienceYears: 2 + i + Math.floor(Math.random() * 4),
          gender: 'female',
          specialties,
          branch: branch._id
        };

        allBarbers.push(barber);
      }
    }

    const barbers = await Barber.insertMany(allBarbers);
    console.log(`Created ${barbers.length} Barbers with specialized services\n`);

    // CREATE SHIFTS
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
    console.log(`Created ${shifts.length} Shifts\n`);

    console.log('SEEDING COMPLETE - NO DUPLICATES');
    console.log(`Branches: ${branches.length}`);
    console.log(`Services: ${allServices.length}`);
    console.log(`Barbers: ${barbers.length}`);
    console.log(`Shifts: ${shifts.length}`);

    mongoose.connection.close();
  })
  .catch(err => {
    console.error(' SEED FAILED:', err.message);
    process.exit(1);
  });