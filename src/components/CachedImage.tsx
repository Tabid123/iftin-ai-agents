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
  const pick = (s: string | null | undefined) => getCachedImage(s) ?? s ?? bundled ?? null;

  const [resolved, setResolved] = useState<string | null>(() => pick(src));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const cached = getCachedImage(src);
    setFailed(false);
    setResolved(cached ?? src ?? bundled ?? null);

    if (!cached && src) {
      cacheImage(src).then((dataUrl) => {
        if (alive && dataUrl) {
          setResolved(dataUrl);
          setFailed(false);
        }
      });
    }
    return () => { alive = false; };
  }, [src, bundled]);

  if (failed && resolved !== bundled && bundled) {
    // Remote copy unavailable (offline) — fall back to the bundled asset.
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
