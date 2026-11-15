/** @type {import('next').NextConfig} */

// GitHub Pages serves the site from /<repo>/, so the workflow sets BASE_PATH.
// Local dev leaves it empty.
const basePath = process.env.BASE_PATH || "";

const nextConfig = {
  reactStrictMode: true,
  // Static export: the app is fully client-rendered, so no server is needed.
  output: "export",
  // Trailing slashes give /pay/index.html, which Pages serves directly.
  trailingSlash: true,
  basePath,
};

module.exports = nextConfig;
