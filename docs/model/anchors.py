import runpy, sys, numpy as np, json
sys.argv=['x','/tmp/model-out']; g=runpy.run_path('build_model.py')
faces, camera = g['faces'], g['camera']
r,u,w = camera(-40,28)
proj=lambda P: np.stack([P@r,P@u,P@w],-1)
allp=np.concatenate([proj(f) for f in faces]); mn,mx=allp[:,:2].min(0),allp[:,:2].max(0)
raster=2400; s=raster/(mx-mn)[0]; k=1200/raster; pad=24
def sv(p):
    q=proj(np.array(p,float)); return [round((q[0]-mn[0])*s*k+pad,1), round((mx[1]-q[1])*s*k+pad,1)]
rt=g['roof_top']; cpt=g['cp_top']
A={
 'pvRoof': sv((4.2, 0.5, rt(0.5)+0.05)),
 'solar': sv((12.4, 0.9, rt(0.9)+0.05)),
 'pvCarport': sv((-3.8, -7.2, cpt(-3.8)+0.05)),
 'heatpump': sv((-0.75, 7.55, 0.9)),
 'wallbox': sv((-5.63, -4.1, 1.15)),
 'battery': sv((-0.765, -11.27, 0.75)),
 'tank': sv((5.0, 4.0, 3.0)),
 'grid': sv((12.0, 0.0, 1.2)),
 'house': sv((6.0, -1.9, 2.0)),
}
print(json.dumps(A))
