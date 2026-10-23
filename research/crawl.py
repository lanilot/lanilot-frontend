import urllib.request,urllib.parse,xml.etree.ElementTree as ET,concurrent.futures,json,re,time
from html.parser import HTMLParser
from pathlib import Path
root=Path(__file__).parent
class Parser(HTMLParser):
 def __init__(self): super().__init__(); self.skip=0; self.parts=[]; self.links=[]; self.headings=[]; self.heading=None; self.title=''; self.intitle=False
 def handle_starttag(self,t,a):
  d=dict(a)
  if t in ['script','style']:self.skip+=1
  if t=='a' and d.get('href'):self.links.append(d['href'])
  if t in ['h1','h2','h3']:self.heading=[t,'']
  if t=='title':self.intitle=True
  if t in ['p','div','section','li','h1','h2','h3','br']:self.parts.append('\n')
 def handle_endtag(self,t):
  if t in ['script','style']:self.skip=max(0,self.skip-1)
  if self.heading and t==self.heading[0]:self.headings.append(self.heading);self.heading=None
  if t=='title':self.intitle=False
 def handle_data(self,d):
  if not self.skip:
   self.parts.append(d)
   if self.heading:self.heading[1]+=d
   if self.intitle:self.title+=d
xml=urllib.request.urlopen('https://numeo.ai/sitemap.xml').read();(root/'sitemap.xml').write_bytes(xml)
urls=[x.text for x in ET.fromstring(xml).iter() if x.tag.endswith('loc')]
print('Sitemap URLs',len(urls),flush=True)
def fetch(u):
 try:
  r=urllib.request.urlopen(u,timeout=12); raw=r.read().decode();p=Parser();p.feed(raw)
  text=re.sub(r'[ \t]+',' ',''.join(p.parts));text=re.sub(r'\n\s*\n+','\n',text).strip()
  return dict(url=u,final_url=r.url,status=r.status,title=p.title,headings=p.headings,text=text,links=list(dict.fromkeys(p.links)))
 except Exception as e:return dict(url=u,error=str(e))
rows=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
 for i,f in enumerate(concurrent.futures.as_completed([ex.submit(fetch,u) for u in urls])):
  r=f.result()
  rows.append(r)
  (root/'pages.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
  if (i+1)%50==0: print('Fetched',i+1,flush=True)
(root/'pages.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
from collections import Counter
print('Groups',Counter(urllib.parse.urlparse(r['url']).path.strip('/').split('/')[0] for r in rows))
print('Errors',[r for r in rows if 'error' in r]);print('Saved',len(rows),flush=True)
