const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { createSubscription, cancelSubscription, reactivateSubscription, createPaymentIntent, PRICING } = require('../config/stripe');
const User = require('../models/User');

const router = express.Router();

// @route   GET /api/subscriptions/pricing
// @desc    Get pricing information
// @access  Public
router.get('/pricing', (req, res) => {
  res.json({ pricing: PRICING });
});

// @route   POST /api/subscriptions/create-payment-intent
// @desc    Create payment intent for subscription
// @access  Private
router.post('/create-payment-intent', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    if (!user.stripeCustomerId) {
      return res.status(400).json({
        error: 'Stripe customer not found',
        code: 'NO_STRIPE_CUSTOMER'
      });
    }

    const paymentIntent = await createPaymentIntent(
      PRICING.monthly.amount,
      PRICING.monthly.currency,
      user.stripeCustomerId
    );

    res.json({
      clientSecret: paymentIntent.client_secret,
      amount: PRICING.monthly.amount,
      currency: PRICING.monthly.currency
    });
  } catch (error) {
    console.error('Create payment intent error:', error);
    res.status(500).json({
      error: 'Failed to create payment intent',
      code: 'PAYMENT_INTENT_ERROR'
    });
  }
});

// @route   POST /api/subscriptions/subscribe
// @desc    Create subscription for user
// @access  Private
router.post('/subscribe', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    if (!user.stripeCustomerId) {
      return res.status(400).json({
        error: 'Stripe customer not found',
        code: 'NO_STRIPE_CUSTOMER'
      });
    }

    if (user.subscriptionStatus === 'active') {
      return res.status(400).json({
        error: 'User already has active subscription',
        code: 'ALREADY_SUBSCRIBED'
      });
    }

    const subscription = await createSubscription(
      user.stripeCustomerId,
      PRICING.monthly.priceId
    );

    // Update user subscription info
    user.stripeSubscriptionId = subscription.id;
    user.subscriptionStatus = subscription.status === 'active' ? 'active' : 'inactive';
    user.subscriptionEndDate = new Date(subscription.current_period_end * 1000);
    await user.save();

    res.json({
      message: 'Subscription created successfully',
      subscription: {
        id: subscription.id,
        status: subscription.status,
        currentPeriodEnd: subscription.current_period_end,
        clientSecret: subscription.latest_invoice.payment_intent.client_secret
      }
    });
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({
      error: 'Failed to create subscription',
      code: 'SUBSCRIPTION_ERROR'
    });
  }
});

// @route   POST /api/subscriptions/cancel
// @desc    Cancel user subscription
// @access  Private
router.post('/cancel', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    if (!user.stripeSubscriptionId) {
      return res.status(400).json({
        error: 'No active subscription found',
        code: 'NO_SUBSCRIPTION'
      });
    }

    const subscription = await cancelSubscription(user.stripeSubscriptionId);

    // Update user subscription status
    user.subscriptionStatus = 'cancelled';
    await user.save();

    res.json({
      message: 'Subscription cancelled successfully',
      subscription: {
        id: subscription.id,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        currentPeriodEnd: subscription.current_period_end
      }
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({
      error: 'Failed to cancel subscription',
      code: 'CANCEL_SUBSCRIPTION_ERROR'
    });
  }
});

// @route   POST /api/subscriptions/reactivate
// @desc    Reactivate cancelled subscription
// @access  Private
router.post('/reactivate', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    if (!user.stripeSubscriptionId) {
      return res.status(400).json({
        error: 'No subscription found',
        code: 'NO_SUBSCRIPTION'
      });
    }

    if (user.subscriptionStatus !== 'cancelled') {
      return res.status(400).json({
        error: 'Subscription is not cancelled',
        code: 'NOT_CANCELLED'
      });
    }

    const subscription = await reactivateSubscription(user.stripeSubscriptionId);

    // Update user subscription status
    user.subscriptionStatus = 'active';
    await user.save();

    res.json({
      message: 'Subscription reactivated successfully',
      subscription: {
        id: subscription.id,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        currentPeriodEnd: subscription.current_period_end
      }
    });
  } catch (error) {
    console.error('Reactivate subscription error:', error);
    res.status(500).json({
      error: 'Failed to reactivate subscription',
      code: 'REACTIVATE_SUBSCRIPTION_ERROR'
    });
  }
});

// @route   GET /api/subscriptions/status
// @desc    Get current subscription status
// @access  Private
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    res.json({
      subscriptionStatus: user.subscriptionStatus,
      trialEndDate: user.trialEndDate,
      trialDaysRemaining: user.trialDaysRemaining,
      hasActiveSubscription: user.hasActiveSubscription,
      subscriptionEndDate: user.subscriptionEndDate,
      stripeCustomerId: user.stripeCustomerId,
      stripeSubscriptionId: user.stripeSubscriptionId
    });
  } catch (error) {
    console.error('Get subscription status error:', error);
    res.status(500).json({
      error: 'Failed to get subscription status',
      code: 'GET_STATUS_ERROR'
    });
  }
});

module.exports = router;