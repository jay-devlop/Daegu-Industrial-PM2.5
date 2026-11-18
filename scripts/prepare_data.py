"""Build static, browser-readable records from the verified AirKorea extraction and ASOS join.
No network or random/demo measurements. Negative air values remain missing.
"""
from pathlib import Path
import csv, json, math, statistics, datetime, collections

ROOT=Path(__file__).resolve().parents[1]
STAGE=Path('/private/tmp/daegu-nearby.Pd69kW')
WORK=ROOT.parent/'산업단지 인접·비인접 분석'
OUT=ROOT/'dist/assets'
OUT.mkdir(parents=True,exist_ok=True)
meta=list(csv.DictReader((STAGE/'classes.csv').open(encoding='utf-8-sig')))
quality=list(csv.DictReader((WORK/'측정소별_연도별_자료확인.csv').open(encoding='utf-8-sig')))
has_data={r['측정소코드'] for r in quality if float(r['유효시간'])>0}
stations=[{'id':r['측정소코드'],'name':r['측정소명'],'lat':float(r['위도']),
           'lon':float(r['경도']),'address':r['주소'],'near':r['산업단지_2km_구분']=='인접'}
          for r in meta if r['측정소구분']=='도시대기' and r['측정소코드'] in has_data]
assert len(stations)==19 and sum(s['near'] for s in stations)==9
positions={s['id']:i for i,s in enumerate(stations)}
air={}
for r in csv.DictReader((STAGE/'selected_airkorea.csv').open()):
    if r['station_code'] not in positions:continue
    t=r['raw_time']
    d=datetime.datetime.strptime(t[:8],'%Y%m%d')+datetime.timedelta(hours=int(t[8:]))
    if not 2023<=d.year<=2025:continue
    key=d.strftime('%Y-%m-%d %H:00')
    if key not in air:air[key]=[None]*19
    try:v=float(r['raw_pm25']);v=v if math.isfinite(v) and v>=0 else None
    except (TypeError,ValueError):v=None
    if v is not None and v.is_integer():v=int(v)
    idx=positions[r['station_code']]
    assert air[key][idx] is None or air[key][idx]==v
    air[key][idx]=v
def number(v):
    try:
        x=float(v)
        return int(x) if x.is_integer() else x
    except (TypeError,ValueError):return None
years=collections.defaultdict(list)
for r in csv.DictReader((WORK/'인접_비인접_시간별_PM25_기상.csv').open(encoding='utf-8-sig')):
    if r['측정망']!='도시대기' or float(r['인접기준_km'])!=2:continue
    key=r['시각'][:16]; vals=air[key]
    for group,field in [(True,'인접_PM25'),(False,'비인접_PM25')]:
        valid=[v for v,s in zip(vals,stations) if s['near']==group and v is not None]
        assert len(valid)>=5 and statistics.median(valid)==float(r[field])
    years[key[:4]].append([key,number(r['인접_PM25']),number(r['비인접_PM25']),
                          number(r['풍속']),number(r['풍향']),number(r['기온']),
                          number(r['습도']),number(r['강수량']),number(r['전운량']),vals])
assert sum(map(len,years.values()))==26303
for y,records in years.items():
    records.sort(key=lambda r:r[0])
    (OUT/f'data-{y}.json').write_text(json.dumps(records,ensure_ascii=False,separators=(',',':'),allow_nan=False))
project=Path('/Users/yoonha/Desktop/프로젝트')
geo=json.loads(next(project.rglob('*24곳_한글.geojson')).read_text())
def rounded(obj):
    if isinstance(obj,list):return [rounded(x) for x in obj]
    if isinstance(obj,float):return round(obj,6)
    return obj
for feature in geo['features']:feature['geometry']['coordinates']=rounded(feature['geometry']['coordinates'])
(OUT/'parks.json').write_text(json.dumps(geo,ensure_ascii=False,separators=(',',':')))
(OUT/'stations.json').write_text(json.dumps(stations,ensure_ascii=False,separators=(',',':')))
print(json.dumps({'stations':len(stations),'adjacent':9,'nonadjacent':10,'hours':sum(map(len,years.values())),
                  'year_rows':{y:len(r) for y,r in years.items()}},ensure_ascii=False))
