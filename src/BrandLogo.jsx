import React from 'react';
import LogoMark from './LogoMark.jsx';

// A company's own logo always carries a small "powered by Lanilot" mark over its bottom-right corner,
// so white-labelled workspaces still show who built the product. It cannot be turned off.
export default function BrandLogo({src,alt,className}){
 return <span className="brand-logo-powered"><img className={className} src={src} alt={alt}/>
  <span className="powered-by" title="Powered by Lanilot"><span className="powered-by-text">powered by</span><LogoMark color="#2563eb"/><strong>Lanilot</strong></span></span>;
}
