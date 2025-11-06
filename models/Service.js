// new code 
import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  duration: { type: String, required: true },
  price: { type: String, required: true },
  gender: { type: String, enum: ['male', 'female'], required: true } // REQUIRED
});

export default mongoose.model('Service', serviceSchema);
//old code 
// import mongoose from 'mongoose';

// const serviceSchema = new mongoose.Schema({
//   name: String,
//   duration: String,
//   price: String
// });

// export default mongoose.model('Service', serviceSchema);

