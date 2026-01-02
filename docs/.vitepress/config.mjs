import { defineConfig } from "vitepress";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Kiwipanel Docs",
  description: "How and Why ",
  //https://docs.readthedocs.com/platform/stable/intro/vitepress.html
  base: process.env.READTHEDOCS_CANONICAL_URL
    ? new URL(process.env.READTHEDOCS_CANONICAL_URL).pathname.replace(/\/$/, "")
    : "",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: "Home", link: "/" },
      { text: "Install", link: "/introduction/install" },
    ],
    sidebar: [
      {
        text: "Get started",
        collapsed: false,
        items: [
          { text: "Introduction", link: "/introduction/about" },
          { text: "Supported OS", link: "/introduction/os" },
          { text: "Install", link: "/introduction/install" },
          { text: "CLI & Web", link: "/introduction/web" },
          { text: "Locations", link: "/introduction/locations" },
        ],
      },
      {
        text: "Features",
        collapsed: false,
        items: [
          { text: "Firewall", link: "/features/firewall" },
          { text: "Optimization", link: "/features/optimization" },
          { text: "Lock Mode", link: "/features/lockmode" },
          { text: "Security Check", link: "/features/security" },
        ],
      },
      {
        text: "Roadmaps",
        collapsed: false,
        items: [{ text: "Progress", link: "/roadmap/index" }],
      },
    ],

    socialLinks: [
      { icon: "github", link: "https://github.com/kiwipanel/kiwipanel" },
    ],
  },
});
