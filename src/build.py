import os
here=os.path.dirname(os.path.abspath(__file__))
r=lambda n:open(os.path.join(here,n),encoding='utf-8').read()
safe=lambda s:s.replace('</','<\\/')
# Un bloque por mes. Octubre usa los archivos de siempre; noviembre los *_nov.json.
MONTHS={10:('data.json','actuals.json','budget.json'),11:('data_nov.json','actuals_nov.json','budget_nov.json')}
js='const MONTHS={'+','.join(f'{m}:{{data:{safe(r(d))},actuals:{safe(r(a))},budget:{safe(r(b))}}}' for m,(d,a,b) in MONTHS.items())+'};'
out=r('head.html')+r('body.html')+'<script>'+js+'</script>\n<script>\n'+r('app.js')+'\n</script>\n'
open(os.path.join(here,'..','index.html') if os.path.basename(here)=='src' else os.path.join(here,'plan-diario-brasao.html'),'w',encoding='utf-8').write(out)
print('built',len(out))
