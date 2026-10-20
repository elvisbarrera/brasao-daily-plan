import os
here=os.path.dirname(os.path.abspath(__file__))
r=lambda n:open(os.path.join(here,n),encoding='utf-8').read()
safe=lambda s:s.replace('</','<\\/')
out=r('head.html')+r('body.html')+'<script>const DATA='+safe(r('data.json'))+';const ACTUALS='+safe(r('actuals.json'))+';const BUDGET='+safe(r('budget.json'))+';</script>\n<script>\n'+r('app.js')+'\n</script>\n'
open(os.path.join(here,'..','index.html') if os.path.basename(here)=='src' else os.path.join(here,'plan-diario-brasao.html'),'w',encoding='utf-8').write(out)
print('built',len(out))
