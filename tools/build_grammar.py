import json, random, sys
sys.path.insert(0,__import__('os').path.dirname(__file__))
from grammar_src import BASIC, PART5
random.seed(20261112)
out=[]; total=0; probs=[]
for t in BASIC+PART5:
    qs=[]
    for k,(q,ch,e,tr) in enumerate(t.get('qs',[])):
        if '-------' not in q: probs.append(('noblank',t['id'],q))
        if len(set(ch))!=4: probs.append(('dup',t['id'],q))
        order=[0,1,2,3]; random.shuffle(order)
        qs.append(dict(id=f"{t['id']}-{k+1:02d}", q=q, c=[ch[i] for i in order], a=order.index(0), e=e, t=tr))
    total+=len(qs)
    out.append(dict(id=t['id'], cat='p5' if t['id'].startswith('p') else 'basic', group=t['group'], title=t['title'], n=t['n'], explain=t.get('explain',''), qs=qs))
json.dump(out, open(__import__('os').path.join(__import__('os').path.dirname(__file__),'..','grammar.json'),'w'), ensure_ascii=False, separators=(',',':'))
from collections import Counter
print(total, probs, Counter(q['a'] for x in out for q in x['qs']))
for x in out:
    if x['qs']: print(x['id'], x['title'], len(x['qs']), '/', x['n'])
print(sum(x['n'] for x in out if x['cat']=='basic'), sum(x['n'] for x in out if x['cat']=='p5'))
