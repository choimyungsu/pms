const selfsigned = require('selfsigned');
const fs = require('fs');

const attrs = [{ name: 'commonName', value: 'localhost' }];
const pems = selfsigned.generate(attrs, { days: 365 });

fs.writeFileSync('private-key.pem', pems.private);
fs.writeFileSync('certificate.pem', pems.cert);

console.log('Successfully generated private-key.pem and certificate.pem');
