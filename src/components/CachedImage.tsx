import React, { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { cacheImage, getCachedImage } from '@/lib/imageCache';
import { getLocalImage, genericCategoryImage, type LocalImageKind } from '@/lib/localImages';

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
 * logo bundled in the build — so logos render online/offline without a visible
 * source swap after first paint.
 */
const CachedImage = ({ src, alt, bundledName, kind = 'provider', providerName, fallback, ...rest }: Props) => {
  const skipBundled = bundledName === null;
  const imageName = bundledName ?? (typeof alt === 'string' ? alt : null);
  const bundled = skipBundled ? null : getLocalImage(kind, imageName, src, providerName);
  const pick = (s: string | null | undefined) => bundled ?? getCachedImage(s) ?? s ?? null;

  const [resolved, setResolved] = useState<string | null>(() => pick(src));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    setResolved(pick(src));

    // Warm the cache for the NEXT mount, but never replace the source of an
    // already-painted image. Replacing remote URL -> data URL after paint made
    // cards/banner artwork visibly blink during navigation.
    if (!bundled && src && !getCachedImage(src)) {
      void cacheImage(src);
    }
  }, [src, bundled]);

  if (failed && bundled && resolved !== bundled) {
    return <img src={bundled} alt={alt} {...rest} />;
  }

  if (!resolved || failed) {
    if (kind === 'category') return <img src={genericCategoryImage} alt={alt} {...rest} />;
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
