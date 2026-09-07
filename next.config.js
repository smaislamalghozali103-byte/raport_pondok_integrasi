/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['firebase-admin', 'googleapis', 'xlsx'],
  reactStrictMode: false,
};

export default nextConfig;
