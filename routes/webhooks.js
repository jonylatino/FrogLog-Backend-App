const express = require('express');
const { handleWebhook } = require('../config/stripe');
const User = require('../models/User');

const router = express.Router();

// @route   POST /api/webhooks/stripe
// @desc    Handle Stripe webhook events
// @access  Public (but verified)
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'];
    
    let event;
    try {
      event = handleWebhook(req.body, signature);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log('Received Stripe webhook:', event.type);

    // Handle the event
    switch (event.type) {
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      case 'customer.subscription.trial_will_end':
        await handleTrialWillEnd(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Handle subscription created
async function handleSubscriptionCreated(subscription) {
  try {
    const user = await User.findOne({ stripeCustomerId: subscription.customer });
    if (user) {
      user.stripeSubscriptionId = subscription.id;
      user.subscriptionStatus = subscription.status === 'active' ? 'active' : 'inactive';
      user.subscriptionEndDate = new Date(subscription.current_period_end * 1000);
      await user.save();
      
      console.log(`Subscription created for user ${user.email}`);
    }
  } catch (error) {
    console.error('Error handling subscription created:', error);
  }
}

// Handle subscription updated
async function handleSubscriptionUpdated(subscription) {
  try {
    const user = await User.findOne({ stripeSubscriptionId: subscription.id });
    if (user) {
      user.subscriptionStatus = subscription.status === 'active' ? 'active' : 'inactive';
      user.subscriptionEndDate = new Date(subscription.current_period_end * 1000);
      
      if (subscription.cancel_at_period_end) {
        user.subscriptionStatus = 'cancelled';
      }
      
      await user.save();
      
      console.log(`Subscription updated for user ${user.email}: ${subscription.status}`);
    }
  } catch (error) {
    console.error('Error handling subscription updated:', error);
  }
}

// Handle subscription deleted
async function handleSubscriptionDeleted(subscription) {
  try {
    const user = await User.findOne({ stripeSubscriptionId: subscription.id });
    if (user) {
      user.subscriptionStatus = 'inactive';
      user.stripeSubscriptionId = null;
      user.subscriptionEndDate = null;
      await user.save();
      
      console.log(`Subscription deleted for user ${user.email}`);
    }
  } catch (error) {
    console.error('Error handling subscription deleted:', error);
  }
}

// Handle payment succeeded
async function handlePaymentSucceeded(invoice) {
  try {
    const user = await User.findOne({ stripeCustomerId: invoice.customer });
    if (user && invoice.subscription) {
      // Update subscription end date
      const subscription = await require('../config/stripe').getStripe().subscriptions.retrieve(invoice.subscription);
      user.subscriptionEndDate = new Date(subscription.current_period_end * 1000);
      user.subscriptionStatus = 'active';
      await user.save();
      
      console.log(`Payment succeeded for user ${user.email}`);
      
      // TODO: Send payment confirmation email
    }
  } catch (error) {
    console.error('Error handling payment succeeded:', error);
  }
}

// Handle payment failed
async function handlePaymentFailed(invoice) {
  try {
    const user = await User.findOne({ stripeCustomerId: invoice.customer });
    if (user) {
      console.log(`Payment failed for user ${user.email}`);
      
      // TODO: Send payment failed notification
      // TODO: Implement retry logic or grace period
    }
  } catch (error) {
    console.error('Error handling payment failed:', error);
  }
}

// Handle trial will end
async function handleTrialWillEnd(subscription) {
  try {
    const user = await User.findOne({ stripeSubscriptionId: subscription.id });
    if (user) {
      console.log(`Trial will end for user ${user.email}`);
      
      // TODO: Send trial ending notification email
    }
  } catch (error) {
    console.error('Error handling trial will end:', error);
  }
}

module.exports = router;