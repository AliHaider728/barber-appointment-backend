// models/User.js (Updated)
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';  // Abhi ke liye rakha, but future mein remove

const userSchema = new mongoose.Schema({
  supabaseId: { type: String, unique: true },  // ← Naya: Supabase user ID
  email: { type: String, unique: true },
  password: String,  // ← Temporary, Supabase handle karega
  role: { type: String, default: 'user' },  // admin/user/customer
  // Barber-specific fields if needed
  isBarber: { type: Boolean, default: false },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }
}, { timestamps: true });

userSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

export default mongoose.model('User', userSchema);