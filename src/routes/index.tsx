import { createFileRoute } from "@tanstack/react-router";
import bannerAsset from "@/assets/jermspray-banner.png.asset.json";
import iconAsset from "@/assets/jermspray-icon.png.asset.json";
import { StencilMaker } from "@/components/StencilMaker";
import { ThemeToggle } from "@/components/ThemeToggle";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "JermSpray Stencil Maker" },
      { name: "description", content: "Multilayer stencil maker for spray painting. Upload an image, auto-detect colors, generate numbered layers, and download SVG/PNG stencils." },
      { property: "og:title", content: "JermSpray Stencil Maker" },
      { property: "og:description", content: "Multilayer stencil maker for spray painting." },
      { property: "og:image", content: bannerAsset.url },
      { name: "twitter:image", content: bannerAsset.url },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen">
      <header className="no-print relative">
        <img
          src={bannerAsset.url}
          alt="JermSpray Stencil Maker"
          className="w-full h-auto"
        />
        <div className="absolute top-2 right-2 flex items-center gap-2">
          <img src={iconAsset.url} alt="" className="w-10 h-10 rounded shadow" />
          <ThemeToggle />
        </div>
      </header>
      <main>
        <h1 className="sr-only">JermSpray Stencil Maker</h1>
        <StencilMaker />
      </main>
    </div>
  );
}
