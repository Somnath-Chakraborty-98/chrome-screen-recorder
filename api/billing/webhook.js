/**
 * Vercel serverless — payment webhooks (scaffold).
 * Verify Stripe/Razorpay signatures and update recordeasy_subscriptions.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const provider = req.query.provider;
  if (!['stripe', 'razorpay'].includes(provider)) {
    return res.status(400).json({ error: 'provider query must be stripe or razorpay' });
  }

  // TODO: verify signature, map payment to plan, upsert recordeasy_subscriptions
  return res.status(501).json({
    error: 'Webhook handler pending',
    provider
  });
}
