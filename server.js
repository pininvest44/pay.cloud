const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Helper delay function for rate-limiting
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper to sanitize Kenyan phone numbers to format: 254XXXXXXXXX
function formatPhoneNumber(phone) {
  let cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '254' + cleaned.slice(1);
  } else if (cleaned.startsWith('7') || cleaned.startsWith('1')) {
    cleaned = '254' + cleaned;
  }
  return cleaned;
}

app.post('/api/bulk-deposit', async (req, res) => {
  const { phoneNumbers, amount, reference } = req.body;
  const token = process.env.BEARER_TOKEN;

  // Clean and ensure HTTPS URL without trailing slashes
  let apiUrl = (process.env.API_URL || 'https://pay.cloud.or.ke/api/wallet/deposit').trim();
  apiUrl = apiUrl.replace(/\/+$/, ''); // Strip trailing slashes to avoid 301/302 redirects

  if (!token) {
    return res.status(500).json({ error: 'BEARER_TOKEN environment variable is not configured.' });
  }

  if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
    return res.status(400).json({ error: 'Please provide a valid list of phone numbers.' });
  }

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Please provide a valid amount.' });
  }

  // Set SSE (Server-Sent Events) headers for real-time streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const total = phoneNumbers.length;

  for (let i = 0; i < total; i++) {
    const rawPhone = phoneNumbers[i];
    const formattedPhone = formatPhoneNumber(rawPhone);

    const payload = {
      phone: formattedPhone,
      amount: Number(amount),
      ...(reference ? { reference } : {})
    };

    let logEntry = {
      index: i + 1,
      total,
      phone: formattedPhone,
      timestamp: new Date().toISOString()
    };

    try {
      // Explicit options configuration to guarantee POST method and follow redirects cleanly
      const fetchOptions = {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token.trim()}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload),
        redirect: 'follow' // Automatically follow redirects (307/308 preserve POST)
      };

      const response = await fetch(apiUrl, fetchOptions);
      const responseData = await response.json().catch(() => ({}));

      if (response.ok) {
        logEntry.status = 'SUCCESS';
        logEntry.reference = responseData.reference || 'N/A';
        logEntry.message = 'STK Push sent successfully.';
      } else {
        logEntry.status = 'FAILED';
        logEntry.error = responseData.message || responseData.error || `HTTP ${response.status} ${response.statusText}`;
      }
    } catch (err) {
      logEntry.status = 'FAILED';
      logEntry.error = err.message || 'Network/Server Error';
    }

    // Stream status update to client
    res.write(`data: ${JSON.stringify(logEntry)}\n\n`);

    // Throttle rate: 30 requests per minute = 1 request every 2,000ms
    if (i < total - 1) {
      await sleep(2000);
    }
  }

  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
