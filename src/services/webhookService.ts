import Stripe from 'stripe';
import { UserSubscription } from '../models/UserSubscription';
import { SubscriptionPlan } from '../models/SubscriptionPlan';
import { User } from '../models/User';
import { stripeService } from './stripeService';
import { IUserSubscription } from '../types';

export class WebhookService {
  /**
   * Handle subscription created event
   */
  async handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<void> {
    try {
      console.log('🎉 Processing subscription.created event:', subscription.id);

      const { userId, planId, billingCycle } = subscription.metadata;
      
      if (!userId || !planId) {
        console.error('Missing required metadata in subscription:', subscription.metadata);
        throw new Error('Missing userId or planId in subscription metadata');
      }

      // Get user and plan
      const user = await User.findById(userId);
      const plan = await SubscriptionPlan.findById(planId);

      if (!user || !plan) {
        console.error('User or plan not found:', { userId, planId });
        throw new Error('User or plan not found');
      }

      // Calculate subscription period
      const startDate = new Date(subscription.current_period_start * 1000);
      const endDate = new Date(subscription.current_period_end * 1000);

      // Create user subscription record
      const userSubscription = new UserSubscription({
        userId: user._id,
        planId: plan._id,
        startDate,
        endDate,
        isActive: subscription.status === 'active',
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: subscription.customer as string,
        stripePriceId: subscription.items.data[0].price.id,
        stripeStatus: subscription.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        currentPeriodStart: startDate,
        currentPeriodEnd: endDate,
      });

      await userSubscription.save();
      console.log('✅ User subscription created successfully:', userSubscription._id);

      // TODO: Send welcome email
      // await emailService.sendSubscriptionWelcomeEmail(user, plan);

    } catch (error) {
      console.error('Error handling subscription.created:', error);
      throw error;
    }
  }

