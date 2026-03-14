/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // xrpl.js requires these Node.js polyfills
    config.resolve.fallback = {
      ...config.resolve.fallback,
      net: false,
      tls: false,
      fs: false,
    }
    return config
  },
}

module.exports = nextConfig
