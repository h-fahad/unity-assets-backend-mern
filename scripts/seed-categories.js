const mongoose = require('mongoose');

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/unity_assets_db');
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

// Category Schema
const categorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: String,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Category = mongoose.model('Category', categorySchema);

const sampleCategories = [
  { 
    _id: '507f1f77bcf86cd799439021', 
    name: 'Characters', 
    slug: 'characters', 
    description: 'Character models and animations for your games', 
    isActive: true 
  },
  { 
    _id: '507f1f77bcf86cd799439022', 
    name: 'Environment', 
    slug: 'environment', 
    description: 'Environmental assets and scenes to build immersive worlds', 
    isActive: true 
  },
  { 
    _id: '507f1f77bcf86cd799439023', 
    name: 'Effects', 
    slug: 'effects', 
    description: 'Visual and particle effects to enhance your gameplay', 
    isActive: true 
  },
  { 
    _id: '507f1f77bcf86cd799439024', 
    name: 'Props', 
    slug: 'props', 
    description: 'Game props and items for decoration and interaction', 
    isActive: true 
  },
  { 
    _id: '507f1f77bcf86cd799439025', 
    name: 'Audio', 
    slug: 'audio', 
    description: 'Music and sound effects for immersive audio experiences', 
    isActive: true 
  }
];

const seedCategories = async () => {
  try {
    // Clear existing categories first
    await Category.deleteMany({});
    console.log('🗑️  Cleared existing categories');

    // Insert sample categories
    await Category.insertMany(sampleCategories);
    console.log(`✅ Created ${sampleCategories.length} sample categories`);

    // Show the created categories
    const categories = await Category.find().sort({ name: 1 });
    console.log('📋 Created Categories:');
    console.log('='.repeat(50));
    categories.forEach(category => {
      console.log(`📂 ${category.name} (${category.slug}) - ${category.isActive ? 'Active' : 'Inactive'}`);
      console.log(`   ${category.description}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error seeding categories:', error);
  }
};

const main = async () => {
  await connectDB();
  await seedCategories();
  
  console.log('✨ Categories seeded successfully!');
  console.log('🔄 The categories page will now show real data from the database');
  
  mongoose.disconnect();
};

main();