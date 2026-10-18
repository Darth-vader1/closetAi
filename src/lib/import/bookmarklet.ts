import {
  classifyProductImage,
  type ExtractedProductImage,
  type ExtractedProductMetadata,
} from "./extract-product";
import { normalizeProductUrl } from "./url-utils";

export interface BookmarkletPayload {
  v: 1;
  url: string;
  title?: string | null;
  brand?: string | null;
  description?: string | null;
  color?: string | null;
  material?: string | null;
  category?: string | null;
  images?: string[];
  extractedAt?: number;
}

/**
 * Extracts a product URL from Web Share Target inputs (url, text, or title).
 * Many native mobile apps share URLs inside `text` instead of `url`.
 */
export function extractShareTargetUrl(input: {
  url?: string | null;
  text?: string | null;
  title?: string | null;
}): string | null {
  // 1. Direct url parameter
  if (input.url && typeof input.url === "string") {
    const trimmed = input.url.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      try {
        return normalizeProductUrl(trimmed);
      } catch {
        // Fall through to text parsing
      }
    }
  }

  // 2. Search inside text (e.g., "Check out this item: https://example.com/p/123")
  if (input.text && typeof input.text === "string") {
    const match = input.text.match(/https?:\/\/[^\s"'<>]+/i);
    if (match && match[0]) {
      try {
        return normalizeProductUrl(match[0]);
      } catch {
        // Fall through
      }
    }
  }

  // 3. Search inside title as a fallback
  if (input.title && typeof input.title === "string") {
    const match = input.title.match(/https?:\/\/[^\s"'<>]+/i);
    if (match && match[0]) {
      try {
        return normalizeProductUrl(match[0]);
      } catch {
        // Fall through
      }
    }
  }

  return null;
}

/**
 * Sanitizes a string by stripping HTML tags and control characters, and trimming length.
 */
function sanitizeField(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const withoutScripts = value.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    "",
  );
  const stripped = withoutScripts
    .replace(/<[^>]*>/g, "")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim();
  if (!stripped) return null;
  return stripped.slice(0, maxLength);
}

/**
 * Validates and parses a bookmarklet import payload (JSON string or object) into
 * standard ExtractedProductMetadata format for direct ingestion into StoreImportCard.
 */
export function parseBookmarkletPayload(raw: unknown): ExtractedProductMetadata | null {
  if (!raw) return null;

  let parsed: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      // Decode if URI-encoded
      const decoded = trimmed.startsWith("%") ? decodeURIComponent(trimmed) : trimmed;
      parsed = JSON.parse(decoded);
    } catch {
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return null;
      }
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const obj = parsed as Record<string, unknown>;

  // Check version
  if (obj.v !== 1 && obj.v !== "1") {
    return null;
  }

  // URL is required and must be valid http(s)
  if (typeof obj.url !== "string" || !obj.url.trim()) {
    return null;
  }

  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeProductUrl(obj.url.trim());
  } catch {
    return null;
  }

  const title = sanitizeField(obj.title, 200);
  const brand = sanitizeField(obj.brand, 100);
  const description = sanitizeField(obj.description, 500);
  const color = sanitizeField(obj.color, 60);
  const material = sanitizeField(obj.material, 100);
  const category = sanitizeField(obj.category, 80);

  // Validate image URLs: only http/https, deduplicate, limit to 10
  const validImages: ExtractedProductImage[] = [];
  const seenUrls = new Set<string>();

  if (Array.isArray(obj.images)) {
    for (const imgUrl of obj.images) {
      if (typeof imgUrl !== "string") continue;
      const trimmed = imgUrl.trim();
      if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) continue;
      try {
        const u = new URL(trimmed);
        if (seenUrls.has(u.href)) continue;
        seenUrls.add(u.href);
        const classified = classifyProductImage(u.href, null, validImages.length);
        validImages.push({
          url: u.href,
          alt: null,
          kind: classified.kind,
          reason: classified.reason,
        });
        if (validImages.length >= 10) break;
      } catch {
        // Skip invalid URL
      }
    }
  }

  // Determine recommended image index (prefer garment-only)
  const garmentIndex = validImages.findIndex((img) => img.kind === "garment-only");
  const recommendedImageIndex = garmentIndex >= 0 ? garmentIndex : 0;

  return {
    productUrl: obj.url.trim(),
    normalizedUrl,
    title,
    brand,
    description,
    category,
    color,
    material,
    images: validImages,
    recommendedImageIndex,
    extractionSource: "microdata",
    sourcesUsed: ["microdata"],
  };
}

