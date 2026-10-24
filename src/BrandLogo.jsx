import React from 'react';
import LogoMark from './LogoMark.jsx';

// "powered by" + the Lanilot mark and name. Shown under every company logo and in every page footer, so white-labelled
// workspaces still show who built the product. It cannot be turned off.
export function PoweredBy({link=true,className=''}){
 const body=<><span>powered by</span><LogoMark color="#2563eb"/><strong>Lanilot</strong></>;
 return link?<a className={'powered-badge '+className} href="https://lanilot.com" target="_blank" rel="noopener" aria-label="Powered by Lanilot">{body}</a>:<span className={'powered-badge '+className} title="Powered by Lanilot">{body}</span>;
}
// A company's own logo (picture, or its name written as a wordmark) with the mark right under it.
export default function BrandLogo({src,text,alt,className}){
 return <span className="brand-logo-powered">{src?<img className={className} src={src} alt={alt}/>:<span className="brand-logo-text" title={text}>{text}</span>}<PoweredBy link={false} className="powered-by"/></span>;
}
// Whether a brand has its own logo of either kind.
export const hasBrandLogo=b=>!!(b?.logo||b?.logoText);
