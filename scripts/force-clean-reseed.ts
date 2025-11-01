import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function forceCleanAndReseed() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable is not set');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB successfully\n');

    // Get the subscription plans collection directly
    const db = mongoose.connection.db;
    const collection = db?.collection('subscriptionplans');

    if (!collection) {
      throw new Error('Could not access subscriptionplans collection');
    }

    // Count current documents
    const count = await collection.countDocuments();
    console.log(`Found ${count} documents in subscriptionplans collection\n`);

    // List all documents
    const allDocs = await collection.find({}).toArray();
    console.log('Current documents:');
    allDocs.forEach((doc, index) => {
      console.log(`${index + 1}. ${doc.name} (ID: ${doc._id})`);
    });

    // Delete ALL documents
    console.log(`\nDeleting ALL ${count} documents...`);
    const deleteResult = await collection.deleteMany({});
    console.log(`✅ Deleted ${deleteResult.deletedCount} documents\n`);

    // Verify deletion
    const remainingCount = await collection.countDocuments();
    console.log(`Remaining documents: ${remainingCount}\n`);

    console.log('Now run: npx ts-node scripts/seed-subscription-plans.ts');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('\nMongoDB connection closed');
    process.exit(0);
  }
}

// Run the cleanup function
forceCleanAndReseed();
