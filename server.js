const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

  // Updated to the actual CloudPay STK Push route
  let apiUrl = (process.env.API_URL || 'https://pay.cloud.or.ke/api/payments/mpesa/stkpush').trim();

  if (!token) {
    return res.status(500).json({ error: 'BEARER_TOKEN is not set in environment variables.' });
  }

  if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
    return res.status(400).json({ error: 'Please provide a valid array of phone numbers.' });
  }

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Please provide a valid amount.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const total = phoneNumbers.length;

  for (let i = 0; i < total; i++) {
    const rawPhone = phoneNumbers[i];
    const formattedPhone = formatPhoneNumber(rawPhone);

    // Payload expected by CloudPay STK Push
    const payload = {
      phone: formattedPhone,
      amount: Number(amount),
      accountReference: reference || 'BulkDeposit'
    };

    let logEntry = {
      index: i + 1,
      total,
      phone: formattedPhone,
      timestamp: new Date().toISOString()
    };

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token.trim()}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const responseData = await response.json().catch(() => ({}));

      if (response.ok) {
        logEntry.status = 'SUCCESS';
        logEntry.reference = responseData.reference || responseData.CheckoutRequestID || 'N/A';
        logEntry.message = 'STK Push initiated successfully.';
      } else {
        logEntry.status = 'FAILED';
        logEntry.error = responseData.message || responseData.error || `HTTP ${response.status}`;
      }
    } catch (err) {
      logEntry.status = 'FAILED';
      logEntry.error = err.message || 'Network/Server Error';
    }

    res.write(`data: ${JSON.stringify(logEntry)}\n\n`);

    // Maintain 30 requests per minute rate limit
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
