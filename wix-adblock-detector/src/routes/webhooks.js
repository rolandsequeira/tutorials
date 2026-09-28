import express from 'express';
import { verifyWebhook } from '../wix.js';

export function webhookRoutes({ cfg, sites, log = console }) {
  const r = express.Router();
  // Wix posts the JWT as the raw request body.
  r.post('/wix', express.text({ type: '*/*', limit: '256kb' }), async (req, res) => {
    let event;
    try {
      event = verifyWebhook(req.body, cfg.wixPublicKey);
    } catch (e) {
      log.warn('[webhook] rejected:', e.message);
      return res.sendStatus(401);
    }
    // Acknowledge fast; Wix retries on non-2xx.
    res.sendStatus(200);
    try {
      await sites.handleWebhook(event);
      log.info('[webhook]', event.eventType, event.instanceId);
    } catch (e) {
      log.error('[webhook] handler error', event.eventType, e);
    }
  });
  return r;
}
