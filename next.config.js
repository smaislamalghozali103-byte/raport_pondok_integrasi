/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['firebase-admin', 'googleapis', 'xlsx'],
  reactStrictMode: false,
};

export default nextConfig;
