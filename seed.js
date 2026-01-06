// seed.js (updated with index cleanup for supabaseId if it exists, and minor logs)
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

const maleNames = ['James','Ahmed','Liam','Omar','Ryan','Hassan','Zain','Ali'];
const femaleNames = ['Sarah','Emma','Aisha','Fatima','Zara','Nadia','Hira'];

mongoose.connect(process.env.MONGODB_URI)
.then(async () => {
  console.log('🚀 Seeding started...');

  // Cleanup lingering supabaseId index if exists
  try {
    await Admin.collection.dropIndex('supabaseId_1');
    console.log('Dropped lingering supabaseId index');
  } catch (err) {
    if (err.codeName === 'IndexNotFound') {
      console.log('supabaseId index already removed');
    } else {
      console.error('Error dropping index:', err);
    }
  }

  // Remove supabaseId field from all documents if exists
  await Admin.updateMany({}, { $unset: { supabaseId: '' } });
  console.log('Removed supabaseId field from admins');

  
  // BRANCHES
  
  const branchData = [
    {name:'Deansgate Premium',city:'Manchester',address:'12 Deansgate',openingHours:'09:00 - 19:00',phone:'+44 161 834 5678'},
    {name:'Central London Elite',city:'London',address:'18 Baker Street',openingHours:'08:00 - 20:00',phone:'+44 20 7946 0958'},
    {name:'City Centre Classic',city:'Birmingham',address:'44 High Street',openingHours:'10:00 - 18:00',phone:'+44 121 634 8901'}
  ];

  const branches=[];
  for(const b of branchData){
    let branch=await Branch.findOne({name:b.name});
    if(!branch) branch=await Branch.create(b);
    branches.push(branch);
  }
  console.log(`Branches ready: ${branches.length}`);

  
  // SERVICES
  
  const serviceData=[
    {name:"Men's Haircut",duration:'30 minutes',price:'£25',gender:'male'},
    {name:'Beard Trim',duration:'20 minutes',price:'£15',gender:'male'},
    {name:'Hot Towel Shave',duration:'25 minutes',price:'£20',gender:'male'},
    {name:'Hair Color',duration:'45 minutes',price:'£40',gender:'male'},
    {name:'Facial & Grooming',duration:'40 minutes',price:'£35',gender:'male'},
    {name:'Head Massage',duration:'15 minutes',price:'£12',gender:'male'},
    {name:'Hair Styling',duration:'30 minutes',price:'£28',gender:'female'},
    {name:'Waxing',duration:'20 minutes',price:'£15',gender:'female'},
    {name:'Hair Coloring',duration:'60 minutes',price:'£50',gender:'female'},
    {name:'Blow Dry',duration:'25 minutes',price:'£22',gender:'female'},
    {name:'Hair Treatment',duration:'45 minutes',price:'£45',gender:'female'},
    {name:'Nail Care',duration:'30 minutes',price:'£20',gender:'female'}
  ];

  const services=[];
  for(const s of serviceData){
    let service=await Service.findOne({name:s.name});
    if(!service) service=await Service.create(s);
    services.push(service);
  }

  for(const s of services){
    await Service.findByIdAndUpdate(s._id,{branches:branches.map(b=>b._id)});
  }
  console.log(`Services ready: ${services.length}`);

  
  // MAIN ADMIN (SAFE)
  
  const adminEmail='admin@barbershop.com';
  const hashedPassword=await bcrypt.hash('admin123',10);

  await Admin.findOneAndUpdate(
    {email:adminEmail},
    {
      email:adminEmail,
      password:hashedPassword,
      fullName:'Main Admin',
      role:'main_admin',
      isActive:true,
      isEmailVerified:true,
      permissions:[
        'manage_barbers',
        'manage_branches',
        'manage_services',
        'manage_appointments',
        'manage_admins',
        'manage_leaves',
        'manage_shifts',
        'view_analytics'
      ]
    },
    {upsert:true,new:true,setDefaultsOnInsert:true}
  );
  console.log('Main Admin ready');

  
  // FIX BRANCH ADMINS
  
  const branchAdmins=await Admin.find({role:'branch_admin'});
  for(const ba of branchAdmins){
    ba.permissions=[
      'manage_barbers',
      'manage_appointments',
      'manage_shifts',
      'manage_services',
      'manage_leaves'
    ];
    ba.isActive=true;
    await ba.save();
  }
  console.log(`Branch Admins fixed: ${branchAdmins.length}`);

  
  // BARBERS
  
  if(await Barber.countDocuments()===0){
    const barbers=[];
    let count=1;

    for(const branch of branches){
      const maleServices=services.filter(s=>s.gender==='male');
      const femaleServices=services.filter(s=>s.gender==='female');

      for(let i=0;i<3;i++){
        barbers.push({
          name:`${maleNames[i%maleNames.length]} ${branch.city}`,
          experienceYears:3+i,
          gender:'male',
          specialties:maleServices.slice(0,3).map(s=>s.name),
          branch:branch._id,
          email:`barber${count}@barbershop.com`,
          password:await bcrypt.hash('barber123',10)
        });
        count++;
      }

      for(let i=0;i<2;i++){
        barbers.push({
          name:`${femaleNames[i%femaleNames.length]} ${branch.city}`,
          experienceYears:2+i,
          gender:'female',
          specialties:femaleServices.slice(0,3).map(s=>s.name),
          branch:branch._id,
          email:`barber${count}@barbershop.com`,
          password:await bcrypt.hash('barber123',10)
        });
        count++;
      }
    }

    await Barber.insertMany(barbers);
    console.log(`Barbers created: ${barbers.length}`);
  }else{
    console.log('Barbers already exist');
  }

  
  // SHIFTS
  
  if(await BarberShift.countDocuments()===0){
    const barbers=await Barber.find();
    const shifts=[];

    for(const barber of barbers){
      const branch=branches.find(b=>b._id.equals(barber.branch));
      const [open,close]=branch.openingHours.split(' - ').map(t=>parseInt(t));

      for(let d=1;d<=5;d++){
        shifts.push({
          barber:barber._id,
          dayOfWeek:d,
          startTime:`${open}:00`,
          endTime:`${close}:00`,
          isOff:false
        });
      }

      shifts.push({barber:barber._id,dayOfWeek:6,startTime:`${open+1}:00`,endTime:`${close-2}:00`,isOff:false});
      shifts.push({barber:barber._id,dayOfWeek:0,isOff:true});
    }

    await BarberShift.insertMany(shifts);
    console.log(`Shifts created: ${shifts.length}`);
  }else{
    console.log('Shifts already exist');
  }

  console.log('  SEED COMPLETED SUCCESSFULLY');
  console.log('ADMIN LOGIN → admin@barbershop.com | admin123');

  mongoose.connection.close();
})
.catch(err=>{
  console.error('  Seed error:',err.message);
  process.exit(1);
});