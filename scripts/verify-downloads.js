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

const verifyDownloads = async () => {
  try {
    const assetIds = [
      '507f1f77bcf86cd799439011', // Fantasy Character Pack
      '507f1f77bcf86cd799439012', // Sci-Fi Environment Kit
      '507f1f77bcf86cd799439013', // Particle Effects Bundle
      '507f1f77bcf86cd799439014', // Medieval Props Collection
      '507f1f77bcf86cd799439015'  // Epic Orchestral Soundtrack
    ];

    const assetNames = [
      'Fantasy Character Pack',
      'Sci-Fi Environment Kit',
      'Particle Effects Bundle',
      'Medieval Props Collection',
      'Epic Orchestral Soundtrack'
    ];

    console.log('📊 Current Download Counts in Database:');
    console.log('='.repeat(50));

    for (let i = 0; i < assetIds.length; i++) {
      const count = await Download.countDocuments({ assetId: assetIds[i] });
      console.log(`📥 ${assetNames[i]}: ${count} downloads`);
    }

    const totalDownloads = await Download.countDocuments();
    console.log('='.repeat(50));
    console.log(`🎯 Total downloads in database: ${totalDownloads}`);
    console.log('');
    console.log('💡 These are the REAL numbers that should appear on the assets management page');
    console.log('   (once the backend server is restarted to pick up the changes)');

  } catch (error) {
    console.error('❌ Error verifying downloads:', error);
  }
};

const main = async () => {
  await connectDB();
  await verifyDownloads();
  mongoose.disconnect();
};

main();