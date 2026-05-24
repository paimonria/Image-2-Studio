/** @type {import('next').NextConfig} */
const isStandaloneBuild = process.env.NEXT_STANDALONE === "true";

const nextConfig = {
  reactStrictMode: true,
  ...(isStandaloneBuild
    ? {
        output: "standalone",
        outputFileTracingIncludes: {
          "/*": [
            "./node_modules/.prisma/client/**/*",
            "./node_modules/@prisma/client/**/*"
          ],
          "/api/**/*": [
            "./node_modules/.prisma/client/**/*",
            "./node_modules/@prisma/client/**/*"
          ]
        }
      }
    : {})
};

export default nextConfig;
