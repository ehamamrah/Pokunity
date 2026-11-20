/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server bundle for the multi-stage Docker image (node server.js).
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // BACKEND_INTERNAL_URL is read at runtime in the BFF route handler, so there are
  // deliberately no `rewrites()` here: those would be baked in at build time.
};

export default nextConfig;
