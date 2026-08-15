/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
};

module.exports = nextConfig;

// Only in `next dev`: the Workers AI binding is proxied to the real service,
// which needs Cloudflare credentials (`wrangler login`) — builds must not require them.
if (process.env.NODE_ENV === 'development' && !process.env.SKIP_CF_DEV) {
  import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
}
