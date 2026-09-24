import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HOMEBASE",
    short_name: "HOMEBASE",
    description: "the owner's private daily command center.",
    start_url: "/",
    display: "standalone",
    background_color: "#07090b",
    theme_color: "#07090b",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
