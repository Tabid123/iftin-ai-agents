/**
 * Logos bundled inside the app build (also inside the APK), so a provider logo
 * always renders — online or fully offline — even with an empty image cache.
 */
import hormuud from '@/assets/providers/hormuud-logo.jpeg';
import somnet from '@/assets/providers/somnet-logo.png';
import somtel from '@/assets/providers/somtel-logo.jpg';
import amtel from '@/assets/providers/amtel-logo.png';
import somlink from '@/assets/providers/somlink-logo.png';
import evc from '@/assets/payment-providers/evc-plus.png';
import edahab from '@/assets/payment-providers/edahab.jpg';
import jeeb from '@/assets/payment-providers/jeeb.png';
import premier from '@/assets/payment-providers/premier.jfif';

const MAP: Array<[string, string]> = [
  ['hormuud', hormuud],
  ['evc', evc],
  ['somnet', somnet],
  ['somtel', somtel],
  ['amtel', amtel],
  ['somlink', somlink],
  ['edahab', edahab],
  ['golis', edahab],
  ['jeeb', jeeb],
  ['premier', premier],
  ['telesom', somtel],
];

/** Returns a bundled logo for a provider/payment name, if we ship one. */
export function getBundledLogo(name: string | null | undefined): string | null {
  if (!name) return null;
  const key = name.toLowerCase().replace(/[^a-z]/g, '');
  for (const [needle, asset] of MAP) {
    if (key.includes(needle)) return asset;
  }
  return null;
}
