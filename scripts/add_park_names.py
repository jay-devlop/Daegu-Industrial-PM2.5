"""Attach nearest industrial-park names using the same 2 km boundary rule."""
import json, math
from pathlib import Path

assets=Path(__file__).resolve().parents[1]/'dist/assets'
stations=json.loads((assets/'stations.json').read_text())
parks=json.loads((assets/'parks.json').read_text())['features']

def polygon_distance(poly,lon,lat):
    angle=math.radians(lat)
    e2=.0066943799901413165
    n=6378137/math.sqrt(1-e2*math.sin(angle)**2)
    m=6378137*(1-e2)/(1-e2*math.sin(angle)**2)**1.5
    best=math.inf
    includes=[]
    for ring in poly:
        points=[(math.radians(x-lon)*math.cos(angle)*n,math.radians(y-lat)*m) for x,y in ring]
        inside=False
        for (x,y),(u,v) in zip(points,points[1:]):
            dx,dy=u-x,v-y
            if (v>0)!=(y>0) and x-y*dx/dy>0:inside=not inside
            length=dx*dx+dy*dy
            t=min(1,max(0,-(x*dx+y*dy)/length)) if length else 0
            best=min(best,(x+t*dx)**2+(y+t*dy)**2)
        includes.append(inside)
    return 0 if includes[0] and not any(includes[1:]) else math.sqrt(best)

for station in stations:
    distances=[]
    for park in parks:
        g=park['geometry']
        polygons=[g['coordinates']] if g['type']=='Polygon' else g['coordinates']
        distance=min(polygon_distance(p,station['lon'],station['lat']) for p in polygons)
        distances.append((distance,park['properties']['DAN_NAME']))
    distance,name=min(distances)
    assert station['near']==(distance<=2000),(station['name'],distance)
    station['nearestPark']=name
    station['parkDistanceMeters']=round(distance)
    station['nearbyParks']=[name for distance,name in sorted(distances) if distance<=2000]
    print(station['name'],name,round(distance))
(assets/'stations.json').write_text(json.dumps(stations,ensure_ascii=False,separators=(',',':')))
