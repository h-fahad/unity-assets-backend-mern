/**
 * Script to manually add a subscription for testing
 * Usage: node scripts/add-test-subscription.js <userEmail> <planName>
 * Example: node scripts/add-test-subscription.js user@example.com "Standard"
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { User, SubscriptionPackage, UserSubscription } = require('../src/models/index');

async function addTestSubscription() {
  try {
    // Get command line arguments
    const userEmail = process.argv[2];
    const planName = process.argv[3] || 'Standard';

    if (!userEmail) {
      console.error('❌ Usage: node scripts/add-test-subscription.js <userEmail> [planName]');
      console.error('   Example: node scripts/add-test-subscription.js user@example.com "Standard"');
      process.exit(1);
    }

    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find user
    console.log(`🔍 Looking for user: ${userEmail}`);
    const user = await User.findOne({ email: userEmail });

    if (!user) {
      console.error(`❌ User not found: ${userEmail}`);
      console.log('\n💡 Tip: Make sure the user has registered first');
      process.exit(1);
    }

    console.log(`✅ Found user: ${user.name} (${user._id})\n`);

    // Find plan
    console.log(`🔍 Looking for plan: ${planName}`);
    const plan = await SubscriptionPackage.findOne({
      name: planName,
      billingCycle: 'MONTHLY'
    });

    if (!plan) {
      console.error(`❌ Plan not found: ${planName}`);

      // Show available plans
      const availablePlans = await SubscriptionPackage.find({});
      console.log('\n📋 Available plans:');
      availablePlans.forEach(p => {
        console.log(`   - ${p.name} (${p.billingCycle})`);
      });

      process.exit(1);
    }

    console.log(`✅ Found plan: ${plan.name} - $${plan.basePrice}/${plan.billingCycle}`);
    console.log(`   Daily Download Limit: ${plan.dailyDownloadLimit}\n`);

    // Check existing subscription
    const existingSubscription = await UserSubscription.findOne({
      userId: user._id,
      isActive: true
    });

    if (existingSubscription) {
      console.log('⚠️  User already has an active subscription!');
      const existingPlan = await SubscriptionPackage.findById(existingSubscription.planId);
      console.log(`   Current Plan: ${existingPlan ? existingPlan.name : 'Unknown/Deleted Plan'}`);
      console.log(`   End Date: ${existingSubscription.endDate}`);
      console.log('\n🔄 Deactivating old subscription...');

      existingSubscription.isActive = false;
      await existingSubscription.save();
    }

    // Calculate end date (30 days for monthly, 365 for yearly)
    const startDate = new Date();
    const endDate = new Date();

    switch (plan.billingCycle) {
      case 'WEEKLY':
        endDate.setDate(endDate.getDate() + 7);
        break;
      case 'MONTHLY':
        endDate.setMonth(endDate.getMonth() + 1);
        break;
      case 'YEARLY':
        endDate.setFullYear(endDate.getFullYear() + 1);
        break;
    }

    // Create subscription
    console.log('📝 Creating new subscription...');
    const subscription = await UserSubscription.create({
      userId: user._id,
      planId: plan._id,
      startDate: startDate,
      endDate: endDate,
      isActive: true
    });

    console.log('\n🎉 SUCCESS! Subscription created:');
    console.log('='.repeat(60));
    console.log(`   Subscription ID: ${subscription._id}`);
    console.log(`   User: ${user.name} (${user.email})`);
    console.log(`   Plan: ${plan.name}`);
    console.log(`   Daily Download Limit: ${plan.dailyDownloadLimit}`);
    console.log(`   Start Date: ${startDate.toISOString()}`);
    console.log(`   End Date: ${endDate.toISOString()}`);
    console.log(`   Is Active: ${subscription.isActive}`);
    console.log('='.repeat(60));
    console.log('\n✅ The user can now access premium assets!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n📡 Disconnected from MongoDB');
  }
}

// Run the script
addTestSubscription();
