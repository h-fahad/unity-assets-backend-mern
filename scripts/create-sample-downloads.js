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

// Download Schema
const downloadSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  assetId: { type: String, required: true },
  downloadedAt: { type: Date, default: Date.now }
});

const Download = mongoose.model('Download', downloadSchema);

// Sample asset IDs (from sampleAssets)
const assetIds = [
  '507f1f77bcf86cd799439011', // Fantasy Character Pack
  '507f1f77bcf86cd799439012', // Sci-Fi Environment Kit
  '507f1f77bcf86cd799439013', // Particle Effects Bundle
  '507f1f77bcf86cd799439014', // Medieval Props Collection
  '507f1f77bcf86cd799439015'  // Epic Orchestral Soundtrack
];

// Sample user IDs
const userIds = [
  '68a30651e56dab677b7b3d65', // Network Test User
  '68aa3366eb3bf239fc1eaecf', // Admin User
  '68aa347113d007976d4b7986', // Fahad Test user
  'user001', // Demo users
  'user002',
  'user003',
  'user004',
  'user005'
];

const createSampleDownloads = async () => {
  try {
    // Clear existing downloads first
    await Download.deleteMany({});
    console.log('🗑️  Cleared existing download records');

    const downloads = [];
    
    // Create different numbers of downloads for each asset to make it realistic
    const downloadCounts = [25, 18, 42, 12, 8]; // Downloads per asset
    
    for (let i = 0; i < assetIds.length; i++) {
      const assetId = assetIds[i];
      const targetDownloads = downloadCounts[i];
      
      for (let j = 0; j < targetDownloads; j++) {
        // Random user
        const userId = userIds[Math.floor(Math.random() * userIds.length)];
        
        // Random time in the last 30 days
        const daysAgo = Math.floor(Math.random() * 30);
        const downloadedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
        
        downloads.push({
          userId,
          assetId,
          downloadedAt
        });
      }
    }

    // Insert all downloads
    await Download.insertMany(downloads);
    console.log(`✅ Created ${downloads.length} sample download records`);

    // Show stats
    for (let i = 0; i < assetIds.length; i++) {
      const count = await Download.countDocuments({ assetId: assetIds[i] });
      console.log(`   📥 Asset ${i + 1}: ${count} downloads`);
    }

    const totalDownloads = await Download.countDocuments();
    console.log(`   🎯 Total downloads: ${totalDownloads}`);

  } catch (error) {
    console.error('❌ Error creating sample downloads:', error);
  }
};

const main = async () => {
  await connectDB();
  await createSampleDownloads();
  
  console.log('✨ Sample downloads created successfully!');
  console.log('🔄 The asset management page will now show real download numbers');
  
  mongoose.disconnect();
};

main();