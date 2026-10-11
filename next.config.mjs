const security = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "Content-Security-Policy", value: "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },
];
export default {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["playwright-core"],
  images: { unoptimized: true },
  experimental: { serverActions: { bodySizeLimit: "60mb" } },
  async headers() { return [{ source: "/:path*", headers: security }]; },
};
