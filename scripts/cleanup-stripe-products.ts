import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { SubscriptionPlan } from '../src/models/SubscriptionPlan';

// Load environment variables
dotenv.config();

async function cleanupStripeProducts() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable is not set');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB successfully\n');

    // Find all documents with stripeProductId field (Stripe-synced products)
    const stripeProducts = await SubscriptionPlan.find({
      stripeProductId: { $exists: true, $ne: null }
    });

    console.log(`Found ${stripeProducts.length} Stripe-synced products to delete:\n`);

    stripeProducts.forEach((product, index) => {
      console.log(`${index + 1}. ${product.name} (ID: ${product._id}, Stripe ID: ${product.stripeProductId})`);
    });

    if (stripeProducts.length > 0) {
      // Delete all Stripe-synced products
      const result = await SubscriptionPlan.deleteMany({
        stripeProductId: { $exists: true, $ne: null }
      });

      console.log(`\n✅ Successfully deleted ${result.deletedCount} Stripe-synced products`);
    } else {
      console.log('\n✅ No Stripe-synced products found to delete');
    }

    // Show remaining plans
    const remainingPlans = await SubscriptionPlan.find({});
    console.log(`\nRemaining subscription plans in database: ${remainingPlans.length}\n`);

    remainingPlans.forEach((plan, index) => {
      console.log(`${index + 1}. ${plan.name} (${plan.billingCycle}) - ID: ${plan._id}`);
    });

  } catch (error) {
    console.error('❌ Error cleaning up Stripe products:', error);
    process.exit(1);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('\nMongoDB connection closed');
    process.exit(0);
  }
}

// Run the cleanup function
cleanupStripeProducts();
