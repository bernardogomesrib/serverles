import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "local-origin.dev",
    "*.local-origin.dev",
    "localhost",
    `${process.env.PUBLIC_IP}`,
  ],
};

export default nextConfig;