/**
 * Generates the minified `javascript:(function(){...})()` bookmarklet code.
 * When clicked on any retail store tab, it executes directly in the user's browser,
 * extracting metadata and image URLs from the live DOM (bypassing server anti-bot protections),
 * and opens ClosetAI's /wardrobe/new page with the extracted payload.
 */
export function generateBookmarkletCode(appOrigin?: string): string {
  const origin = (appOrigin ?? "").trim().replace(/\/+$/, "");
  const targetPrefix = origin ? `${origin}/wardrobe/new?import_payload=` : "";

  // Minified, cross-browser vanilla JS script
  const scriptBody = `
(function(){
  try{
    var d=document,w=window,loc=w.location;
    var canon=(d.querySelector('link[rel="canonical"]')||{}).href||loc.href;
    var getMeta=function(props){
      for(var i=0;i<props.length;i++){
        var el=d.querySelector('meta[property="'+props[i]+'"]')||d.querySelector('meta[name="'+props[i]+'"]');
        if(el&&el.content&&el.content.trim())return el.content.trim();
      }
      return '';
    };
    var title=getMeta(['og:title','twitter:title'])||d.title||'';
    var desc=getMeta(['og:description','twitter:description','description'])||'';
    var brand=getMeta(['og:site_name','product:brand','brand'])||loc.hostname.replace(/^www\\./,'');
    var imgs=[];
    var addImg=function(u){
      if(!u||typeof u!=='string')return;
      u=u.trim();
      if(!u||u.indexOf('data:')===0||u.indexOf('javascript:')===0)return;
      try{
        var abs=new URL(u,loc.href).href;
        if(abs.indexOf('http')===0&&imgs.indexOf(abs)===-1){imgs.push(abs);}
      }catch(e){}
    };
    addImg(getMeta(['og:image:secure_url','og:image','twitter:image']));
    var color='',mat='',cat='';
    var scs=d.querySelectorAll('script[type="application/ld+json"]');
    for(var s=0;s<scs.length;s++){
      try{
        var json=JSON.parse(scs[s].textContent||'{}');
        var items=Array.isArray(json)?json:(json['@graph']||[json]);
        for(var j=0;j<items.length;j++){
          var it=items[j];
          if(!it||typeof it!=='object')continue;
          var t=it['@type'];
          if(t==='Product'||(Array.isArray(t)&&t.indexOf('Product')!==-1)||t==='ProductGroup'){
            if(it.name&&!title)title=it.name;
            if(it.brand)brand=typeof it.brand==='string'?it.brand:(it.brand.name||brand);
            if(it.description&&!desc)desc=it.description;
            if(it.color)color=typeof it.color==='string'?it.color:'';
            if(it.material)mat=typeof it.material==='string'?it.material:'';
            if(it.category)cat=typeof it.category==='string'?it.category:'';
            if(it.image){
              if(Array.isArray(it.image)){
                for(var im=0;im<it.image.length;im++){
                  addImg(typeof it.image[im]==='string'?it.image[im]:(it.image[im]||{}).url);
                }
              }else{
                addImg(typeof it.image==='string'?it.image:(it.image||{}).url);
              }
            }
          }
        }
      }catch(e){}
    }
    var pImgs=d.querySelectorAll('img');
    for(var p=0;p<pImgs.length&&imgs.length<12;p++){
      var imEl=pImgs[p];
      var z=imEl.getAttribute('data-zoom-image')||imEl.getAttribute('data-large-img-url')||imEl.getAttribute('data-src');
      if(z)addImg(z);
      var wV=imEl.naturalWidth||imEl.width||0;
      var hV=imEl.naturalHeight||imEl.height||0;
      if(wV>=200&&hV>=200&&imEl.src)addImg(imEl.src);
    }
    imgs=imgs.slice(0,8);
    var payload={
      v:1,
      url:canon,
      title:title.slice(0,200),
      brand:brand.slice(0,100),
      description:desc.slice(0,500),
      color:color.slice(0,60),
      material:mat.slice(0,100),
      category:cat.slice(0,80),
      images:imgs,
      extractedAt:Date.now()
    };
    var target=(${targetPrefix ? JSON.stringify(targetPrefix) : "loc.origin+'/wardrobe/new?import_payload='"})+encodeURIComponent(JSON.stringify(payload));
    var opened=w.open(target,'_blank');
    if(!opened){loc.href=target;}
  }catch(err){
    alert('ClosetAI: Unable to extract product details: '+(err.message||err));
  }
})();
`.trim().replace(/\s+/g, " ");

  return `javascript:${scriptBody}`;
}
