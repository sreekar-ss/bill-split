import { ImageResponse } from "next/og";
import { iconDataUri } from "@/lib/pwa/icon-art";

// iOS home-screen icon (apple-touch-icon). iOS rounds the corners itself.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<img src={iconDataUri()} width={180} height={180} alt="" />, size);
}
