import React, { useEffect, useState } from 'react';
import { cacheImage, getCachedImage } from '@/lib/imageCache';
import { getBundledLogo } from '@/lib/bundledLogos';

type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | null | undefined;
  /** Provider / payment name used to pick a logo shipped inside the app build. */
  bundledName?: string | null;
  /** Last resort when there is no cached, remote or bundled image. */
  fallback?: React.ReactNode;
};

/**
 * <img> that prefers a locally cached data URL, then the network image, then a
 * logo bundled in the build — so logos render 100% of the time, online or offline.
 */
const CachedImage = ({ src, alt, bundledName, fallback, ...rest }: Props) => {
  const bundled = getBundledLogo(bundledName ?? (typeof alt === 'string' ? alt : null));
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

  if (!resolved || failed) return <>{fallback ?? null}</>;


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
