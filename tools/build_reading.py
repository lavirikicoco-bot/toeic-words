import json, random, sys, os, re, csv
here=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,here)
from reading_src1 import LEVEL1
LEVELS={1:LEVEL1}
SPEC={1:dict(words=(50,80),slen=12,rank=1000,wpm=80)}
words=json.load(open(os.path.join(here,'..','words.json')))
rank={}
for i,w in enumerate(words):
    if w['l']=='基礎': rank.setdefault(w['w'].lower(), len(rank))
IRR={'got':'get','went':'go','came':'come','sent':'send','left':'leave','took':'take','gave':'give','made':'make','said':'say','met':'meet','was':'be','were':'be','is':'be','are':'be','am':'be','been':'be','has':'have','had':'have','does':'do','did':'do','done':'do','children':'child','people':'person','men':'man','women':'woman','bought':'buy','told':'tell','found':'find','paid':'pay','his':'he','her':'she','its':'it','our':'we','us':'we','them':'they','their':'they','me':'i','my':'i','him':'he','your':'you'}
BASIC=set("""hi hello dear thanks ok okay one two three four five six seven eight nine ten eleven twelve twenty thirty hundred first second third fourth fifth
monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december
am pm meeting wash broken desk kitchen lunch bag shoe pizza sandwich meat copy busy website weekday window coffee water drink music tennis tea bus train ticket e-mail email photo
""".split())
def cands(w):
    out=[w]
    if w in IRR: out.append(IRR[w])
    for suf,rep in [('ies','y'),('es',''),('s',''),('ied','y'),('ed',''),('ed','e'),('ing',''),('ing','e'),("'s",'')]:
        if w.endswith(suf): out.append(w[:-len(suf)]+rep)
    for suf in ('ed','ing'):
        if w.endswith(suf):
            b=w[:-len(suf)]
            if len(b)>2 and b[-1]==b[-2]: out.append(b[:-1])
    return out
def lemma(w):
    w=w.lower().strip("'")
    cs=cands(w)
    for c in cs:
        if c in BASIC: return c
    best=min((rank[c],c) for c in cs if c in rank) if any(c in rank for c in cs) else None
    if best: return best[1]
    if w in IRR: return IRR[w]
    for suf,rep in [('ies','y'),('es',''),('s',''),('ied','y'),('ed',''),('ed','e'),('ing',''),('ing','e'),("'s",'')]:
        if w.endswith(suf) and (w[:-len(suf)]+rep) in rank: return w[:-len(suf)]+rep
    if len(w)>4 and w[-1]==w[-2] and w[:-1] in rank: return w[:-1]
    # doubled consonant + ed/ing
    for suf in ('ed','ing'):
        if w.endswith(suf):
            b=w[:-len(suf)]
            if len(b)>2 and b[-1]==b[-2] and b[:-1] in rank: return b[:-1]
    return w
def body(en):  # チャットの話者部分を除き、A.M./P.M. を1語にする
    en=re.sub(r'^[A-Z][a-z]+ [A-Z][a-z]+ \([0-9:]+ [AP]\.M\.\): ','',en)
    return en.replace('A.M.','AM').replace('P.M.','PM')
probs=[]; out=[]; report=[]
for lv,docs in LEVELS.items():
    sp=SPEC[lv]
    for d in docs:
        sents=d['sentences']; txt=' '.join(body(s[0]) for s in sents)
        toks=re.findall(r"[A-Za-z][A-Za-z'\-]*|\$?\d[\d:.,\-]*",txt)
        wc=len(toks)
        if not (sp['words'][0]<=wc<=sp['words'][1]): probs.append((d['id'],'words',wc))
        for k,s in enumerate(sents):
            n=len(re.findall(r"[A-Za-z][A-Za-z'\-]*|\$?\d[\d:.,\-]*",body(s[0])))
            if n>sp['slen']: probs.append((d['id'],'slen',k,n))
            if s[3] and s[2] is None: probs.append((d['id'],'slash missing',k))
        # vocab
        outv=set()
        for s in sents:
            if s[2] is None: continue  # あいさつ・署名・見出しは単語チェックしない
            ws=re.findall(r"[A-Za-z][A-Za-z'\-]*",body(s[0]))
            for j,w in enumerate(ws):
                if w[0].isupper() and j>0: continue  # 文中の大文字＝固有名詞
                if w in ('AM','PM','ID','e-mail','OK','Mr','Ms','Mrs','Dr'): continue
                if '-' in w: parts=w.split('-')
                else: parts=[w]
                for p in parts:
                    L=lemma(p)
                    if L in BASIC: continue
                    r=rank.get(L)
                    if r is None or r>=sp['rank']: outv.add(L)
        noted=set(d['notes'].keys())
        missing={w for w in outv if not (set(cands(w))&noted)}
        if len(outv)>3: probs.append((d['id'],'outvocab>3',sorted(outv)))
        if missing: probs.append((d['id'],'no note',sorted(missing)))
        report.append((d['id'],wc,sorted(outv)))
        qs=[]
        for k,q in enumerate(d['questions']):
            qid=f"{d['id']}-q{k+1}"
            if q['type']=='スキャニング':
                if q['c'] or not (0<=q['a']<len(sents)): probs.append((qid,'scan'))
                c=None; a=q['a']
            else:
                ch=q['c']
                if len(ch)!=4 or len(set(ch))!=4: probs.append((qid,'choices'))
                order=[0,1,2,3]; random.Random(qid).shuffle(order); c=[ch[i] for i in order]; a=order.index(0)
            if not q['e']: probs.append((qid,'expl'))
            if q['type'] in ('目的','詳細') and not q['ev']: probs.append((qid,'evidence'))
            if q['type'] in ('精読','スラッシュ','言い換え') and q['s'] is None: probs.append((qid,'s'))
            if q['type']=='精読' and sents[q['s']][3] not in ch: probs.append((qid,'verb mismatch',sents[q['s']][3],ch[0]))
            if q['type']=='精読' and ch[0]!=sents[q['s']][3]: probs.append((qid,'verb ans',ch[0],sents[q['s']][3]))
            qq=dict(id=qid,type=q['type'],q=q['q'],qj=q['qj'],c=c,a=a,ev=q['ev'],para=q['para'],e=q['e'])
            if q['s'] is not None: qq['s']=q['s']
            qs.append(qq)
        out.append(dict(id=d['id'],level=lv,kind=d['kind'],title=d['title'],words=wc,notes=d['notes'],
            sentences=[dict(en=s[0],ja=s[1],slash=s[2],verb=s[3],g=s[4]) for s in sents],questions=qs))
meta=dict(levels=[dict(level=1,label='レベル1',score='〜300点',wpm=80,words='50〜80語'),dict(level=2,label='レベル2',score='〜400点',wpm=100,words='80〜120語'),dict(level=3,label='レベル3',score='〜500点',wpm=110,words='120〜180語')])
json.dump(dict(meta=meta,docs=out),open(os.path.join(here,'..','reading.json'),'w'),ensure_ascii=False,separators=(',',':'))
for r in report: print(r)
print('PROBLEMS'); [print(p) for p in probs]
