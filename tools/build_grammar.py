import json, random, sys, os, re
from collections import Counter
here=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,here)
from grammar_src import BASIC, PART5
from grammar_src2 import EXTRA_A
from grammar_src3 import EXTRA_B
from grammar_src4 import EXTRA_P5
EXTRA={**EXTRA_A,**EXTRA_B}
out=[]; probs=[]
for t in BASIC+PART5:
    src=list(t.get('qs',[])); explain=t.get('explain','')
    if t['id'] in EXTRA:
        explain=EXTRA[t['id']]['explain']; src=src+EXTRA[t['id']]['qs']
    if t['id'] in EXTRA_P5: src=src+EXTRA_P5[t['id']]
    qs=[]
    for k,(q,ch,e,tr) in enumerate(src):
        qid=f"{t['id']}-{k+1:02d}"
        if q.count('-------')!=1: probs.append(('blank',qid,q))
        if len(ch)!=4 or len(set(ch))!=4: probs.append(('choices',qid,ch))
        if not e or not tr: probs.append(('text',qid))
        order=[0,1,2,3]; random.Random(qid).shuffle(order)
        qs.append(dict(id=qid,q=q,c=[ch[i] for i in order],a=order.index(0),e=e,t=tr))
    if len(qs)!=t['n']: probs.append(('count',t['id'],len(qs),t['n']))
    if not explain: probs.append(('explain',t['id']))
    out.append(dict(id=t['id'],cat='p5' if t['id'].startswith('p') else 'basic',group=t['group'],title=t['title'],n=t['n'],explain=explain,qs=qs))
# 同じ問題文の重複チェック
dup=[q for q,c in Counter(q['q'] for x in out for q in x['qs']).items() if c>1]
json.dump(out,open(os.path.join(here,'..','grammar.json'),'w'),ensure_ascii=False,separators=(',',':'))
tot=sum(len(x['qs']) for x in out)
print('total',tot,'basic',sum(len(x['qs']) for x in out if x['cat']=='basic'),'p5',sum(len(x['qs']) for x in out if x['cat']=='p5'))
print('problems',probs); print('dup',dup)
print('answer pos',Counter(q['a'] for x in out for q in x['qs']))
