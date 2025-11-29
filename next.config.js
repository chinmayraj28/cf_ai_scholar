/** @type {import('next').NextConfig} */
const nextConfig = {
  // Only use static export for production builds
  // output: 'export', // Commented out for local dev (API routes need this disabled)
  images: {
    unoptimized: true,
  },
  distDir: '.next',
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
}

module.exports = nextConfig
