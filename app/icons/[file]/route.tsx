import { ImageResponse } from "next/og";
import { ICON_FILES, iconDataUri } from "@/lib/pwa/icon-art";

/** PNG app icons for the web manifest, rendered from the single SVG source. */
export const dynamic = "force-static";

export function generateStaticParams() {
  return Object.keys(ICON_FILES).map((file) => ({ file }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const spec = ICON_FILES[file as keyof typeof ICON_FILES];
  if (!spec) return new Response("Not found", { status: 404 });
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element
    <img src={iconDataUri({ scale: spec.scale })} width={spec.size} height={spec.size} alt="" />,
    { width: spec.size, height: spec.size, headers: { "Cache-Control": "public, max-age=86400, immutable" } },
  );
}
