import json,urllib.request,urllib.parse,concurrent.futures,runpy
from pathlib import Path
root=Path(__file__).parent
rows=json.loads((root/'pages.json').read_text());known={x['url'].rstrip('/') for x in rows};extra=set()
for x in rows:
 for h in x.get('links',[]):
  p=urllib.parse.urlsplit(urllib.parse.urljoin(x['url'],h));u=urllib.parse.urlunsplit((p.scheme,p.netloc,p.path.rstrip('/'),'',''))
  if p.netloc=='numeo.ai' and u not in known and not any(p.path.startswith(z) for z in ['/api/','/partners/','/lab/','/get-spot','/tms-ext','/sms-inbox']):extra.add(u)
# Reuse parser without running crawl.
ns={'__file__':str(root/'crawl.py')};exec((root/'crawl.py').read_text().split("xml=urllib")[0],ns);Parser=ns['Parser']
for u in sorted(extra):
 try:
  r=urllib.request.urlopen(u,timeout=15);p=Parser();p.feed(r.read().decode());rows.append(dict(url=u,final_url=r.url,status=r.status,title=p.title,headings=p.headings,text=''.join(p.parts),links=p.links,discovery='internal link'))
 except Exception as e: rows.append(dict(url=u,error=str(e),discovery='internal link'))
(root/'pages.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
from collections import Counter
counts=Counter(urllib.parse.urlsplit(x['url']).path.strip('/').split('/')[0] or 'home' for x in rows)
def purpose(u):
 p=urllib.parse.urlsplit(u).path
 if p.startswith('/blog/'):return 'Редакционный материал; шаблон статьи, связанные материалы и переход к продукту.'
 if p.startswith('/find-loads/'):return 'Географическая посадочная: обзор грузов города и переход к поиску.'
 if p.startswith('/lanes/'):return 'Посадочная маршрута: расстояние, рынок, сезонность, смежные направления.'
 if p.startswith('/trucking-companies/'):return 'Справочная страница штата; привлечение поискового трафика.'
 if p.startswith('/compare/'):return 'Сравнение альтернатив; таблица критериев и продуктовый CTA.'
 if p.startswith('/careers/'):return 'Вакансия; требования, обязанности и обращение кандидата.'
 if p.startswith('/solutions/'):return 'Посадочная сегмента; подходящие продукты и сценарий внедрения.'
 if p.startswith('/customers/'):return 'Клиентский кейс; компания, проблема, рабочий процесс и отзыв.'
 if '/integrations' in p:return 'Каталог или описание подключения; условия, настройка и ограничения.'
 if p.startswith('/docs/'):return 'Ссылка на инструкцию подключения; проверить доступность.'
 return 'Основная страница; назначение и требования разобраны в основном отчёте.'
lines=['# Реестр публичных страниц Numeo','',f'Дата: 22 октября 2026. В sitemap: 268 URL. Дополнительно обнаружено внутренних ссылок: {sum(1 for x in rows if x.get("discovery"))}.','', 'Все 268 URL sitemap получены с HTTP 200. Это проверка ответа и HTML, а не всех интерактивных состояний.','', '## Распределение','', '| Раздел | URL |','|---|---:|']
lines += [f'| {k} | {v} |' for k,v in sorted(counts.items())]
lines+=['','## Страницы','']
for x in sorted(rows,key=lambda x:x['url']):
 lines += [f"### {x.get('title') or x['url']}",'',f"Адрес: {x['url']}",'',f"Результат: {x.get('status',x.get('error'))}. {purpose(x['url'])}",'']
 hs=[h[1].strip().replace('\n',' ') for h in x.get('headings',[]) if h[0] in ['h1','h2'] and h[1].strip()!='We use cookies']
 if hs:lines+=['Структура: '+' → '.join(hs),'']
(root/'PAGE_INVENTORY.md').write_text('\n'.join(lines))
print('Total',len(rows),'extra',[(x['url'],x.get('status',x.get('error'))) for x in rows if x.get('discovery')])
