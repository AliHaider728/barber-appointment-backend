// new code 
 import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Service name is required'], 
    trim: true 
  },
  duration: { 
    type: String, 
    required: [true, 'Duration is required'], 
    trim: true 
  },
  price: { 
    type: String, 
    required: [true, 'Price is required'], 
    trim: true 
  },
  gender: { 
    type: String, 
    enum: {
      values: ['male', 'female'],
      message: 'Gender must be either "male" or "female"'
    },
    required: [true, 'Gender (male/female) is required'] 
  }
}, { 
  timestamps: true 
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

