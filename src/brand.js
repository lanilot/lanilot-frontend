// Applies a company's brand to the page: accent color (CSS --brand) and favicon from its logo.
export function applyBrand(brand){
 const root=document.documentElement;
 if(brand?.color)root.style.setProperty('--brand',brand.color);else root.style.removeProperty('--brand');
 let icon=document.querySelector('link[rel=icon]');
 // A company logo replaces the tab icon; otherwise the Lanilot mark stays.
 if(!icon){icon=document.createElement('link');icon.rel='icon';document.head.append(icon)}
 icon.href=brand?.logo||'/favicon.svg';
}
export async function fetchBrand(){const t=await fetch('/api/tenant').then(r=>r.json());applyBrand(t.company?.brand);return t.company?.brand??null}
