"use client";

import { useEffect, useRef, useState } from "react";

export function useLoadedImages(imageUrls: Record<string, string>) {
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({});
  const [failedPaths, setFailedPaths] = useState<Record<string, boolean>>({});
  const cacheRef = useRef<Record<string, HTMLImageElement>>({});

  useEffect(() => {
    let isCancelled = false;
    const paths = Object.keys(imageUrls);

    paths.forEach((path) => {
      const url = imageUrls[path];
      if (!url) return;

      // If already loaded in cache, skip network load
      if (cacheRef.current[path]?.complete) {
        return;
      }

      const img = new window.Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        cacheRef.current[path] = img;
        if (!isCancelled) {
          setImages((prev) => ({ ...prev, [path]: img }));
        }
      };

      img.onerror = () => {
        // Fallback without crossOrigin in case CORS header is rejected
        const fallbackImg = new window.Image();
        fallbackImg.onload = () => {
          cacheRef.current[path] = fallbackImg;
          if (!isCancelled) {
            setImages((prev) => ({ ...prev, [path]: fallbackImg }));
          }
        };
        fallbackImg.onerror = () => {
          if (!isCancelled) {
            setFailedPaths((prev) => ({ ...prev, [path]: true }));
          }
        };
        fallbackImg.src = url;
      };

      img.src = url;
    });

    return () => {
      isCancelled = true;
    };
  }, [imageUrls]);

  const paths = Object.keys(imageUrls);
  const loading = paths.some(
    (path) => Boolean(imageUrls[path]) && !images[path]?.complete && !failedPaths[path]
  );

  return { images, loading };
}
