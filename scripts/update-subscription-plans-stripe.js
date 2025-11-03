/**
 * Script to update existing subscription plans with Stripe Product/Price IDs
 * Run this after deploying the schema changes to production
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { SubscriptionPackage } = require('../src/models/index');

async function updatePlansWithStripeIds() {
  try {
    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Fetch all subscription plans
    const plans = await SubscriptionPackage.find({});
    console.log(`📦 Found ${plans.length} subscription plans\n`);

    if (plans.length === 0) {
      console.log('⚠️  No plans found in database. Create plans first!');
      return;
    }

    // Display current plans
    console.log('Current Plans:');
    console.log('='.repeat(80));
    plans.forEach((plan, index) => {
      console.log(`${index + 1}. ${plan.name}`);
      console.log(`   ID: ${plan._id}`);
      console.log(`   Billing Cycle: ${plan.billingCycle}`);
      console.log(`   Base Price: $${plan.basePrice}`);
      console.log(`   Stripe Product ID: ${plan.stripeProductId || 'NOT SET'}`);
      console.log(`   Stripe Price ID: ${plan.stripePriceId || 'NOT SET'}`);
      console.log('');
    });
    console.log('='.repeat(80));
    console.log('\n');

    // Mapping based on your .env file Stripe Price IDs
    const stripeMapping = {
      'Basic': {
        MONTHLY: {
          priceId: process.env.STRIPE_PRICE_BASIC_MONTHLY || 'price_1SOoAiBb14GWd0WSbQ4FzrXV'
        },
        YEARLY: {
          priceId: process.env.STRIPE_PRICE_BASIC_YEARLY || 'price_1SOoCVBb14GWd0WS7qRDFaaF'
        }
      },
      'Standard': {
        MONTHLY: {
          priceId: process.env.STRIPE_PRICE_STANDARD_MONTHLY || 'price_1SOoBaBb14GWd0WSROGhR5B6'
        },
        YEARLY: {
          priceId: process.env.STRIPE_PRICE_STANDARD_YEARLY || 'price_1SOoCxBb14GWd0WSpmPWNQU9'
        }
      },
      'Premium': {
        MONTHLY: {
          priceId: process.env.STRIPE_PRICE_PREMIUM_MONTHLY || 'price_1SOoC2Bb14GWd0WSYjYiiGAS'
        },
        YEARLY: {
          priceId: process.env.STRIPE_PRICE_PREMIUM_YEARLY || 'price_1SOoDMBb14GWd0WSubmuSYaM'
        }
      },
      'Basic Yearly': {
        YEARLY: {
          priceId: process.env.STRIPE_PRICE_BASIC_YEARLY || 'price_1SOoCVBb14GWd0WS7qRDFaaF'
        }
      },
      'Standard Yearly': {
        YEARLY: {
          priceId: process.env.STRIPE_PRICE_STANDARD_YEARLY || 'price_1SOoCxBb14GWd0WSpmPWNQU9'
        }
      },
      'Premium Yearly': {
        YEARLY: {
          priceId: process.env.STRIPE_PRICE_PREMIUM_YEARLY || 'price_1SOoDMBb14GWd0WSubmuSYaM'
        }
      }
    };

    console.log('🔧 Updating plans with Stripe Price IDs from .env...\n');

    for (const plan of plans) {
      const mapping = stripeMapping[plan.name]?.[plan.billingCycle];

      if (mapping) {
        plan.stripePriceId = mapping.priceId;
        if (mapping.productId) {
          plan.stripeProductId = mapping.productId;
        }
        await plan.save();
        console.log(`✅ Updated ${plan.name} (${plan.billingCycle})`);
        console.log(`   Price ID: ${plan.stripePriceId}`);
      } else {
        console.log(`⚠️  No Stripe mapping found for ${plan.name} (${plan.billingCycle})`);
      }
    }

    console.log('\n✅ Script completed');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n📡 Disconnected from MongoDB');
  }
}

// Run the script
updatePlansWithStripeIds();
