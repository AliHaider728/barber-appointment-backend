import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import Branch from './models/Branch.js';
import Service from './models/Service.js';
import Barber from './models/Barber.js';
import BarberShift from './models/BarberShift.js';
import Admin from './models/Admins.js';

dotenv.config();
mongoose.set('strictQuery', false);

const maleNames = ['James', 'Ahmed', 'Liam', 'Omar', 'Ryan', 'Hassan', 'Zain', 'Ali'];
const femaleNames = ['Sarah', 'Emma', 'Aisha', 'Fatima', 'Zara', 'Nadia', 'Hira'];

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('🚀 Starting Complete Permissions Fix...');

    // 1. BRANCHES
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
    console.log(`✅ Branches ready: ${branches.length}`);

    // 2. SERVICES
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
    console.log(`✅ Services ready: ${allServices.length}`);

    for (const service of allServices) {
      await Service.findByIdAndUpdate(service._id, { branches: branches.map(b => b._id) });
    }
    console.log('✅ Assigned all branches to all services');

    // 3. FIX MAIN ADMIN
    const adminEmail = 'admin@barbershop.com';
    const adminPassword = 'admin123';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
   
    let admin = await Admin.findOne({ email: adminEmail });
   
    if (!admin) {
      admin = await Admin.create({
        email: adminEmail,
        password: hashedPassword,
        fullName: 'Main Admin',
        role: 'main_admin',
        isActive: true,
        permissions: [
          'manage_barbers',
          'manage_branches', 
          'manage_services',
          'manage_appointments',
          'manage_admins',
          'manage_leaves',
          'manage_shifts',
          'view_analytics'
        ]
      });
      console.log('✅ Main Admin created with ALL permissions');
    } else {
      admin.password = hashedPassword;
      admin.fullName = 'Main Admin';
      admin.role = 'main_admin';
      admin.isActive = true;
      admin.permissions = [
        'manage_barbers',
        'manage_branches', 
        'manage_services',
        'manage_appointments',
        'manage_admins',
        'manage_leaves',
        'manage_shifts',
        'view_analytics'
      ];
      await admin.save();
      console.log('✅ Main Admin updated with ALL permissions');
    }

    // 4. ✅ CRITICAL: FIX ALL BRANCH ADMINS WITH COMPLETE PERMISSIONS
    const allBranchAdmins = await Admin.find({ role: 'branch_admin' });
    
    for (const branchAdmin of allBranchAdmins) {
      branchAdmin.permissions = [
        'manage_barbers',      // ✅ For barbers CRUD
        'manage_appointments', // ✅ For appointments management
        'manage_shifts',       // ✅ For shift scheduling
        'manage_services',     // ✅ For services management
        'manage_leaves'        // ✅ For leave management
      ];
      branchAdmin.isActive = true; // ✅ Ensure active
      await branchAdmin.save();
      console.log(`✅ Updated Branch Admin: ${branchAdmin.email}`);
    }
    
    if (allBranchAdmins.length > 0) {
      console.log(`\n🎯 FIXED ${allBranchAdmins.length} Branch Admin(s) with COMPLETE permissions!`);
    } else {
      console.log('\n⚠️ No existing Branch Admins found. They will get correct permissions when created.');
    }

    // 5. BARBERS - SKIP IF ALREADY EXIST
    const existingBarbers = await Barber.countDocuments();
    if (existingBarbers === 0) {
      console.log('\n👥 Creating new barbers...');
      const allBarbers = [];
      let barberCounter = 1;

      for (const branch of branches) {
        const maleServices = allServices.filter(s => s.gender === 'male');
        const femaleServices = allServices.filter(s => s.gender === 'female');

        for (let i = 0; i < 3; i++) {
          const specialties = maleServices
            .sort(() => 0.5 - Math.random())
            .slice(0, 3 + Math.floor(Math.random() * 2))
            .map(s => s.name);

          const barberName = `${maleNames[(i + branches.indexOf(branch)) % maleNames.length]} ${branch.city}`;
          const hashedPassword = await bcrypt.hash('barber123', 10);

          allBarbers.push({
            name: barberName,
            experienceYears: 3 + i + Math.floor(Math.random() * 3),
            gender: 'male',
            specialties,
            branch: branch._id,
            email: `barber${barberCounter}@barbershop.com`,
            password: hashedPassword
          });
          barberCounter++;
        }

        for (let i = 0; i < 2; i++) {
          const specialties = femaleServices
            .sort(() => 0.5 - Math.random())
            .slice(0, 3 + Math.floor(Math.random() * 2))
            .map(s => s.name);

          const barberName = `${femaleNames[(i + branches.indexOf(branch)) % femaleNames.length]} ${branch.city}`;
          const hashedPassword = await bcrypt.hash('barber123', 10);

          allBarbers.push({
            name: barberName,
            experienceYears: 2 + i + Math.floor(Math.random() * 4),
            gender: 'female',
            specialties,
            branch: branch._id,
            email: `barber${barberCounter}@barbershop.com`,
            password: hashedPassword
          });
          barberCounter++;
        }
      }

      const createdBarbers = await Barber.insertMany(allBarbers);
      console.log(`✅ Barbers created: ${createdBarbers.length}`);
    } else {
      console.log(`✅ Barbers already exist (${existingBarbers} barbers) - SKIPPING`);
    }

    // 6. SHIFTS - SKIP IF ALREADY EXIST
    const existingShifts = await BarberShift.countDocuments();
    if (existingShifts === 0) {
      console.log('📅 Creating new shifts...');
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
      console.log(`✅ Shifts created: ${shifts.length}`);
    } else {
      console.log(`✅ Shifts already exist (${existingShifts} shifts) - SKIPPING`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 COMPLETE PERMISSIONS FIX SUCCESSFUL!');
    console.log('='.repeat(60));
    console.log('\n📧 LOGIN CREDENTIALS:\n');
    console.log('MAIN ADMIN:');
    console.log('  Email: admin@barbershop.com');
    console.log('  Password: admin123');
    console.log('  Permissions: ALL (8 permissions) ✅\n');
    
    if (allBranchAdmins.length > 0) {
      console.log('BRANCH ADMINS FIXED:');
      allBranchAdmins.forEach(ba => {
        console.log(`  ✅ ${ba.email} - 5 permissions`);
      });
      console.log('\n  Permissions:');
      console.log('    • manage_barbers ✅');
      console.log('    • manage_appointments ✅');
      console.log('    • manage_shifts ✅');
      console.log('    • manage_services ✅');
      console.log('    • manage_leaves ✅\n');
    }
    
    console.log('BARBERS:');
    console.log('  Email: barber1@barbershop.com to barber15@barbershop.com');
    console.log('  Password: barber123\n');
    
    console.log('⚠️ IMPORTANT: Logout and login again to apply new permissions!\n');
   
    mongoose.connection.close();
  })
  .catch(err => {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  });