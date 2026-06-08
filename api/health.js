import { handleOptions, sendJson } from './lib/http.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  return sendJson(res, req, 200, { ok: true, service: 'recordeasy-api' });
}
