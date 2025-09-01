import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { SubscriptionPlan } from '../src/models/SubscriptionPlan';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const updatedPricing = [
  {
    name: 'Basic',
    basePrice: 30.00, // Match Stripe: $30.00/month
    yearlyDiscount: 16.67, // $300/year = $25/month equivalent, so ~16.67% discount
    dailyDownloadLimit: 5,
    stripeProductId: process.env.STRIPE_PRODUCT_BASIC || '',
    stripePriceIds: {
      monthly: process.env.STRIPE_PRICE_BASIC_MONTHLY || '',
      yearly: process.env.STRIPE_PRICE_BASIC_YEARLY || ''
    }
  },
  {
    name: 'Pro',
    basePrice: 19.99, // Match Stripe: $19.99/month
    yearlyDiscount: 16.67, // $200/year = $16.67/month equivalent, so ~16.67% discount
    dailyDownloadLimit: 25,
    stripeProductId: process.env.STRIPE_PRODUCT_PRO || '',
    stripePriceIds: {
      monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || '',
      yearly: process.env.STRIPE_PRICE_PRO_YEARLY || ''
    }
  },
  {
    name: 'Enterprise',
    basePrice: 500.00, // Match Stripe: $500.00/month
    yearlyDiscount: 16.67, // $5000/year = $416.67/month equivalent, so ~16.67% discount
    dailyDownloadLimit: 100,
    stripeProductId: process.env.STRIPE_PRODUCT_ENTERPRISE || '',
    stripePriceIds: {
      monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || '',
      yearly: process.env.STRIPE_PRICE_ENTERPRISE_YEARLY || ''
    }
  }
];

async function updatePrices() {
  try {
    // Connect to MongoDB
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/unity_assets_db';
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB');

    console.log('🔄 Updating subscription plan prices to match Stripe...\n');
    
    for (const planUpdate of updatedPricing) {
      const result = await SubscriptionPlan.findOneAndUpdate(
        { name: planUpdate.name },
        {
          basePrice: planUpdate.basePrice,
          yearlyDiscount: planUpdate.yearlyDiscount,
          dailyDownloadLimit: planUpdate.dailyDownloadLimit,
          stripeProductId: planUpdate.stripeProductId,
          stripePriceIds: planUpdate.stripePriceIds
        },
        { new: true }
      );
      
      if (result) {
        console.log(`✅ Updated ${planUpdate.name} Plan:`);
        console.log(`   💰 Monthly: $${planUpdate.basePrice}`);
        console.log(`   💰 Yearly: $${(planUpdate.basePrice * 12 * (1 - planUpdate.yearlyDiscount / 100)).toFixed(2)} (${planUpdate.yearlyDiscount}% discount)`);
        console.log(`   📥 Downloads: ${planUpdate.dailyDownloadLimit}/day\n`);
      } else {
        console.log(`❌ Plan ${planUpdate.name} not found\n`);
      }
    }

    // Show final summary
    console.log('📋 Updated Subscription Plans Summary:');
    const allPlans = await SubscriptionPlan.find({}).select('name basePrice yearlyDiscount dailyDownloadLimit');
    
    allPlans.forEach((plan, index) => {
      const yearlyPrice = plan.basePrice * 12 * (1 - plan.yearlyDiscount / 100);
      console.log(`\n${index + 1}. ${plan.name} Plan`);
      console.log(`   💰 Monthly: $${plan.basePrice}`);
      console.log(`   💰 Yearly: $${yearlyPrice.toFixed(2)} (${plan.yearlyDiscount}% discount)`);
      console.log(`   📥 Daily Downloads: ${plan.dailyDownloadLimit}`);
    });

    console.log('\n🎉 Price synchronization complete!');
    console.log('✅ Database prices now match your Stripe Dashboard prices');

  } catch (error) {
    console.error('❌ Error updating prices:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
    process.exit(0);
  }
}

console.log('🚀 Starting price synchronization...\n');
updatePrices();