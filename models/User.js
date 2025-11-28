import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';   

const userSchema = new mongoose.Schema({
  supabaseId: { type: String, unique: true },   
  email: { type: String, unique: true, required: true },
  fullName: { type: String },
  phone: { type: String },
  password: String,  // Optional for legacy
  role: { 
    type: String, 
    enum: ['user', 'barber', 'admin'], 
    default: 'user' 
  },
  barberRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Barber', default: null }  
}, { timestamps: true });

userSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

export default mongoose.model('User', userSchema);