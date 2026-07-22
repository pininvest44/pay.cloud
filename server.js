const express = require('express');
const cors = require('cors');
const axios = require('axios');
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

  const apiUrl = (process.env.API_URL || 'https://www.pay.cloud.or.ke/api/wallet/deposit').trim();

  if (!token) {
    return res.status(500).json({ error: 'BEARER_TOKEN environment variable is missing or empty.' });
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
  const cleanToken = token.trim();

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
      const response = await axios({
        method: 'POST',
        url: apiUrl,
        data: payload,
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'X-API-Key': cleanToken,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        validateStatus: () => true
      });

      if (response.status >= 200 && response.status < 300) {
        logEntry.status = 'SUCCESS';
        logEntry.reference = response.data?.reference || 'N/A';
        logEntry.message = 'Deposit initiated successfully.';
      } else {
        logEntry.status = 'FAILED';
        logEntry.error = response.data?.message || response.data?.error || `HTTP ${response.status}: ${JSON.stringify(response.data)}`;
      }
    } catch (err) {
      logEntry.status = 'FAILED';
      logEntry.error = err.message || 'Network Error';
    }

    res.write(`data: ${JSON.stringify(logEntry)}\n\n`);

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
