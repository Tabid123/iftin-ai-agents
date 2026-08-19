import React, { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { cacheImage, getCachedImage } from '@/lib/imageCache';
import { getLocalImage, type LocalImageKind } from '@/lib/localImages';

type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | null | undefined;
  /** Provider / payment name used to pick a logo shipped inside the app build. */
  bundledName?: string | null;
  kind?: LocalImageKind;
  providerName?: string | null;
  /** Last resort when there is no cached, remote or bundled image. */
  fallback?: React.ReactNode;
};

/**
 * <img> that prefers a locally cached data URL, then the network image, then a
 * logo bundled in the build — so logos render 100% of the time, online or offline.
 */
const CachedImage = ({ src, alt, bundledName, kind = 'provider', providerName, fallback, ...rest }: Props) => {
  // bundledName === null means "never substitute a bundled asset" (e.g. banners
  // uploaded by a tenant admin must render exactly as uploaded).
  const skipBundled = bundledName === null;
  const imageName = bundledName ?? (typeof alt === 'string' ? alt : null);
  const bundled = skipBundled ? null : getLocalImage(kind, imageName, src, providerName);
  // Bundled asset first: it ships inside the build, so it paints instantly and
  // works with zero network. Cached data URL next, remote URL last.
  const pick = (s: string | null | undefined) => bundled ?? getCachedImage(s) ?? s ?? null;

  const [resolved, setResolved] = useState<string | null>(() => pick(src));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    setResolved(pick(src));

    // Keep warming the cache in the background for images we don't bundle.
    if (!bundled && src && !getCachedImage(src)) {
      cacheImage(src).then((dataUrl) => {
        if (alive && dataUrl) {
          setResolved(dataUrl);
          setFailed(false);
        }
      });
    }
    return () => { alive = false; };
  }, [src, bundled]);

  if (failed && bundled && resolved !== bundled) {
    return <img src={bundled} alt={alt} {...rest} />;
  }

  if (!resolved || failed) {
    return <>{fallback ?? <span className="flex size-full items-center justify-center rounded bg-muted text-muted-foreground" aria-hidden="true"><ImageOff className="size-5" /></span>}</>;
  }


  return (
    <img
      src={resolved}
      alt={alt}
      onError={() => setFailed(true)}
      {...rest}
    />
  );
};

export default CachedImage;
