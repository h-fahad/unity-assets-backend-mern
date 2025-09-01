import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { SubscriptionPlan } from '../src/models/SubscriptionPlan';

// Load environment variables
dotenv.config();

const subscriptionPlans = [
  {
    name: 'Basic',
    description: 'Perfect for indie developers',
    basePrice: 9.99,
    billingCycle: 'MONTHLY',
    yearlyDiscount: 20,
    dailyDownloadLimit: 5,
    features: [
      '5 downloads per day',
      'Basic support',
      'Community access',
      'Standard quality assets'
    ],
    isActive: true,
    // Note: Add your actual Stripe Product and Price IDs here after creating them in Stripe Dashboard
    stripeProductId: process.env.STRIPE_PRODUCT_BASIC || '',
    stripePriceIds: {
      monthly: process.env.STRIPE_PRICE_BASIC_MONTHLY || '',
      yearly: process.env.STRIPE_PRICE_BASIC_YEARLY || ''
    }
  },
  {
    name: 'Pro',
    description: 'For professional game studios',
    basePrice: 29.99,
    billingCycle: 'MONTHLY',
    yearlyDiscount: 25,
    dailyDownloadLimit: 25,
    features: [
      '25 downloads per day',
      'Priority support',
      'Early access to new assets',
      'Commercial license included',
      'HD quality assets'
    ],
    isActive: true,
    stripeProductId: process.env.STRIPE_PRODUCT_PRO || '',
    stripePriceIds: {
      monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || '',
      yearly: process.env.STRIPE_PRICE_PRO_YEARLY || ''
    }
  },
  {
    name: 'Enterprise',
    description: 'Unlimited access for large teams',
    basePrice: 99.99,
    billingCycle: 'MONTHLY',
    yearlyDiscount: 30,
    dailyDownloadLimit: 100,
    features: [
      '100 downloads per day',
      'Premium support',
      'Custom asset requests',
      'Team management dashboard',
      'Priority feature requests',
      'Exclusive enterprise assets'
    ],
    isActive: true,
    stripeProductId: process.env.STRIPE_PRODUCT_ENTERPRISE || '',
    stripePriceIds: {
      monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || '',
      yearly: process.env.STRIPE_PRICE_ENTERPRISE_YEARLY || ''
    }
  }
];

async function seedPlans() {
  try {
    // Connect to MongoDB
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/unity_assets_db';
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB');

    // Clear existing plans (optional - remove this line if you want to keep existing plans)
    // await SubscriptionPlan.deleteMany({});
    // console.log('🗑️ Cleared existing subscription plans');

    // Check if plans already exist
    const existingPlansCount = await SubscriptionPlan.countDocuments();
    if (existingPlansCount > 0) {
      console.log(`ℹ️ Found ${existingPlansCount} existing subscription plans`);
      console.log('🔄 Updating existing plans with new data...');
      
      // Update existing plans
      for (const planData of subscriptionPlans) {
        await SubscriptionPlan.findOneAndUpdate(
          { name: planData.name },
          planData,
          { upsert: true, new: true }
        );
        console.log(`✅ Updated/Created plan: ${planData.name}`);
      }
    } else {
      // Create new plans
      console.log('📦 Creating new subscription plans...');
      const createdPlans = await SubscriptionPlan.insertMany(subscriptionPlans);
      console.log(`✅ Created ${createdPlans.length} subscription plans`);
    }

    // Display created/updated plans
    console.log('\n📋 Subscription Plans Summary:');
    const allPlans = await SubscriptionPlan.find({}).select('name basePrice dailyDownloadLimit features');
    
    allPlans.forEach((plan, index) => {
      console.log(`\n${index + 1}. ${plan.name} Plan`);
      console.log(`   💰 Price: $${plan.basePrice}/month`);
      console.log(`   📥 Daily Downloads: ${plan.dailyDownloadLimit}`);
      console.log(`   🎯 Features: ${plan.features.length} features`);
    });

    console.log('\n🎉 Subscription plans seeded successfully!');
    console.log('\n📝 Next steps:');
    console.log('1. Create corresponding products and prices in Stripe Dashboard');
    console.log('2. Update your .env file with the Stripe Product and Price IDs');
    console.log('3. Re-run this script to update the plans with Stripe IDs');
    console.log('4. Test the subscription flow on your frontend');

  } catch (error) {
    console.error('❌ Error seeding subscription plans:', error);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
    process.exit(0);
  }
}

// Check if Stripe configuration is present
function checkStripeConfig() {
  const requiredEnvVars = [
    'STRIPE_SECRET_KEY',
    'STRIPE_PUBLISHABLE_KEY',
    'STRIPE_WEBHOOK_SECRET'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.log('⚠️ Warning: Missing Stripe environment variables:');
    missingVars.forEach(varName => {
      console.log(`   - ${varName}`);
    });
    console.log('💡 Make sure to configure these in your .env file before testing payments\n');
  } else {
    console.log('✅ Stripe environment variables are configured\n');
  }
}

// Run the seeding
console.log('🚀 Starting subscription plans seeding...\n');
checkStripeConfig();
seedPlans();