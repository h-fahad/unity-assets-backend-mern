/**
 * Script to check existing subscriptions in the database
 * Usage: node scripts/check-subscriptions.js [userEmail]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { User, UserSubscription, SubscriptionPackage } = require('../src/models/index');

async function checkSubscriptions() {
  try {
    const userEmail = process.argv[2];

    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    if (userEmail) {
      // Check specific user
      console.log(`🔍 Looking for user: ${userEmail}`);
      const user = await User.findOne({ email: userEmail });

      if (!user) {
        console.error(`❌ User not found: ${userEmail}`);
        process.exit(1);
      }

      console.log(`✅ Found user: ${user.name} (${user._id})\n`);

      // Find subscriptions for this user
      const subscriptions = await UserSubscription.find({ userId: user._id });

      if (subscriptions.length === 0) {
        console.log('❌ No subscriptions found for this user\n');
        console.log('💡 To add a test subscription, run:');
        console.log(`   node scripts/add-test-subscription.js ${userEmail} "Standard"\n`);
      } else {
        console.log(`📋 Found ${subscriptions.length} subscription(s):\n`);

        for (const sub of subscriptions) {
          const plan = await SubscriptionPackage.findById(sub.planId);
          console.log('─'.repeat(60));
          console.log(`   Subscription ID: ${sub._id}`);
          console.log(`   Plan: ${plan ? plan.name : 'Unknown'} (${plan ? plan.billingCycle : 'N/A'})`);
          console.log(`   Daily Download Limit: ${plan ? plan.dailyDownloadLimit : 'N/A'}`);
          console.log(`   Start Date: ${sub.startDate.toISOString()}`);
          console.log(`   End Date: ${sub.endDate.toISOString()}`);
          console.log(`   Is Active: ${sub.isActive ? '✅' : '❌'}`);
          console.log(`   Status: ${sub.endDate >= new Date() ? '✅ Valid' : '❌ Expired'}`);
        }
        console.log('─'.repeat(60));
      }
    } else {
      // List all subscriptions
      console.log('📋 All subscriptions in database:\n');
      const allSubscriptions = await UserSubscription.find({});

      if (allSubscriptions.length === 0) {
        console.log('❌ No subscriptions found in database\n');
      } else {
        console.log(`Found ${allSubscriptions.length} total subscription(s):\n`);

        for (const sub of allSubscriptions) {
          const user = await User.findById(sub.userId);
          const plan = await SubscriptionPackage.findById(sub.planId);

          console.log('─'.repeat(60));
          console.log(`   User: ${user ? user.name : 'Unknown'} (${user ? user.email : 'N/A'})`);
          console.log(`   Plan: ${plan ? plan.name : 'Unknown'}`);
          console.log(`   End Date: ${sub.endDate.toISOString()}`);
          console.log(`   Is Active: ${sub.isActive ? '✅' : '❌'}`);
          console.log(`   Status: ${sub.endDate >= new Date() ? '✅ Valid' : '❌ Expired'}`);
        }
        console.log('─'.repeat(60));
      }
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n📡 Disconnected from MongoDB');
  }
}

// Run the script
checkSubscriptions();
