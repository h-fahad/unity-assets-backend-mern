/**
 * Test API with specific user email
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { User, UserSubscription, SubscriptionPackage } = require('../src/models/index');

async function testUserAPI() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const userEmail = process.argv[2] || 'fahadyounas20@gmail.com';
    const user = await User.findOne({ email: userEmail });

    if (!user) {
      console.error('❌ User not found:', userEmail);
      process.exit(1);
    }

    console.log('👤 User:', user.name, '-', user.email);
    console.log('   User ID:', user._id.toString());
    console.log('');

    // Run the exact query
    const activeSubscription = await UserSubscription.findOne({
      userId: user._id,
      isActive: true,
      endDate: { $gte: new Date() },
      $or: [
        { stripeStatus: { $in: ['active', 'trialing'] } },
        { stripeStatus: { $exists: false } }
      ]
    });

    if (!activeSubscription) {
      console.log('❌ No subscription found by query!');
    } else {
      const plan = await SubscriptionPackage.findById(activeSubscription.planId);
      console.log('✅ Subscription FOUND!');
      console.log('   Plan:', plan?.name);
      console.log('   Status:', activeSubscription.stripeStatus);
      console.log('   Is Active:', activeSubscription.isActive);
      console.log('   Valid Until:', activeSubscription.endDate);
      console.log('');
      console.log('🎯 EXPECTED API RESPONSE:');
      console.log(JSON.stringify({
        isAdmin: false,
        hasSubscription: true,
        canDownload: true,
        remainingDownloads: plan?.dailyDownloadLimit || 0,
        message: `${plan?.dailyDownloadLimit} downloads remaining today`
      }, null, 2));
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

testUserAPI();
