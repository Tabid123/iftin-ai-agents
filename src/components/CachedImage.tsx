import React, { useEffect, useState } from 'react';
import { cacheImage, getCachedImage } from '@/lib/imageCache';

type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | null | undefined;
};

/**
 * <img> that prefers a locally cached data URL, so logos keep rendering when
 * the device is offline (airplane mode) and appear instantly on open.
 */
const CachedImage = ({ src, alt, ...rest }: Props) => {
  const [resolved, setResolved] = useState<string | null>(() => getCachedImage(src) ?? src ?? null);

  useEffect(() => {
    const cached = getCachedImage(src);
    setResolved(cached ?? src ?? null);
    if (!cached && src) {
      let alive = true;
      cacheImage(src).then((dataUrl) => {
        if (alive && dataUrl) setResolved(dataUrl);
      });
      return () => { alive = false; };
    }
  }, [src]);

  if (!resolved) return null;

  return <img src={resolved} alt={alt} {...rest} />;
};

export default CachedImage;
