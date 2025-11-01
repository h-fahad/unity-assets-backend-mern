import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { SubscriptionPlan } from '../src/models/SubscriptionPlan';
import { BillingCycle } from '../src/types';

// Load environment variables
dotenv.config();

const subscriptionPlans = [
  // Monthly Plans
  {
    name: 'Basic',
    description: 'Perfect for indie developers and small projects',
    basePrice: 5,
    billingCycle: BillingCycle.MONTHLY,
    dailyDownloadLimit: 3,
    features: [
      '3 downloads per day',
      'Access to all Unity assets',
      'Regular updates',
      'Email support',
      'Cancel anytime'
    ],
    isActive: true,
    stripePriceIds: {
      monthly: process.env.STRIPE_PRICE_BASIC_MONTHLY,
      yearly: process.env.STRIPE_PRICE_BASIC_YEARLY
    }
  },
  {
    name: 'Standard',
    description: 'Ideal for growing teams and multiple projects',
    basePrice: 10,
    billingCycle: BillingCycle.MONTHLY,
    dailyDownloadLimit: 7,
    features: [
      '7 downloads per day',
      'Access to all Unity assets',
      'Priority updates',
      'Priority email support',
      'Early access to new assets',
      'Cancel anytime'
    ],
    isActive: true,
    stripePriceIds: {
      monthly: process.env.STRIPE_PRICE_STANDARD_MONTHLY,
      yearly: process.env.STRIPE_PRICE_STANDARD_YEARLY
    }
  },
  {
    name: 'Premium',
    description: 'Best for professional studios and large-scale projects',
    basePrice: 15,
    billingCycle: BillingCycle.MONTHLY,
    dailyDownloadLimit: 10,
    features: [
      '10 downloads per day',
      'Access to all Unity assets',
      'Instant updates',
      '24/7 priority support',
      'Early access to new assets',
      'Exclusive premium assets',
      'Cancel anytime'
    ],
    isActive: true,
    stripePriceIds: {
      monthly: process.env.STRIPE_PRICE_PREMIUM_MONTHLY,
      yearly: process.env.STRIPE_PRICE_PREMIUM_YEARLY
    }
  },

  // Yearly Plans
  {
    name: 'Basic Yearly',
    description: 'Perfect for indie developers and small projects - Annual billing',
    basePrice: 50,
    billingCycle: BillingCycle.YEARLY,
    dailyDownloadLimit: 5,
    features: [
      '5 downloads per day',
      'Access to all Unity assets',
      'Regular updates',
      'Email support',
      'Save $10 per year',
      'Cancel anytime'
    ],
    isActive: true,
    stripePriceIds: {
      monthly: process.env.STRIPE_PRICE_BASIC_MONTHLY,
      yearly: process.env.STRIPE_PRICE_BASIC_YEARLY
    }
  },
  {
    name: 'Standard Yearly',
    description: 'Ideal for growing teams and multiple projects - Annual billing',
    basePrice: 105,
    billingCycle: BillingCycle.YEARLY,
    dailyDownloadLimit: 7,
    features: [
      '7 downloads per day',
      'Access to all Unity assets',
      'Priority updates',
      'Priority email support',
      'Early access to new assets',
      'Save $15 per year',
      'Cancel anytime'
    ],
    isActive: true,
    stripePriceIds: {
      monthly: process.env.STRIPE_PRICE_STANDARD_MONTHLY,
      yearly: process.env.STRIPE_PRICE_STANDARD_YEARLY
    }
  },
  {
    name: 'Premium Yearly',
    description: 'Best for professional studios and large-scale projects - Annual billing',
    basePrice: 150,
    billingCycle: BillingCycle.YEARLY,
    dailyDownloadLimit: 10,
    features: [
      '10 downloads per day',
      'Access to all Unity assets',
      'Instant updates',
      '24/7 priority support',
      'Early access to new assets',
      'Exclusive premium assets',
      'Save $30 per year',
      'Cancel anytime'
    ],
    isActive: true,
    stripePriceIds: {
      monthly: process.env.STRIPE_PRICE_PREMIUM_MONTHLY,
      yearly: process.env.STRIPE_PRICE_PREMIUM_YEARLY
    }
  }
];

async function seedSubscriptionPlans() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable is not set');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB successfully');

    // Clear existing subscription plans
    console.log('\nClearing existing subscription plans...');
    await SubscriptionPlan.deleteMany({});
    console.log('Existing plans cleared');

    // Insert new subscription plans
    console.log('\nInserting new subscription plans...');
    const createdPlans = await SubscriptionPlan.insertMany(subscriptionPlans);

    console.log(`\n✅ Successfully created ${createdPlans.length} subscription plans:\n`);
    createdPlans.forEach((plan, index) => {
      console.log(`${index + 1}. ${plan.name} (${plan.billingCycle})`);
      console.log(`   Price: $${plan.basePrice}/${plan.billingCycle.toLowerCase()}`);
      console.log(`   Daily Downloads: ${plan.dailyDownloadLimit}`);
      console.log(`   ID: ${plan._id}\n`);
    });

    console.log('✅ Subscription plans seeded successfully!');
  } catch (error) {
    console.error('❌ Error seeding subscription plans:', error);
    process.exit(1);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('\nMongoDB connection closed');
    process.exit(0);
  }
}

// Run the seed function
seedSubscriptionPlans();
