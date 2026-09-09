// Renders the SVG brand marks in assets/brand/ into the raster PNGs Expo expects in assets/.
// Run with: node scripts/generate-app-icons.js
const path = require("path");
const sharp = require("sharp");

const BRAND_DIR = path.join(__dirname, "..", "assets", "brand");
const ASSETS_DIR = path.join(__dirname, "..", "assets");

const targets = [
  { src: "icon-full.svg", out: "icon.png", size: 1024 },
  { src: "icon-foreground.svg", out: "android-icon-foreground.png", size: 1024 },
  { src: "icon-background.svg", out: "android-icon-background.png", size: 1024 },
  { src: "icon-monochrome.svg", out: "android-icon-monochrome.png", size: 1024 },
  { src: "icon-full.svg", out: "favicon.png", size: 196 },
  { src: "icon-foreground.svg", out: "splash-icon.png", size: 512 },
];

async function run() {
  for (const target of targets) {
    const srcPath = path.join(BRAND_DIR, target.src);
    const outPath = path.join(ASSETS_DIR, target.out);
    await sharp(srcPath, { density: 384 })
      .resize(target.size, target.size)
      .png()
      .toFile(outPath);
    console.log(`Wrote ${target.out} (${target.size}x${target.size}) from ${target.src}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
