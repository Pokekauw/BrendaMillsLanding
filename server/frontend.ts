import express, { type Express } from "express";
import path from "node:path";
import type { Server } from "node:http";
import type { AppConfig } from "./config.js";

export async function attachFrontend(app: Express, config: AppConfig, server: Server) {
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), browsing-topics=()",
      "Content-Security-Policy": [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: https:",
        `connect-src 'self' https://countapi.mileshilliard.com https://abacus.jasoncameron.dev${config.production ? "" : " ws: wss:"}`,
        "object-src 'none'", "base-uri 'self'", "form-action 'self'",
        `frame-ancestors ${config.production ? "'self'" : "*"}`,
      ].join("; "),
    });
    next();
  });

  if (!config.production) {
    // Private files must never be served by Vite, even in the hosted development preview.
    app.use((req, res, next) => {
      if (/^\/(?:\.data|server|scripts)(?:\/|$)/i.test(req.path) || /\.sqlite(?:-wal|-shm)?$/i.test(req.path)) {
        res.status(404).end();
        return;
      }
      next();
    });
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true, hmr: { server } },
      appType: "spa",
    });
    app.use(vite.middlewares);
    return () => vite.close();
  }

  const root = path.resolve("dist");
  app.use(express.static(root, { index: false, dotfiles: "deny", maxAge: "1h" }));
  app.get("/{*splat}", (req, res) => {
    if (path.extname(req.path) || req.path.split("/").some((segment) => segment.startsWith("."))) { res.status(404).end(); return; }
    res.set("Cache-Control", "no-cache").sendFile(path.join(root, "index.html"));
  });
  return async () => undefined;
}
