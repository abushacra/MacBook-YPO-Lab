import type { MetadataRoute } from "next";

/** Lets engineers add the app to their phone's home screen and run it full-screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kapa Service Log",
    short_name: "Kapa Log",
    description: "Log maintenance shifts and credit card receipts from the field.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f2f5f8",
    theme_color: "#1b5b8b",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
