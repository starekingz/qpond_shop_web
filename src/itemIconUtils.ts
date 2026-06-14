/** Extract item_model from components string (1.21+ format) */
export function parseItemModel(itemComponents: string): string | null {
  const match = itemComponents.match(/minecraft:item_model=>([a-z0-9_.-]+:[a-z0-9_./-]+)/);
  return match ? match[1] : null;
}

/** Build item texture URLs — item_model first, then itemId fallback, local → CDN */
export function getItemIconUrls(itemId: string, itemComponents?: string): string[] {
  const urls: string[] = [];
  const cdnBase = (import.meta.env.VITE_TEXTURE_CDN_URL as string) || "https://assets.mcasset.cloud/1.21";

  // 1. Try item_model from components (custom items via ItemsAdder/Oraxen)
  if (itemComponents) {
    const itemModel = parseItemModel(itemComponents);
    if (itemModel && itemModel !== itemId) {
      const [ns, path] = itemModel.split(":");
      urls.push(`/textures/assets/${ns}/textures/${path}.png`);
      urls.push(`/textures/assets/${ns}/textures/item/${path}.png`);
      urls.push(`/textures/assets/${ns}/textures/block/${path}.png`);
      urls.push(`${cdnBase}/assets/${ns}/textures/${path}.png`);
      urls.push(`${cdnBase}/assets/${ns}/textures/item/${path}.png`);
      urls.push(`${cdnBase}/assets/${ns}/textures/block/${path}.png`);
    }
  }

  // 2. Fallback to vanilla itemId
  const [ns, path] = itemId.includes(":") ? itemId.split(":") : ["minecraft", itemId];
  urls.push(`/textures/assets/${ns}/textures/${path}.png`);
  urls.push(`/textures/assets/${ns}/textures/item/${path}.png`);
  urls.push(`/textures/assets/${ns}/textures/block/${path}.png`);
  urls.push(`${cdnBase}/assets/${ns}/textures/item/${path}.png`);
  urls.push(`${cdnBase}/assets/${ns}/textures/block/${path}.png`);

  return urls;
}
