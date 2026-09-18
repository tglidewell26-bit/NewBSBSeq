import type { Request } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

export const CLERK_PROXY_PATH = "/api/__clerk";
export const getClerkProxyHost = (req: Request) =>
  req.get("x-forwarded-host")?.split(",")[0]?.trim() ?? req.get("host");

export const clerkProxyMiddleware = () =>
  createProxyMiddleware({
    target: "https://frontend-api.clerk.services",
    changeOrigin: true,
    pathRewrite: { [`^${CLERK_PROXY_PATH}`]: "" },
    on: {
      proxyReq(proxyReq, req) {
        const host = getClerkProxyHost(req as Request);
        if (host) proxyReq.setHeader("x-forwarded-host", host);
      },
    },
  });