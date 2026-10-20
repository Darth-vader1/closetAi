"use client";

import { useEffect, useState } from "react";

export function useLoadedImages(imageUrls: Record<string, string>) {
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    const paths = Object.keys(imageUrls);

    if (paths.length === 0) {
      return;
    }

    setLoading(true);
    let pendingCount = paths.length;

    paths.forEach((path) => {
      const url = imageUrls[path];
      if (!url) {
        pendingCount--;
        if (pendingCount === 0 && !isCancelled) setLoading(false);
        return;
      }

      // If already loaded in state, skip network load
      if (images[path]?.complete) {
        pendingCount--;
        if (pendingCount === 0 && !isCancelled) setLoading(false);
        return;
      }

      const img = new window.Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        if (!isCancelled) {
          setImages((prev) => ({ ...prev, [path]: img }));
          pendingCount--;
          if (pendingCount === 0) setLoading(false);
        }
      };

      img.onerror = () => {
        // Fallback without crossOrigin in case CORS header is rejected
        const fallbackImg = new window.Image();
        fallbackImg.onload = () => {
          if (!isCancelled) {
            setImages((prev) => ({ ...prev, [path]: fallbackImg }));
          }
        };
        fallbackImg.src = url;

        if (!isCancelled) {
          pendingCount--;
          if (pendingCount === 0) setLoading(false);
        }
      };

      img.src = url;
    });

    return () => {
      isCancelled = true;
    };
  }, [imageUrls]);

  return { images, loading };
}
