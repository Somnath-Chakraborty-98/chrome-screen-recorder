/**
 * Vercel serverless — Stripe / Razorpay checkout (scaffold).
 * Wire payment provider keys on Vercel before enabling Upgrade buttons.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { planCode, currency = 'INR' } = req.body || {};

  if (!planCode || !['plus', 'pro'].includes(planCode)) {
    return res.status(400).json({ error: 'planCode must be plus or pro' });
  }

  const hasStripe = Boolean(process.env.STRIPE_SECRET_KEY);
  const hasRazorpay = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

  if (!hasStripe && !hasRazorpay) {
    return res.status(503).json({
      error: 'Billing not configured yet. Add STRIPE_SECRET_KEY or RAZORPAY_KEY_ID on Vercel.'
    });
  }

  // TODO: create Stripe Checkout Session or Razorpay order based on currency
  return res.status(501).json({
    error: 'Checkout implementation pending',
    planCode,
    currency,
    providers: {
      stripe: hasStripe,
      razorpay: hasRazorpay
    }
  });
}
