const https = require('https');
const fs = require('fs');

const agent = new https.Agent({
  rejectUnauthorized: false
});

https.get('https://magapp.ivry.local/', { agent }, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    fs.writeFileSync('magapp_dump.html', data);
    console.log('HTML fetched and saved to magapp_dump.html');
  });
}).on('error', (err) => {
  console.error('Error fetching magapp:', err);
});
