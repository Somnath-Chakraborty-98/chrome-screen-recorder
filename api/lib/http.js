export function setCors(res, req) {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export function handleOptions(req, res) {
  if (req.method === 'OPTIONS') {
    setCors(res, req);
    res.status(204).end();
    return true;
  }
  return false;
}

export function sendJson(res, req, status, body) {
  setCors(res, req);
  res.status(status).json(body);
}

export function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export async function readJsonBody(req) {
  const data = await readRawBody(req);
  if (!data) return {};
  try {
    return JSON.parse(data);
  } catch {
    throw new Error('Invalid JSON body');
  }
}
