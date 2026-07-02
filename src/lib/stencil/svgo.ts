import { optimize } from "svgo";

export function optimizeSvg(svg: string): string {
  const result = optimize(svg, {
    multipass: true,
    plugins: [
      {
        name: "preset-default",
        params: {
          overrides: {
            removeViewBox: false,
          },
        },
      },
      "removeComments",
      "removeMetadata",
    ],
  });

  return result.data;
}