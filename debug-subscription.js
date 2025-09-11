const mongoose = require('mongoose');
require('dotenv').config();

async function debugPopulate() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const UserSubscription = mongoose.model('UserSubscription', new mongoose.Schema({}, { strict: false }));
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    const SubscriptionPlan = mongoose.model('SubscriptionPlan', new mongoose.Schema({}, { strict: false }));
    
    // Find the user
    const user = await User.findOne({ email: 'fahad@public.com' });
    
    if (user) {
      console.log('User found:', user._id);
      const now = new Date();
      
      // Query exactly as in complete-server.js (without populate)
      const activeSubscription = await UserSubscription.findOne({
        userId: user._id,
        isActive: true,
        stripeStatus: 'active',
        startDate: { $lte: now },
        endDate: { $gte: now }
      });
      
      console.log('Active subscription found:', !!activeSubscription);
      
      if (activeSubscription) {
        console.log('Subscription details:');
        console.log('- _id:', activeSubscription._id);
        console.log('- planId (raw):', activeSubscription.planId);
        console.log('- planId is object:', typeof activeSubscription.planId === 'object');
        
        if (activeSubscription.planId) {
          if (typeof activeSubscription.planId === 'string' || activeSubscription.planId instanceof mongoose.Types.ObjectId) {
            console.log('- planId not populated, value:', activeSubscription.planId);
            // Manually look up the plan
            const plan = await SubscriptionPlan.findById(activeSubscription.planId);
            console.log('- Manual plan lookup:', plan ? { _id: plan._id, name: plan.name } : 'not found');
          } else {
            console.log('- populated plan:', { _id: activeSubscription.planId._id, name: activeSubscription.planId.name });
          }
        }
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

debugPopulate();