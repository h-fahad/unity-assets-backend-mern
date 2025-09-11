const mongoose = require('mongoose');
require('dotenv').config();

async function testDownloadStatus() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const UserSubscription = mongoose.model('UserSubscription', new mongoose.Schema({}, { strict: false }));
    const SubscriptionPlan = mongoose.model('SubscriptionPlan', new mongoose.Schema({}, { strict: false }));
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    
    // Find the user
    const user = await User.findOne({ email: 'fahad@public.com' });
    console.log('User found:', !!user, user?._id);
    
    if (user) {
      const now = new Date();
      console.log('Current time:', now);
      
      // Test the exact query from complete-server.js
      const activeSubscription = await UserSubscription.findOne({
        userId: user._id,
        isActive: true,
        stripeStatus: 'active',
        startDate: { $lte: now },
        endDate: { $gte: now }
      });
      
      console.log('Active subscription found:', !!activeSubscription);
      
      if (activeSubscription) {
        console.log('Subscription details:', {
          _id: activeSubscription._id,
          planId: activeSubscription.planId,
          isActive: activeSubscription.isActive,
          stripeStatus: activeSubscription.stripeStatus,
          startDate: activeSubscription.startDate,
          endDate: activeSubscription.endDate
        });
        
        // Test manual plan lookup
        const plan = await SubscriptionPlan.findById(activeSubscription.planId);
        console.log('Plan found:', !!plan);
        if (plan) {
          console.log('Plan details:', {
            _id: plan._id,
            name: plan.name,
            dailyDownloadLimit: plan.dailyDownloadLimit
          });
        }
      } else {
        console.log('No active subscription found');
        // Debug: show all subscriptions
        const allSubs = await UserSubscription.find({ userId: user._id });
        console.log('All subscriptions for user:');
        allSubs.forEach((sub, i) => {
          console.log(`${i + 1}.`, {
            isActive: sub.isActive,
            stripeStatus: sub.stripeStatus,
            startDate: sub.startDate,
            endDate: sub.endDate,
            startDateValid: sub.startDate <= now,
            endDateValid: sub.endDate >= now
          });
        });
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testDownloadStatus();