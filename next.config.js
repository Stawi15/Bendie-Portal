/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // The Portal doesn't use next/image (every image is a plain <img>), so the image
    // optimisation endpoint is switched off. It previously accepted any `*.supabase.co`
    // host, which includes projects anyone can create — and the optimiser has had
    // several remote-code-execution advisories (e.g. GHSA-2464-fhr4-w9xw).
    unoptimized: true,
  },
};

module.exports = nextConfig;
