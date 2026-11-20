/** @type {import('next').NextConfig} */
const nextConfig = {
  // Inline public defaults at build time. An unset NEXT_PUBLIC_* stays a runtime lookup, which keeps
  // the dev-only MSW import alive in the production bundle. A literal lets the minifier drop it.
  env: {
    NEXT_PUBLIC_API_MOCKING: process.env.NEXT_PUBLIC_API_MOCKING ?? 'disabled',
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1',
  },
  // Self-contained server bundle for the multi-stage Docker image (node server.js).
  output: 'standalone',
  reactStrictMode: true,
  webpack(config, { isServer, webpack }) {
    // Dev-only mock backend (MSW + fixtures under src/mocks). With mocking off, the client build
    // ignores that directory entirely, so none of it is emitted into the production bundle.
    if (!isServer && process.env.NEXT_PUBLIC_API_MOCKING !== 'enabled') {
      config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /(^|[\\/])mocks[\\/]browser(\.ts)?$/ }));
    }
    return config;
  },
  poweredByHeader: false,
  // BACKEND_INTERNAL_URL is read at runtime in the BFF route handler, so there are
  // deliberately no `rewrites()` here: those would be baked in at build time.
};

export default nextConfig;