  /**
   * Handle subscription updated event
   */
  async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    try {
      console.log('🔄 Processing subscription.updated event:', subscription.id);

      // Find existing subscription
      const userSubscription = await UserSubscription.findOne({
        stripeSubscriptionId: subscription.id,
      });

      if (!userSubscription) {
        console.error('User subscription not found for Stripe subscription:', subscription.id);
        // If subscription doesn't exist, create it (handles edge cases)
        return await this.handleSubscriptionCreated(subscription);
      }

      // Update subscription data
      const startDate = new Date(subscription.current_period_start * 1000);
      const endDate = new Date(subscription.current_period_end * 1000);

      userSubscription.isActive = subscription.status === 'active';
      userSubscription.stripeStatus = subscription.status;
      userSubscription.cancelAtPeriodEnd = subscription.cancel_at_period_end;
      userSubscription.currentPeriodStart = startDate;
      userSubscription.currentPeriodEnd = endDate;
      userSubscription.endDate = endDate;
      userSubscription.stripePriceId = subscription.items.data[0].price.id;

      await userSubscription.save();
      console.log('✅ User subscription updated successfully:', userSubscription._id);

    } catch (error) {
      console.error('Error handling subscription.updated:', error);
      throw error;
    }
  }

  /**
   * Handle subscription deleted/canceled event
   */
  async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    try {
      console.log('❌ Processing subscription.deleted event:', subscription.id);

      // Find existing subscription
      const userSubscription = await UserSubscription.findOne({
        stripeSubscriptionId: subscription.id,
      });

      if (!userSubscription) {
        console.error('User subscription not found for Stripe subscription:', subscription.id);
        return;
      }

      // Mark subscription as inactive
      userSubscription.isActive = false;
      userSubscription.stripeStatus = 'canceled';
      userSubscription.endDate = new Date(); // End immediately

      await userSubscription.save();
      console.log('✅ User subscription canceled successfully:', userSubscription._id);

      // TODO: Send cancellation email
      // const user = await User.findById(userSubscription.userId);
      // if (user) {
      //   await emailService.sendSubscriptionCanceledEmail(user);
      // }

    } catch (error) {
      console.error('Error handling subscription.deleted:', error);
      throw error;
    }
  }

  /**
   * Handle invoice payment succeeded
   */
  async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    try {
      console.log('💳 Processing invoice.payment_succeeded event:', invoice.id);

      if (!invoice.subscription) {
        console.log('Invoice not associated with subscription, skipping');
        return;
      }

      const subscription = await stripeService.getSubscription(invoice.subscription as string);
      
      // Update subscription to reflect successful payment
      await this.handleSubscriptionUpdated(subscription);

      // TODO: Send payment confirmation email
      console.log('✅ Invoice payment processed successfully');

    } catch (error) {
      console.error('Error handling invoice.payment_succeeded:', error);
      throw error;
    }
  }

  /**
   * Handle invoice payment failed
   */
  async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    try {
      console.log('⚠️ Processing invoice.payment_failed event:', invoice.id);

      if (!invoice.subscription) {
        console.log('Invoice not associated with subscription, skipping');
        return;
      }

      // Find user subscription
      const userSubscription = await UserSubscription.findOne({
        stripeSubscriptionId: invoice.subscription as string,
      });

      if (!userSubscription) {
        console.error('User subscription not found for invoice:', invoice.id);
        return;
      }

      // Update status to reflect payment failure
      userSubscription.stripeStatus = 'past_due';
      await userSubscription.save();

      // TODO: Send payment failed notification email
      // const user = await User.findById(userSubscription.userId);
      // if (user) {
      //   await emailService.sendPaymentFailedEmail(user, invoice);
      // }

      console.log('✅ Payment failure processed for subscription:', userSubscription._id);

    } catch (error) {
      console.error('Error handling invoice.payment_failed:', error);
      throw error;
    }
  }

  /**
   * Handle customer subscription trial will end
   */
  async handleCustomerSubscriptionTrialWillEnd(subscription: Stripe.Subscription): Promise<void> {
    try {
      console.log('⏰ Processing customer.subscription.trial_will_end event:', subscription.id);

      const userSubscription = await UserSubscription.findOne({
        stripeSubscriptionId: subscription.id,
      });

      if (!userSubscription) {
        console.error('User subscription not found for trial ending:', subscription.id);
        return;
      }

      // TODO: Send trial ending notification email
      // const user = await User.findById(userSubscription.userId);
      // if (user) {
      //   await emailService.sendTrialEndingEmail(user, subscription);
      // }

      console.log('✅ Trial ending notification processed');

    } catch (error) {
      console.error('Error handling customer.subscription.trial_will_end:', error);
      throw error;
    }
  }

  /**
   * Main webhook event handler
   */
  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    try {
      console.log(`🎯 Processing webhook event: ${event.type}`);

      switch (event.type) {
        case 'customer.subscription.created':
          await this.handleSubscriptionCreated(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;

        case 'invoice.payment_succeeded':
          await this.handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
          break;

        case 'invoice.payment_failed':
          await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
          break;

        case 'customer.subscription.trial_will_end':
          await this.handleCustomerSubscriptionTrialWillEnd(event.data.object as Stripe.Subscription);
          break;

        default:
          console.log(`Unhandled webhook event type: ${event.type}`);
      }

    } catch (error) {
      console.error('Error processing webhook event:', error);
      throw error;
    }
  }

  /**
   * Get active subscription for user
   */
  async getActiveUserSubscription(userId: string): Promise<IUserSubscription | null> {
    try {
      const now = new Date();
      
      const subscription = await UserSubscription.findOne({
        userId,
        isActive: true,
        stripeStatus: 'active',
        startDate: { $lte: now },
        endDate: { $gte: now },
      }).populate('planId');

      return subscription;
    } catch (error) {
      console.error('Error getting active user subscription:', error);
      return null;
    }
  }

  /**
   * Check if user has active subscription
   */
  async hasActiveSubscription(userId: string): Promise<boolean> {
    const subscription = await this.getActiveUserSubscription(userId);
    return subscription !== null;
  }
}

// Export singleton instance
export const webhookService = new WebhookService();