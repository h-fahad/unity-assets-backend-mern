const mongoose = require('mongoose');
require('dotenv').config();

// Basic User Schema (same as in server)
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['USER', 'ADMIN'], default: 'USER' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

async function createAdminUser() {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/unity_assets_db';
    console.log('🔄 Connecting to MongoDB...');
    
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB');
    
    // Admin user details
    const adminData = {
      name: 'Unity Assets Admin',
      email: 'admin@unityassets.com',
      password: 'Anas&FahadUnit',
      role: 'ADMIN',
      isActive: true
    };
    
    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: adminData.email });
    if (existingAdmin) {
      console.log('⚠️  Admin user already exists with email:', adminData.email);
      console.log('   Role:', existingAdmin.role);
      console.log('   Active:', existingAdmin.isActive);
      return;
    }
    
    // Create admin user
    const adminUser = await User.create(adminData);
    console.log('✅ Admin user created successfully!');
    console.log('📧 Email:', adminUser.email);
    console.log('🔑 Password:', 'Anas&FahadUnit');
    console.log('👑 Role:', adminUser.role);
    console.log('🆔 User ID:', adminUser._id);
    
    console.log('\n🎯 You can now login with:');
    console.log('   Email: admin@unityassets.com');
    console.log('   Password: Anas&FahadUnit');
    
  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('📊 Database connection closed');
    process.exit(0);
  }
}

// Run the script
createAdminUser();