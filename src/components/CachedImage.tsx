import React, { useEffect, useState } from 'react';
import { cacheImage, getCachedImage } from '@/lib/imageCache';

type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | null | undefined;
  /** Rendered when there is no cached copy and the network image fails (offline). */
  fallback?: React.ReactNode;
};

/**
 * <img> that prefers a locally cached data URL, so logos keep rendering when
 * the device is offline (airplane mode) and appear instantly on open.
 */
const CachedImage = ({ src, alt, fallback, ...rest }: Props) => {
  const [resolved, setResolved] = useState<string | null>(() => getCachedImage(src) ?? src ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const cached = getCachedImage(src);
    setFailed(false);
    setResolved(cached ?? src ?? null);

    if (!cached && src) {
      cacheImage(src).then((dataUrl) => {
        if (alive && dataUrl) {
          setResolved(dataUrl);
          setFailed(false);
        }
      });
    }
    return () => { alive = false; };
  }, [src]);

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
