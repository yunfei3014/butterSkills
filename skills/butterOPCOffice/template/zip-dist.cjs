// Zip dist/ with forward-slash entry paths for Butterbase frontend upload.
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const output = fs.createWriteStream(path.join(__dirname, 'frontend.zip'));
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`frontend.zip created (${archive.pointer()} bytes)`);
});
archive.on('error', (err) => { throw err; });

archive.pipe(output);
archive.directory('dist/', false);
archive.finalize();
