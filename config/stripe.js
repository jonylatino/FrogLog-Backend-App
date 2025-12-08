const stripe = require('stripe');
require('dotenv').config();

let stripeInstance = null;

const initializeStripe = () => {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!stripeSecretKey) {
      console.warn('Stripe Secret Key not configured. Payment features will be disabled.');
      return null;
    }

    stripeInstance = stripe(stripeSecretKey);
    console.log('Stripe initialized successfully');
    return stripeInstance;
  } catch (error) {
    console.error('Error initializing Stripe:', error);
    return null;
  }
};

const createCustomer = async (email, name, metadata = {}) => {
  try {
    if (!stripeInstance) {
      throw new Error('Stripe not initialized');
    }

    const customer = await stripeInstance.customers.create({
      email,
      name,
      metadata
    });

    return customer;
  } catch (error) {
    console.error('Error creating Stripe customer:', error);
    throw error;
  }
};

const createSubscription = async (customerId, priceId, trialPeriodDays = null) => {
  try {
    if (!stripeInstance) {
      throw new Error('Stripe not initialized');
    }

    const subscriptionData = {
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
    };

    if (trialPeriodDays) {
      subscriptionData.trial_period_days = trialPeriodDays;
    }

    const subscription = await stripeInstance.subscriptions.create(subscriptionData);
    return subscription;
  } catch (error) {
    console.error('Error creating Stripe subscription:', error);
    throw error;
  }
};

const createPaymentIntent = async (amount, currency = 'gbp', customerId) => {
  try {
    if (!stripeInstance) {
      throw new Error('Stripe not initialized');
    }

    const paymentIntent = await stripeInstance.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency,
      customer: customerId,
      setup_future_usage: 'off_session',
    });

    return paymentIntent;
  } catch (error) {
    console.error('Error creating payment intent:', error);
    throw error;
  }
};

const cancelSubscription = async (subscriptionId) => {
  try {
    if (!stripeInstance) {
      throw new Error('Stripe not initialized');
    }

    const subscription = await stripeInstance.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true
    });

    return subscription;
  } catch (error) {
    console.error('Error canceling subscription:', error);
    throw error;
  }
};

const reactivateSubscription = async (subscriptionId) => {
  try {
    if (!stripeInstance) {
      throw new Error('Stripe not initialized');
    }

    const subscription = await stripeInstance.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false
    });

    return subscription;
  } catch (error) {
    console.error('Error reactivating subscription:', error);
    throw error;
  }
};

const getCustomer = async (customerId) => {
  try {
    if (!stripeInstance) {
      throw new Error('Stripe not initialized');
    }

    const customer = await stripeInstance.customers.retrieve(customerId);
    return customer;
  } catch (error) {
    console.error('Error retrieving customer:', error);
    throw error;
  }
};

const getSubscription = async (subscriptionId) => {
  try {
    if (!stripeInstance) {
      throw new Error('Stripe not initialized');
    }

    const subscription = await stripeInstance.subscriptions.retrieve(subscriptionId);
    return subscription;
  } catch (error) {
    console.error('Error retrieving subscription:', error);
    throw error;
  }
};

const handleWebhook = (payload, signature) => {
  try {
    if (!stripeInstance) {
      throw new Error('Stripe not initialized');
    }

    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!endpointSecret) {
      throw new Error('Stripe webhook secret not configured');
    }

    const event = stripeInstance.webhooks.constructEvent(payload, signature, endpointSecret);
    return event;
  } catch (error) {
    console.error('Error handling Stripe webhook:', error);
    throw error;
  }
};

// Pricing configuration
const PRICING = {
  monthly: {
    priceId: process.env.STRIPE_MONTHLY_PRICE_ID || 'price_monthly',
    amount: 4.99,
    currency: 'gbp',
    interval: 'month'
  }
};

module.exports = {
  initializeStripe,
  createCustomer,
  createSubscription,
  createPaymentIntent,
  cancelSubscription,
  reactivateSubscription,
  getCustomer,
  getSubscription,
  handleWebhook,
  getStripe: () => stripeInstance,
  PRICING
};