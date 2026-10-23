import json,urllib.parse,urllib.request,concurrent.futures
from pathlib import Path
root=Path(__file__).parent
ns={'__file__':str(root/'crawl.py')};exec((root/'crawl.py').read_text().split('xml=urllib')[0],ns);Parser=ns['Parser']
rows=json.loads((root/'pages.json').read_text())
def fetch(u):
 try:
  r=urllib.request.urlopen(u,timeout=15);p=Parser();p.feed(r.read().decode());return dict(url=u,final_url=r.url,status=r.status,title=p.title,headings=p.headings,text=''.join(p.parts),links=p.links,discovery='internal link')
 except Exception as e:return dict(url=u,error=str(e),discovery='internal link')
for batch in range(6):
 known={x['url'].rstrip('/') for x in rows};extra=set()
 for x in rows:
  for h in x.get('links',[]):
   p=urllib.parse.urlsplit(urllib.parse.urljoin(x['url'],h));u=urllib.parse.urlunsplit((p.scheme,p.netloc,p.path.rstrip('/'),'',''))
   if p.netloc=='numeo.ai' and u not in known and not any(p.path.startswith(z) for z in ['/api/','/partners/','/lab/','/get-spot','/tms-ext','/sms-inbox']):extra.add(u)
 if not extra:break
 print('Batch',batch+1,'new',len(extra),flush=True)
 with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
  for f in concurrent.futures.as_completed([ex.submit(fetch,u) for u in extra]):rows.append(f.result());(root/'pages.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
print('Total',len(rows),'errors',[(x['url'],x['error']) for x in rows if 'error' in x],flush=True)
