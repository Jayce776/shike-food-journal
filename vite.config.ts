import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

declare const process: { env: Record<string, string | undefined> };
const githubPages = process.env.GITHUB_PAGES === "true";
const base = githubPages ? "/shike-food-journal/" : "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        id: base,
        name: "食刻 · 饮食记录",
        short_name: "食刻",
        description: "简单、舒适的个人饮食与饮水记录",
        theme_color: "#f7fbf5",
        background_color: "#f7fbf5",
        display: "standalone",
        orientation: "portrait-primary",
        scope: base,
        start_url: base,
        categories: ["health", "lifestyle"],
        icons: [
          { src: `${base}icon.svg`, sizes: "any", type: "image/svg+xml", purpose: "any maskable" }
        ]
      }
    })
  ]
});
