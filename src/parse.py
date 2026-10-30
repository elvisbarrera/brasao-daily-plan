import csv, io, re, json
import sys
src = open(sys.argv[1] if len(sys.argv)>1 else 'sheet_export.txt', encoding='utf-8').read()
secs = {}
for part in src.split('## Sheet name: ')[1:]:
    name, _, body = part.partition('\n')
    secs[name.strip()] = body
def key(k):
    return [v for n,v in secs.items() if k in n][0]
def rows(text):
    return list(csv.reader(io.StringIO(text)))
MON = {'Oct':10,'Nov':11}
def dnum(s):
    m = re.match(r'Oct (\d+)', s.strip()); return int(m.group(1)) if m else None

days = {d:{'feed':None,'stories':[],'email':None,'ads':[],'events':[]} for d in range(1,32)}

# content calendar
cal = {}
for r in rows(key('Content Calendar')):
    if r and re.match(r'Oct \d+$', r[0].strip()) and len(r)>=11:
        d = dnum(r[0])
        email=None
        if len(r)>=12 and r[11].strip():
            t=r[11]
            subj=re.search(r'SUBJECT:\s*(.*)',t); snd=re.search(r'SEND:\s*(.*)',t)
            body=re.search(r'BODY:\s*(.*?)(?:\n⚠|$)',t,re.S); warn=re.search(r'⚠\s*(.*)',t)
            email={'subject':subj.group(1).strip() if subj else '', 'send':snd.group(1).strip() if snd else '',
                   'body':body.group(1).strip() if body else '', 'warn':warn.group(1).strip() if warn else ''}
        cal[d]={'tier':r[2],'platform':r[3],'theme':r[4],'capSA':r[5],'capDFW':r[6],'visual':r[7],'tags':r[8],'time':r[9],'boost':r[10],'email':email}
        days[d]['email']=email
# posting guide
text = key('Daily Posting Guide')
cur=None
for r in rows(text):
    if not r: continue
    m = re.match(r'OCTOBER (\d+) ·', r[0])
    if m: cur=int(m.group(1)); continue
    if cur and r[0]!='TIME' and len(r)>=8 and re.match(r'\d+:\d+ [AP]M', r[0]):
        t,slot,fmt,topic,overlay,visual,plat,loc=r[:8]
        item={'time':t,'slot':slot,'format':fmt,'topic':topic,'overlay':overlay,'visual':visual,'platform':plat,'loc':loc}
        if slot=='FEED POST':
            c=cal[cur]; item.update({'capSA':c['capSA'],'capDFW':c['capDFW'],'tags':c['tags'],'boost':c['boost'],'visual':c['visual'] or visual,'theme':c['theme']})
            days[cur]['feed']=item
        else:
            days[cur]['stories'].append(item)
# key dates
def span(s):
    s=s.strip()
    m=re.match(r'Oct (\d+) → Nov (\d+)',s)
    if m: return int(m.group(1)),31
    m=re.match(r'Oct (\d+)-(\d+)',s)
    if m: return int(m.group(1)),int(m.group(2))
    m=re.match(r'Oct (\d+)$',s)
    if m: return int(m.group(1)),int(m.group(1))
    m=re.match(r'Nov',s); 
    return None
for r in rows(key('Key Dates')):
    if r and r[0].startswith(('Oct','Nov')) and len(r)>=7:
        sp=span(r[0])
        if not sp: continue
        ev={'date':r[0],'event':r[2],'market':r[3],'type':r[4],'why':r[5],'play':r[6],'start':sp[0],'end':sp[1]}
        for d in range(sp[0],sp[1]+1): days[d]['events'].append(ev)
# ads allocation
alloc={}
for r in rows(key('Ads Allocation')):
    if len(r)>=12 and r[1] in ('Instagram','TikTok','FB San Antonio','FB Plano','FB Irving','DFW Remarketing','Google Search','Google Performance Max'):
        alloc[r[0].strip()]={'platform':r[1],'type':r[2],'objective':r[3],'audience':r[4],'creative':r[5],'format':r[6],'duration':r[7],'flights':r[8],'perday':r[9],'total':r[10],'cta':r[11]}
# daily spend
camps=[]
for r in rows(key('Daily Ad Spend')):
    if len(r)>=7 and r[1] in ('Instagram','TikTok','FB San Antonio','FB Plano','FB Irving','DFW Remarketing','Google Search','Google Performance Max'):
        vals=r[6:6+31]; vals+= ['']*(31-len(vals))
        amt=[int(re.sub(r'[^\d]','',v) or 0) if v.strip() else 0 for v in vals]
        name=r[0].strip()
        camps.append({'name':name,'platform':r[1],'amt':amt,'total':r[5],'start':r[2],'end':r[3],'info':alloc.get(name)})
missing=[c['name'] for c in camps if not c['info']]
print('camps',len(camps),'missing alloc',missing)
for d in range(1,32):
    for c in camps:
        a=c['amt'][d-1]
        if a:
            prev=c['amt'][d-2] if d>1 else 0
            nxt=c['amt'][d] if d<31 else 0
            days[d]['ads'].append({'i':camps.index(c),'amt':a,'on':not prev,'off':not nxt})
# guardrails + moves + scorecard + thresholds
strat=rows(key('October Strategy'))
guard=[];moves=[];score=[];fixes=[]
mode=None
for r in strat:
    if not r or not r[0]: continue
    h=r[0]
    if h.startswith('B.'): mode='moves';continue
    if h.startswith('C.'): mode='guard';continue
    if h.startswith('D.'): mode='fix';continue
    if h.startswith('E.'): mode='score';continue
    if h in('MOVE','RULE','FIX','METRIC','OPPORTUNITY'): continue
    if mode=='moves' and len(r)>=2: moves.append([r[0],r[1]])
    if mode=='guard' and len(r)>=2: guard.append([r[0],r[1]])
    if mode=='fix' and len(r)>=2: fixes.append([r[0],r[1]])
    if mode=='score' and len(r)>=5: score.append(r[:5])
thr=[]
for r in rows(key('Spend Tracker')):
    if len(r)>=6 and r[0] and r[1] in ('CTR','Cost/Lead','3s View Rate','ROAS','Cost/Conversion') or (len(r)>=6 and r[1].startswith('Cost/Reservation')):
        thr.append(r[:6])
budget=[]
for r in rows(key('Spend Tracker')):
    pass
out={'days':days,'camps':camps,'guard':guard,'moves':moves,'fixes':fixes,'score':score,'thr':thr}
json.dump(out,open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'data.json'),'w'),ensure_ascii=False,separators=(',',':'))
print({d:(1 if days[d]['feed'] else 0,len(days[d]['stories']),len(days[d]['ads']),len(days[d]['events']), bool(days[d]['email'])) for d in (1,16,20,21,31)})
print(len(guard),len(moves),len(fixes),len(score),len(thr))
tot=[sum(c['amt'][d] for c in camps) for d in range(31)]
print(tot[:6], sum(tot))
