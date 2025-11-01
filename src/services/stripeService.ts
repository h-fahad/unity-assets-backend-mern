import Stripe from 'stripe';
import { IUser, ISubscriptionPlan, BillingCycle } from '../types';

// Initialize Stripe with secret key (only if available)
const getStripeInstance = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY environment variable is required');
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-07-30.basil',
  });
};

let stripe: Stripe;

export interface StripePrice {
  basic_monthly: string;
  basic_yearly: string;
  standard_monthly: string;
  standard_yearly: string;
  premium_monthly: string;
  premium_yearly: string;
}

// Stripe Price IDs from environment variables
export const STRIPE_PRICES: StripePrice = {
  basic_monthly: process.env.STRIPE_PRICE_BASIC_MONTHLY!,
  basic_yearly: process.env.STRIPE_PRICE_BASIC_YEARLY!,
  standard_monthly: process.env.STRIPE_PRICE_STANDARD_MONTHLY!,
  standard_yearly: process.env.STRIPE_PRICE_STANDARD_YEARLY!,
  premium_monthly: process.env.STRIPE_PRICE_PREMIUM_MONTHLY!,
  premium_yearly: process.env.STRIPE_PRICE_PREMIUM_YEARLY!,
};

export class StripeService {
  private stripe: Stripe;

  constructor() {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }
    
    this.stripe = getStripeInstance();
  }

  /**
   * Get Stripe price ID based on plan name and billing cycle
   */
  getPriceId(planName: string, billingCycle: BillingCycle): string {
    const planKey = planName.toLowerCase() as 'basic' | 'standard' | 'premium';
    const cycleKey = billingCycle.toLowerCase() as 'monthly' | 'yearly';

    const priceKey = `${planKey}_${cycleKey}` as keyof StripePrice;
    const priceId = STRIPE_PRICES[priceKey];

    if (!priceId) {
      throw new Error(`No Stripe price ID found for plan: ${planName}, cycle: ${billingCycle}`);
    }

    return priceId;
  }

  /**
   * Create or retrieve a Stripe customer
   */
  async createOrRetrieveCustomer(user: IUser): Promise<Stripe.Customer> {
    try {
      // First, try to find existing customer by email
      const existingCustomers = await this.stripe.customers.list({
        email: user.email,
        limit: 1,
      });

      if (existingCustomers.data.length > 0) {
        return existingCustomers.data[0];
      }

      // Create new customer if none exists
      const customer = await this.stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: {
          userId: user._id.toString(),
        },
      });

      return customer;
    } catch (error) {
      console.error('Error creating/retrieving Stripe customer:', error);
      throw new Error('Failed to create or retrieve customer');
    }
  }

  /**
   * Create a Stripe checkout session for subscription
   */
  async createCheckoutSession({
    user,
    plan,
    billingCycle,
    successUrl,
    cancelUrl,
  }: {
    user: IUser;
    plan: ISubscriptionPlan;
    billingCycle: BillingCycle;
    successUrl: string;
    cancelUrl: string;
  }): Promise<Stripe.Checkout.Session> {
    try {
      // Create or retrieve customer
      const customer = await this.createOrRetrieveCustomer(user);
      
      // Get Stripe price ID
      const priceId = this.getPriceId(plan.name, billingCycle);

      // Create checkout session
      const session = await this.stripe.checkout.sessions.create({
        customer: customer.id,
        payment_method_types: ['card'],
        billing_address_collection: 'required',
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        allow_promotion_codes: true,
        subscription_data: {
          metadata: {
            userId: user._id.toString(),
            planId: plan._id.toString(),
            billingCycle,
          },
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          userId: user._id.toString(),
          planId: plan._id.toString(),
          billingCycle,
        },
      });

      return session;
    } catch (error) {
      console.error('Error creating Stripe checkout session:', error);
      throw new Error('Failed to create checkout session');
    }
  }

  /**
   * Create a customer portal session
   */
  async createCustomerPortalSession(
    customerId: string,
    returnUrl: string
  ): Promise<Stripe.BillingPortal.Session> {
    try {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      return session;
    } catch (error) {
      console.error('Error creating customer portal session:', error);
      throw new Error('Failed to create customer portal session');
    }
  }

  /**
   * Retrieve a Stripe subscription
   */
  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    try {
      return await this.stripe.subscriptions.retrieve(subscriptionId);
    } catch (error) {
      console.error('Error retrieving Stripe subscription:', error);
      throw new Error('Failed to retrieve subscription');
    }
  }

  /**
   * Cancel a Stripe subscription
   */
  async cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    try {
      return await this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
    } catch (error) {
      console.error('Error canceling Stripe subscription:', error);
      throw new Error('Failed to cancel subscription');
    }
  }

  /**
   * Reactivate a canceled subscription (if still within billing period)
   */
  async reactivateSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    try {
      return await this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
      });
    } catch (error) {
      console.error('Error reactivating Stripe subscription:', error);
      throw new Error('Failed to reactivate subscription');
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string | Buffer, signature: string): Stripe.Event {
    try {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
      return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (error) {
      console.error('Error verifying webhook signature:', error);
      throw new Error('Invalid webhook signature');
    }
  }

  /**
   * Get customer by user ID
   */
  async getCustomerByUserId(userId: string): Promise<Stripe.Customer | null> {
    try {
      // Search customers by metadata (newer Stripe API approach)
      const customers = await this.stripe.customers.search({
        query: `metadata['userId']:'${userId}'`,
        limit: 1,
      });

      return customers.data.length > 0 ? customers.data[0] : null;
    } catch (error) {
      console.error('Error finding customer by user ID:', error);
      // Fallback to list method if search fails
      try {
        const customersList = await this.stripe.customers.list({
          limit: 100, // Increase limit for better search
        });
        
        const customer = customersList.data.find(c => c.metadata?.userId === userId);
        return customer || null;
      } catch (fallbackError) {
        console.error('Fallback customer search also failed:', fallbackError);
        return null;
      }
    }
  }

  /**
   * List customer subscriptions
   */
  async getCustomerSubscriptions(customerId: string): Promise<Stripe.Subscription[]> {
    try {
      const subscriptions = await this.stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
      });

      return subscriptions.data;
    } catch (error) {
      console.error('Error retrieving customer subscriptions:', error);
      throw new Error('Failed to retrieve customer subscriptions');
    }
  }

  /**
   * Get price information
   */
  async getPrice(priceId: string): Promise<Stripe.Price> {
    try {
      return await this.stripe.prices.retrieve(priceId);
    } catch (error) {
      console.error('Error retrieving price:', error);
      throw new Error('Failed to retrieve price');
    }
  }

  /**
   * Get product information
   */
  async getProduct(productId: string): Promise<Stripe.Product> {
    try {
      return await this.stripe.products.retrieve(productId);
    } catch (error) {
      console.error('Error retrieving product:', error);
      throw new Error('Failed to retrieve product');
    }
  }
}

// Export singleton instance
export const stripeService = new StripeService();