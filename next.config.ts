import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Chrome for the PDF route. @sparticuz/chromium ships the browser as
  // brotli-compressed files in its own bin/ directory, which nothing in the
  // code imports — so Next's file tracing has no reason to know about it and
  // leaves it out of the deployed function. The route then fails at launch
  // with "The input directory /var/task/node_modules/@sparticuz/chromium/bin
  // does not exist". Naming it here puts it back.
  //
  // The key is a picomatch glob, and picomatch reads "[slug]" as a character
  // class rather than a literal, so the dynamic segment is a wildcard here.
  outputFileTracingIncludes: {
    '/api/proposals/*/pdf': ['./node_modules/@sparticuz/chromium/bin/**/*'],
  },
  // Belt and braces: keep the package out of the bundler so its paths stay
  // where the runtime expects them.
  serverExternalPackages: ['@sparticuz/chromium'],
};

export default nextConfig;
