import React from 'react';
import LogoMark from './LogoMark.jsx';

// A company's own logo (picture, or its name written as a wordmark) always carries a small "powered by Lanilot"
// mark at its bottom-right corner, so white-labelled workspaces still show who built the product. It cannot be turned off.
export default function BrandLogo({src,text,alt,className}){
 return <span className="brand-logo-powered">{src?<img className={className} src={src} alt={alt}/>:<span className="brand-logo-text" title={text}>{text}</span>}
  <span className="powered-by" title="Powered by Lanilot"><span className="powered-by-text">powered by</span><LogoMark color="#2563eb"/><strong>Lanilot</strong></span></span>;
}
// Whether a brand has its own logo of either kind.
export const hasBrandLogo=b=>!!(b?.logo||b?.logoText);
