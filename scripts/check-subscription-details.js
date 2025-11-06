/**
 * Check detailed subscription info including Stripe IDs
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { User, UserSubscription } = require('../src/models/index');

async function checkDetails() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const userEmail = process.argv[2] || 'fahadyounas10@gmail.com';
    const user = await User.findOne({ email: userEmail });

    if (!user) {
      console.error('❌ User not found');
      process.exit(1);
    }

    console.log(`🔍 User: ${user.name} (${user.email})`);
    console.log(`   User ID: ${user._id}`);
    console.log(`   Stripe Customer ID: ${user.stripeCustomerId || '❌ Not set'}\n`);

    const subscriptions = await UserSubscription.find({ userId: user._id }).populate('planId');

    console.log(`📋 Found ${subscriptions.length} subscription(s):\n`);

    for (const sub of subscriptions) {
      console.log('─'.repeat(60));
      console.log(`   Subscription ID: ${sub._id}`);
      console.log(`   Plan: ${sub.planId?.name || 'Unknown'}`);
      console.log(`   Is Active: ${sub.isActive ? '✅' : '❌'}`);
      console.log(`   Valid: ${sub.endDate >= new Date() ? '✅' : '❌'}`);
      console.log(`   Stripe Subscription ID: ${sub.stripeSubscriptionId || '❌ NOT SET'}`);
      console.log(`   Stripe Status: ${sub.stripeStatus || '❌ NOT SET'}`);
      console.log(`   Start Date: ${sub.startDate}`);
      console.log(`   End Date: ${sub.endDate}`);
      console.log('─'.repeat(60) + '\n');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

checkDetails();
