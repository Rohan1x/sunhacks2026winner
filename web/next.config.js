/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // web3.js and anchor use node polyfills in some paths; keep them external on the server.
  experimental: {},
};

module.exports = nextConfig;
