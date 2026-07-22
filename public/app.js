document.getElementById('stkForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const rawNumbers = document.getElementById('phoneNumbers').value;
  const amount = document.getElementById('amount').value;
  const reference = document.getElementById('reference').value;
  const submitBtn = document.getElementById('submitBtn');
  const logsBox = document.getElementById('logs');
  const statusContainer = document.getElementById('statusContainer');
  const progressFill = document.getElementById('progressFill');
  const progressStats = document.getElementById('progressStats');

  const phoneNumbers = rawNumbers
    .split(/[\n,]/)
    .map(n => n.trim())
    .filter(n => n.length > 0);

  if (phoneNumbers.length === 0) {
    alert('Please enter at least one phone number.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Processing Batch...';
  statusContainer.style.display = 'block';
  progressFill.style.width = '0%';
  progressStats.textContent = `0 / ${phoneNumbers.length} processed`;

  try {
    const response = await fetch('/api/bulk-deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumbers, amount, reference })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop(); // Retain incomplete line chunks in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.replace('data: ', ''));

          if (data.done) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Dispatch Bulk STK Push';
            return;
          }

          const pct = Math.round((data.index / data.total) * 100);
          progressFill.style.width = `${pct}%`;
          progressStats.textContent = `${data.index} / ${data.total} processed`;

          const logDiv = document.createElement('div');
          logDiv.className = `log-entry ${data.status}`;
          logDiv.textContent = `[${new Date(data.timestamp).toLocaleTimeString()}] #${data.index} ${data.phone} - ${data.status} ${data.reference ? '| Ref: ' + data.reference : ''} ${data.error ? '| Err: ' + data.error : ''}`;
          logsBox.appendChild(logDiv);
          logsBox.scrollTop = logsBox.scrollHeight;
        }
      }
    }
  } catch (err) {
    alert('Execution error: ' + err.message);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Dispatch Bulk STK Push';
  }
});

document.getElementById('clearLogs')?.addEventListener('click', () => {
  document.getElementById('logs').innerHTML = '';
});
