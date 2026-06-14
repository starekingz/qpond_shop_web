import { useMemo, useState, useCallback } from "react";
import WeaponModelIcon from "./WeaponModelIcon";
import { parseItemModel, getItemIconUrls } from "./itemIconUtils";

export default function ItemIcon({ itemId, itemComponents, size = 32 }: { itemId: string; itemComponents?: string; size?: number }) {
  // Detect qp_weapon items → render 3D model on Canvas
  const itemModel = itemComponents ? parseItemModel(itemComponents) : null;
  const isWeapon = !!itemModel && itemModel.startsWith("qp_weapon:");

  const urls = useMemo(() => getItemIconUrls(itemId, itemComponents), [itemId, itemComponents]);
  const [urlIndex, setUrlIndex] = useState(0);

  const handleError = useCallback(() => {
    setUrlIndex((prev) => {
      const next = prev + 1;
      return next < urls.length ? next : -1;
    });
  }, [urls.length]);

  if (isWeapon) {
    return (
      <WeaponModelIcon
        modelRef={itemModel!}
        size={size}
        fallback={
          urls.length > 0 ? (
            <img
              className="item-icon"
              src={urls[urls.length - 2] || urls[0]}
              alt={itemId}
              width={size}
              height={size}
              loading="lazy"
              style={{ imageRendering: "pixelated" }}
              onError={handleError}
            />
          ) : (
            <div className="item-icon item-icon-fallback" style={{ width: size, height: size }}>
              {itemId.charAt(itemId.includes(":") ? itemId.indexOf(":") + 1 : 0).toUpperCase()}
            </div>
          )
        }
      />
    );
  }

  if (urls.length === 0 || urlIndex === -1 || urlIndex >= urls.length) {
    return (
      <div className="item-icon item-icon-fallback" style={{ width: size, height: size }}>
        {itemId.charAt(itemId.includes(":") ? itemId.indexOf(":") + 1 : 0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      key={urls[urlIndex]}
      className="item-icon"
      src={urls[urlIndex]}
      alt={itemId}
      width={size}
      height={size}
      loading="lazy"
      style={{ imageRendering: "pixelated" }}
      onError={handleError}
    />
  );
}
