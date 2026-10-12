const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function generatePngIcons() {
  const svgPath = path.join(__dirname, 'public', 'icon.svg');
  const svgBuffer = fs.readFileSync(svgPath);

  const sizes = [180, 192, 512];
  for (const size of sizes) {
    const outPath = path.join(__dirname, 'public', size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outPath);
    console.log(`Generated ${outPath}`);
  }
}

generatePngIcons().catch(console.error);
