/**
 * Script to fix subscription end date for a specific subscription
 * Usage: node scripts/fix-subscription-date.js <userEmail> <newEndDateTimestamp>
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { User, UserSubscription } = require('../src/models/index');

async function fixSubscriptionDate() {
  try {
    const userEmail = process.argv[2];
    const endTimestamp = process.argv[3]; // Unix timestamp in seconds from Stripe

    if (!userEmail || !endTimestamp) {
      console.error('❌ Usage: node scripts/fix-subscription-date.js <userEmail> <endTimestamp>');
      console.error('   Example: node scripts/fix-subscription-date.js user@example.com 1764765242');
      process.exit(1);
    }

    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find user
    const user = await User.findOne({ email: userEmail });
    if (!user) {
      console.error(`❌ User not found: ${userEmail}`);
      process.exit(1);
    }

    // Find active subscription
    const subscription = await UserSubscription.findOne({
      userId: user._id,
      isActive: true
    }).sort({ createdAt: -1 });

    if (!subscription) {
      console.error(`❌ No active subscription found for ${userEmail}`);
      process.exit(1);
    }

    // Convert Stripe timestamp (seconds) to JavaScript Date (milliseconds)
    const newEndDate = new Date(parseInt(endTimestamp) * 1000);

    console.log('Current subscription:');
    console.log(`   End Date: ${subscription.endDate}`);
    console.log(`   Status: ${subscription.endDate >= new Date() ? 'Valid' : 'Expired'}\n`);

    console.log('Updating to:');
    console.log(`   New End Date: ${newEndDate}`);
    console.log(`   Status: ${newEndDate >= new Date() ? 'Valid' : 'Expired'}\n`);

    // Update subscription
    subscription.endDate = newEndDate;
    if (subscription.currentPeriodEnd) {
      subscription.currentPeriodEnd = newEndDate;
    }
    await subscription.save();

    console.log('✅ Subscription updated successfully!');
    console.log(`   Subscription ID: ${subscription._id}`);
    console.log(`   New End Date: ${subscription.endDate.toISOString()}`);
    console.log(`   Valid for: ${Math.ceil((subscription.endDate - new Date()) / (1000 * 60 * 60 * 24))} days`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n📡 Disconnected from MongoDB');
  }
}

fixSubscriptionDate();
