/**
 * The BillSplit app icon ("Your slice", docs/design/app-icon.svg): a white pie with the yellow
 * slice — your share — pulled out, on ink blue. One source for every generated icon.
 *
 * `scale` shrinks the artwork toward the centre (maskable icons keep it inside Android's safe zone).
 */
export function iconSvg({ scale = 1, background = "#13213F" }: { scale?: number; background?: string } = {}) {
  const t = (1 - scale) * 512;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="${background}"/><g transform="translate(${t} ${t}) scale(${scale})"><path d="M500 524 L500 224 A300 300 0 1 0 800 524 Z" fill="#F2F5F1"/><path transform="translate(40 -40)" d="M500 524 L500 224 A300 300 0 0 1 800 524 Z" fill="#F4D94A"/></g></svg>`;
}

export function iconDataUri(opts?: Parameters<typeof iconSvg>[0]) {
  return `data:image/svg+xml;base64,${Buffer.from(iconSvg(opts)).toString("base64")}`;
}

export const ICON_FILES = {
  "icon-192.png": { size: 192, scale: 1 },
  "icon-512.png": { size: 512, scale: 1 },
  "maskable-192.png": { size: 192, scale: 0.82 },
  "maskable-512.png": { size: 512, scale: 0.82 },
} as const;
