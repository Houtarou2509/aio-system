const path = require('path');
const sharp = require('sharp');

const input = path.resolve(__dirname, 'accountability-flow.svg');
const output = path.resolve(__dirname, 'accountability-flow.png');

sharp(input, { density: 180 })
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toFile(output)
  .then(info => {
    console.log(JSON.stringify({ output, info }, null, 2));
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
