'use strict';
// ===== 長文（レベル別） =====
// app.js の後に読み込む。S / save / srsUpdate / dayNum / dayLabel / show / esc / shuffle / WORDS / GRAMMAR を使う。
let READ = { meta: { levels: [] }, docs: [] };
const RDOC = {};      // 文書ID → 文書
const RQ = {};        // 設問ID → { q, doc }
let WIDX = null;      // 英単語（小文字）→ WORDS の番号
const POWERS = ['精読', 'スラッシュ', '言い換え', 'スキャニング'];
const MAX_WPM = 400; // これより速いときは「最後まで読んでいない」とみなし、昇格の判定に使わない

function initReading(data) {
  READ = data;
  for (const d of READ.docs) { RDOC[d.id] = d; for (const q of d.questions) RQ[q.id] = { q, doc: d }; }
  S.rcards = S.rcards || {}; S.rlog = S.rlog || {}; S.rhist = S.rhist || []; S.wprio = S.wprio || [];
  S.rlevel = S.rlevel || 1;
}
const levelMeta = lv => READ.meta.levels.find(x => x.level === lv);
const levelDocs = lv => READ.docs.filter(d => d.level === lv);

// ---- 単語の検索（活用形を元の形に戻して探す）----
const IRR = { got: 'get', went: 'go', came: 'come', sent: 'send', left: 'leave', took: 'take', gave: 'give', made: 'make', said: 'say', met: 'meet', was: 'be', were: 'be', is: 'be', are: 'be', am: 'be', been: 'be', has: 'have', had: 'have', does: 'do', did: 'do', bought: 'buy', told: 'tell', found: 'find', paid: 'pay', broken: 'break', children: 'child', people: 'person' };
function wordCands(w) {
  const out = [w];
  if (IRR[w]) out.push(IRR[w]);
  for (const [suf, rep] of [['ies', 'y'], ['es', ''], ['s', ''], ['ied', 'y'], ['ed', ''], ['ed', 'e'], ['ing', ''], ['ing', 'e']]) {
    if (w.endsWith(suf) && w.length > suf.length + 1) out.push(w.slice(0, -suf.length) + rep);
  }
  for (const suf of ['ed', 'ing']) {
    if (w.endsWith(suf)) { const b = w.slice(0, -suf.length); if (b.length > 2 && b.at(-1) === b.at(-2)) out.push(b.slice(0, -1)); }
  }
  return out;
}
function findWord(raw) {
  if (!WIDX) { WIDX = new Map(); WORDS.forEach((w, i) => { const k = w.w.toLowerCase(); if (!WIDX.has(k)) WIDX.set(k, i); }); }
  const w = raw.toLowerCase().replace(/[^a-z'\-]/g, '').replace(/'s$/, '');
  for (const c of wordCands(w)) if (WIDX.has(c)) return WIDX.get(c);
  return -1;
}

// ---- 計算 ----
function rDueDocs(t = dayNum()) {
  const set = new Set();
  for (const k in S.rcards) { const c = S.rcards[k]; if (!c.m && c.due <= t && RQ[k]) set.add(RQ[k].doc.id); }
  for (const id in S.rlog) { const l = S.rlog[id]; if (l.speedDue && l.speedDue <= t && RDOC[id]) set.add(id); }
  return [...set];
}
function rDueQuestions(doc, t = dayNum()) {
  return doc.questions.filter(q => { const c = S.rcards[q.id]; return c && !c.m && c.due <= t; }).map(q => q.id);
}
function powerStats() {
  const st = {}; for (const p of POWERS) st[p] = [0, 0];
  for (const h of S.rhist) for (const [p, v] of Object.entries(h.pw || {})) { if (st[p]) { st[p][0] += v[0]; st[p][1] += v[1]; } }
  return st;
}
function recommendDoc() {
  const due = rDueDocs(); if (due.length) return { id: due[0], review: true };
  const st = powerStats();
  const weak = POWERS.filter(p => st[p][0] > 0).sort((a, b) => st[a][1] / st[a][0] - st[b][1] / st[b][0])[0];
  for (let lv = S.rlevel; lv >= 1; lv--) {
    const unread = levelDocs(lv).filter(d => !S.rlog[d.id]);
    if (!unread.length) continue;
    const pick = weak && unread.find(d => d.questions.some(q => q.type === weak));
    return { id: (pick || unread[0]).id, review: false };
  }
  return null;
}
// 昇格：そのレベルの直近2文書（復習以外）が、1回目で全問正解＋目標の速さ
function checkPromotion(lv) {
  if (lv !== S.rlevel) return false;
  const meta = levelMeta(lv), next = levelMeta(lv + 1);
  if (!meta || !next) return false;
  const last = S.rhist.filter(h => h.level === lv && !h.review).slice(-2);
  if (last.length < 2 || !last.every(h => h.all && h.wpm >= meta.wpm && h.wpm <= MAX_WPM)) return false;
  S.rlevel = lv + 1; save();
  return true;
}

// ---- 一覧 ----
function renderReading() {
  const t = dayNum();
  const due = rDueDocs(t);
  $('rDue').textContent = due.length;
  $('rReviewBtn').disabled = due.length === 0;
  const rec = recommendDoc();
  $('rRecBtn').disabled = !rec;
  $('rRecBtn').textContent = rec ? `おすすめ：${RDOC[rec.id].title}${rec.review ? '（復習）' : ''}` : 'おすすめの文書はありません';
  const st = powerStats();
  $('rPowers').innerHTML = POWERS.map(p => {
    const [n, ok] = st[p];
    return `<div class="pw"><span>${p}</span><b>${n ? Math.round(ok / n * 100) + '%' : '-'}</b></div>`;
  }).join('');
  let html = '';
  for (const meta of READ.meta.levels) {
    const docs = levelDocs(meta.level);
    const open = meta.level <= S.rlevel;
    const read = docs.filter(d => S.rlog[d.id]).length;
    const hist = S.rhist.filter(h => h.level === meta.level && !h.review);
    const speeds = hist.map(h => h.wpm);
    let status;
    if (!docs.length) status = '文書は準備中です';
    else if (!open) status = '前のレベルで「全問正解＋目標の速さ」を2文書続けて達成すると開きます';
    else status = `読んだ文書 ${read} / ${docs.length}` + (speeds.length ? `・最近の速さ 1分${speeds.at(-1)}語` : '');
    html += `<div class="card rlevel${open ? '' : ' locked'}"><div class="rl-head"><h2>${meta.label}<small>${meta.score}・${meta.words}・目標 1分${meta.wpm}語</small></h2></div><p class="note">${status}</p>`;
    if (open && meta.level === S.rlevel && levelMeta(meta.level + 1)) {
      const last = hist.slice(-2).map(h => (h.all && h.wpm >= meta.wpm) ? '○' : '×').join(' ');
      html += `<p class="note">昇格の条件：1回目で全問正解＋1分${meta.wpm}語以上を2文書続けて。直近：${last || 'まだありません'}</p>`;
    }
    if (speeds.length >= 2) html += sparkline(speeds.slice(-12), meta.wpm);
    if (!open && docs.length) html += `<button class="ghost wide" data-unlock="${meta.level}">このレベルを開ける</button>`;
    if (open) {
      for (const d of docs) {
        const l = S.rlog[d.id];
        const sub = l ? `1回目 ${l.ok}/${l.total}問・1分${l.wpm}語` : '未読';
        html += `<button class="gitem" data-rdoc="${d.id}"><div><div class="gt">${esc(d.title)}</div><div class="gm">${d.kind}・${d.words}語・${sub}</div></div><span class="arrow">›</span></button>`;
      }
    }
    html += '</div>';
  }
  $('rLevels').innerHTML = html;
  $('rLevels').querySelectorAll('[data-rdoc]').forEach(b => b.addEventListener('click', () => startDoc(b.dataset.rdoc, false)));
  $('rLevels').querySelectorAll('[data-unlock]').forEach(b => b.addEventListener('click', () => {
    const lv = +b.dataset.unlock;
    if (confirm(`レベル${lv}を開けますか？（条件を満たす前に先へ進みます）`)) { S.rlevel = Math.max(S.rlevel, lv); save(); renderReading(); }
  }));
}
function sparkline(vals, target) {
  const w = 300, h = 60, max = Math.max(target, ...vals) * 1.15, n = vals.length;
  const X = i => 10 + i * (w - 20) / Math.max(1, n - 1), Y = v => h - 8 - v / max * (h - 16);
  const pts = vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="読む速さの推移"><line x1="10" x2="${w - 10}" y1="${Y(target)}" y2="${Y(target)}" stroke="var(--ok)" stroke-dasharray="4 4"/><polyline points="${pts}" fill="none" stroke="var(--main2)" stroke-width="2"/>${vals.map((v, i) => `<circle cx="${X(i)}" cy="${Y(v)}" r="3" fill="var(--main2)"/>`).join('')}<text x="${w - 10}" y="${Y(target) - 4}" text-anchor="end" font-size="10" fill="var(--ok)">目標${target}</text></svg>`;
}

// ---- 練習 ----
let R = null; // 実行中の練習
function startDoc(id, review) {
  const doc = RDOC[id], t = dayNum();
  const qids = review ? rDueQuestions(doc, t) : doc.questions.map(q => q.id);
  R = { doc, review, t, phase: 'intro', ms1: 0, ms2: 0, queue: qids.map(qid => ({ qid, first: true })), cur: null,
    ok: 0, total: qids.length, done: 0, pw: {}, typ: {}, firstOK: {} };
  show('rdoc');
  renderPhase();
}
function renderPassage(mode) {
  const d = R.doc;
  const chat = d.kind === 'チャット';
  const html = d.sentences.map((s, i) => {
    let words;
    if (mode === 'review') {
      words = esc(s.en).replace(/[A-Za-z][A-Za-z'\-]*/g, m => `<span class="w" data-w="${m}">${m}</span>`);
      if (s.verb) {
        // 文の動詞に色を付ける（最初に一致した位置）
        const parts = s.verb.split(' ');
        const re = new RegExp(parts.map(p => `<span class="w" data-w="${p}">${p}</span>`).join(' '));
        words = words.replace(re, m => `<span class="verb">${m}</span>`);
      }
    } else words = esc(s.en);
    const btn = mode === 'review' && s.slash ? `<button class="sbtn" data-s="${i}">訳・構造</button>` : '';
    return `<div class="sent${chat ? ' chat' : ''}${s.slash ? '' : ' plain'}" data-i="${i}">${words}${btn}<div class="sinfo hidden" id="sinfo-${i}"></div></div>`;
  }).join('');
  const notes = Object.entries(d.notes || {});
  $('rPassage').innerHTML = `<div class="rkind">${d.kind}・${esc(d.title)}</div>${html}` +
    (notes.length ? `<div class="rnotes">注：${notes.map(([k, v]) => `<b>${esc(k)}</b> ${esc(v)}`).join('　')}</div>` : '');
}
function setPhaseLabel(txt) { $('rPhase').textContent = txt; }
function renderPhase() {
  const p = R.phase, d = R.doc, meta = levelMeta(d.level);
  for (const id of ['rIntro', 'rPassage', 'rReadDone', 'rQCard', 'rReview', 'rDone']) $(id).classList.add('hidden');
  $('rPassage').classList.remove('qmode');
  if (p === 'intro' || p === 'intro2') {
    setPhaseLabel(p === 'intro' ? (R.review ? '復習：もう一度読む' : '1. 時間を計って読む') : '5. もう一度読む');
    $('rIntroTitle').textContent = d.title;
    $('rIntroMeta').textContent = `${d.kind}・${d.words}語・目標 1分${meta.wpm}語（約${Math.round(d.words / meta.wpm * 60)}秒）`;
    $('rIntroNote').textContent = p === 'intro'
      ? '「読みはじめる」を押すと文章が出て、時間を計りはじめます。読み終わったら「読めた」を押してください。設問は読んだあとに出ます（設問の間も文章は見られます）。'
      : '音読してから、もう一度時間を計って読みます。1回目より速く読めたかを確かめましょう。';
    $('rIntroBtn').textContent = p === 'intro' ? '読みはじめる' : 'もう一度読みはじめる';
    $('rIntro').classList.remove('hidden');
    $('rSkip2').classList.toggle('hidden', p !== 'intro2');
  } else if (p === 'read' || p === 'read2') {
    renderPassage('read');
    $('rPassage').classList.remove('hidden');
    $('rReadDone').classList.remove('hidden');
    R.t0 = performance.now();
  } else if (p === 'q') {
    renderPassage('q');
    $('rPassage').classList.add('qmode');
    $('rPassage').classList.remove('hidden');
    nextRQ();
  } else if (p === 'review') {
    setPhaseLabel('4. 読み直し');
    renderPassage('review');
    markEvidence(d.questions.flatMap(q => q.ev));
    $('rPassage').classList.remove('hidden');
    const paras = d.questions.flatMap(q => q.para || []);
    $('rParaList').innerHTML = paras.length ? paras.map(([a, b]) => `<li><b>${esc(a)}</b> → ${esc(b)}</li>`).join('') : '<li>この文書には言い換えの対応はありません。</li>';
    $('rReview').classList.remove('hidden');
    bindReviewTaps();
  } else if (p === 'done') {
    finishDoc();
  }
  window.scrollTo(0, 0);
}
$('rIntroBtn').addEventListener('click', () => { R.phase = R.phase === 'intro' ? 'read' : 'read2'; setPhaseLabel(R.phase === 'read' ? '読んでいます…' : 'もう一度読んでいます…'); renderPhase(); });
$('rSkip2').addEventListener('click', () => { R.phase = 'done'; renderPhase(); });
$('rReadDoneBtn').addEventListener('click', () => {
  const ms = performance.now() - R.t0;
  if (R.phase === 'read') { R.ms1 = ms; R.phase = R.queue.length ? 'q' : 'done'; }
  else { R.ms2 = ms; R.phase = 'done'; }
  renderPhase();
});
const wpmOf = ms => Math.round(R.doc.words / (ms / 60000));

function markEvidence(ids) {
  document.querySelectorAll('#rPassage .sent').forEach(el => el.classList.toggle('ev', ids.includes(+el.dataset.i)));
}
function nextRQ() {
  R.cur = R.queue.shift();
  $('rQCard').classList.add('hidden');
  markEvidence([]);
  document.querySelectorAll('#rPassage .sent').forEach(el => { el.classList.remove('pick', 'target'); el.onclick = null; });
  if (!R.cur) { R.phase = R.review ? 'done' : 'review'; return renderPhase(); }
  const { q } = RQ[R.cur.qid];
  setPhaseLabel(`2. 設問に答える（${R.done} / ${R.total}）`);
  const tag = $('rQTag');
  tag.textContent = (POWERS.includes(q.type) ? `力の練習・${q.type}` : q.type) + (R.cur.first ? '' : '・もう一度');
  tag.classList.toggle('new', POWERS.includes(q.type));
  $('rQText').textContent = q.q;
  if (q.s !== undefined) document.querySelector(`#rPassage .sent[data-i="${q.s}"]`).classList.add('target');
  $('rFeedback').classList.add('hidden');
  $('rChoices').innerHTML = '';
  if (q.type === 'スキャニング') {
    $('rChoiceWrap').classList.add('hidden');
    $('rScanHint').classList.remove('hidden');
    R.scanT0 = performance.now();
    document.querySelectorAll('#rPassage .sent').forEach(el => { el.onclick = () => answerR(+el.dataset.i, el); });
  } else {
    $('rChoiceWrap').classList.remove('hidden');
    $('rScanHint').classList.add('hidden');
    q.c.forEach((txt, k) => {
      const b = document.createElement('button');
      b.className = 'choice en';
      b.textContent = `(${'ABCD'[k]}) ${txt}`;
      b.dataset.k = k;
      b.addEventListener('click', () => answerR(k, b));
      $('rChoices').appendChild(b);
    });
    setRSheet(S.settings.redSheet);
  }
  $('rQCard').classList.remove('hidden');
}
function setRSheet(on) {
  $('rChoiceWrap').classList.toggle('sheet-on', !!on);
  $('rRedsheet').classList.toggle('lifted', !on);
}
$('rRedsheet').addEventListener('click', () => setRSheet(false));
function answerR(k, el) {
  if (!$('rFeedback').classList.contains('hidden')) return; // 回答済み
  const { q } = RQ[R.cur.qid];
  const correct = k === q.a;
  const t = R.t;
  if (q.type === 'スキャニング') {
    document.querySelectorAll('#rPassage .sent').forEach(s => { s.onclick = null; });
    el.classList.add('pick');
  } else {
    document.querySelectorAll('#rChoices .choice').forEach(b => { b.disabled = true; if (+b.dataset.k === q.a) b.classList.add('ok'); });
    if (!correct) el.classList.add('ng');
  }
  markEvidence(q.ev);
  if (R.cur.first) {
    const key = POWERS.includes(q.type) ? 'pw' : 'typ';
    const bucket = R[key][q.type] || (R[key][q.type] = [0, 0]);
    bucket[0]++; if (correct) { bucket[1]++; R.ok++; }
    R.firstOK[q.id] = correct;
  }
  if (!correct) R.cur.misses = (R.cur.misses || 0) + 1;
  const practice = !R.review && S.rcards[q.id] && !(S.rcards[q.id].due <= t);
  const c = srsUpdate(S.rcards, q.id, correct, t, R.cur.misses || 0, !!practice);
  let next;
  if (correct) {
    R.done++;
    next = c.m ? 'この設問は完全に覚えました。' : `次の復習：${dayLabel(c.due)}（${c.due - t}日後）`;
  } else {
    R.queue.push({ qid: R.cur.qid, first: false, misses: R.cur.misses });
    next = '正解するまで「正解済み」にはしません。このあともう一度出題します。';
  }
  save();
  let title = correct ? '正解' : '不正解';
  if (!correct) title += q.type === 'スキャニング' ? '　色が付いた文が答えです' : `　正解は (${'ABCD'[q.a]}) ${q.c[q.a]}`;
  if (correct && q.type === 'スキャニング') title += `（${((performance.now() - R.scanT0) / 1000).toFixed(1)}秒）`;
  $('rFbTitle').textContent = title;
  $('rFbTitle').className = 'fb-title ' + (correct ? 'ok' : 'ng');
  const para = (q.para || []).map(([a, b]) => `<div class="para"><span>本文</span><b>${esc(a)}</b> → <span>選択肢</span><b>${esc(b)}</b></div>`).join('');
  $('rFbDetail').innerHTML = (q.qj ? `<div class="fb-ja">設問の訳：${esc(q.qj)}</div>` : '') + para + `<div class="fb-ex">${esc(q.e)}</div>`;
  $('rFbNext').textContent = next;
  $('rFeedback').classList.remove('hidden');
  $('rFeedback').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
$('rNextBtn').addEventListener('click', nextRQ);

// 読み直し：1文ずつ訳・スラッシュ・文の動詞、単語をタップして単語アプリへ
function bindReviewTaps() {
  document.querySelectorAll('#rPassage .sbtn').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    const i = +b.dataset.s, s = R.doc.sentences[i], box = $(`sinfo-${i}`);
    if (!box.classList.contains('hidden')) { box.classList.add('hidden'); return; }
    const tp = s.g && GRAMMAR.find(x => x.id === s.g);
    box.innerHTML = `<div class="si-ja">${esc(s.ja)}</div><div class="si-slash">${esc(s.slash).replace(/ \/ /g, ' <span class="sl">/</span> ')}</div>` +
      (s.verb ? `<div class="si-verb">文の動詞：<b>${esc(s.verb)}</b></div>` : '') +
      (tp ? `<button class="ghost si-g" data-g="${tp.id}">文法：${esc(tp.title)} を見る</button>` : '');
    const gb = box.querySelector('.si-g');
    if (gb) gb.addEventListener('click', () => { if (confirm('文法の解説を開きます。この長文の練習は終了しますが、記録は保存されています。')) { R = null; openTopic(gb.dataset.g); } });
    box.classList.remove('hidden');
  }));
  document.querySelectorAll('#rPassage .w').forEach(w => w.addEventListener('click', e => { e.stopPropagation(); wordPopup(w.dataset.w); }));
}
function wordPopup(raw) {
  const i = findWord(raw);
  const pop = $('rWordPop');
  let html;
  if (i >= 0) {
    const w = WORDS[i];
    const st = S.cards[i] ? (S.cards[i].m ? '完全に覚えた単語です' : '単語アプリで学習中です') : (S.wprio.includes(i) ? '単語アプリに追加済みです' : '');
    html = `<div class="wp-w">${esc(w.w)}</div><div class="wp-m">${esc(w.d)}</div>` +
      (st ? `<p class="note">${st}</p>` : `<button class="primary wide" id="wpAdd">単語アプリに追加</button><p class="note">次に単語の学習をするとき、新しい単語の最初に出ます。</p>`);
  } else {
    const k = Object.keys(R.doc.notes || {}).find(n => wordCands(raw.toLowerCase()).includes(n));
    html = `<div class="wp-w">${esc(raw)}</div>` + (k ? `<div class="wp-m">${esc(R.doc.notes[k])}</div>` : '') +
      '<p class="note">この語は単語アプリの単語リスト（約4000語）にないため、追加できません。</p>';
  }
  pop.innerHTML = html + '<button class="ghost wide" id="wpClose">閉じる</button>';
  pop.classList.remove('hidden');
  $('wpClose').addEventListener('click', () => pop.classList.add('hidden'));
  const add = $('wpAdd');
  if (add) add.addEventListener('click', () => {
    if (!S.wprio.includes(i)) S.wprio.push(i);
    save();
    pop.innerHTML = `<div class="wp-w">${esc(WORDS[i].w)}</div><p class="note">単語アプリに追加しました。</p><button class="ghost wide" id="wpClose">閉じる</button>`;
    $('wpClose').addEventListener('click', () => pop.classList.add('hidden'));
  });
}
$('rToReread').addEventListener('click', () => { $('rWordPop').classList.add('hidden'); R.phase = 'intro2'; renderPhase(); });

function finishDoc() {
  const d = R.doc, meta = levelMeta(d.level), t = R.t;
  setPhaseLabel('結果');
  const w1 = R.ms1 ? wpmOf(R.ms1) : 0, w2 = R.ms2 ? wpmOf(R.ms2) : 0;
  const all = R.total > 0 && R.ok === R.total;
  // 記録
  const pw = {};
  for (const [k, v] of Object.entries(R.pw)) pw[k] = v;
  S.rhist.push({ doc: d.id, level: d.level, t, wpm: w1, wpm2: w2, ok: R.ok, total: R.total, all: all || (R.review && R.total === 0), review: R.review, pw, typ: R.typ });
  const log = S.rlog[d.id] || {};
  if (!R.review) {
    if (!S.rlog[d.id]) Object.assign(log, { ok: R.ok, total: R.total, wpm: w1, first: t });
    log.last = t; log.lastWpm = w1;
    if (all && !log.speedSet) { log.speedDue = t + 14; log.speedSet = true; }
  } else {
    log.last = t; log.lastWpm = w1;
    if (log.speedDue && log.speedDue <= t) delete log.speedDue;
  }
  S.rlog[d.id] = log;
  const tl = todayLog(t); tl.rdocs = (tl.rdocs || 0) + 1; tl.gtot = tl.gtot || 0; tl.tot = tl.tot || 0;
  save();
  const promoted = !R.review && checkPromotion(d.level);
  let rows = `<p class="row"><span>1回目で正解した設問</span><b>${R.total ? `${R.ok} / ${R.total}` : '設問なし'}</b></p>`;
  rows += `<p class="row"><span>読む速さ（1回目）</span><b>1分${w1}語</b></p>`;
  if (w2) rows += `<p class="row"><span>読む速さ（2回目）</span><b>1分${w2}語（${w2 >= w1 ? '+' : ''}${w2 - w1}）</b></p>`;
  rows += `<p class="row"><span>目標の速さ</span><b>1分${meta.wpm}語 ${w1 > MAX_WPM ? '判定なし' : w1 >= meta.wpm ? '達成' : 'まだ'}</b></p>`;
  if (w1 > MAX_WPM) rows += `<p class="note">1分${MAX_WPM}語より速いため、最後まで読んでいないとみなし、昇格の判定には使いません。</p>`;
  let msg = '';
  if (promoted) {
    const nx = levelMeta(d.level + 1);
    msg = `<div class="promo">レベル${nx.level}に上がりました！${levelDocs(nx.level).length ? '' : '（レベル' + nx.level + 'の文書は準備中です）'}</div>`;
  } else if (!R.review && d.level === S.rlevel && levelMeta(d.level + 1)) {
    msg = `<p class="note">${all && w1 >= meta.wpm && w1 <= MAX_WPM ? '昇格の条件を1文書達成しました。もう1文書続けて達成するとレベルが上がります。' : '昇格には、1回目で全問正解＋目標の速さを2文書続けて達成することが必要です。'}</p>`;
  }
  $('rDoneBody').innerHTML = rows + msg;
  $('rDone').classList.remove('hidden');
}
$('rDoneBack').addEventListener('click', () => { R = null; show('reading'); });
$('rQuit').addEventListener('click', () => { if (confirm('中断しますか？答えた設問の記録は保存されています。')) { R = null; $('rWordPop').classList.add('hidden'); show('reading'); } });
$('rReviewBtn').addEventListener('click', () => { const d = rDueDocs(); if (d.length) startDoc(d[0], true); });
$('rRecBtn').addEventListener('click', () => { const r = recommendDoc(); if (r) startDoc(r.id, r.review); });
$('homeReadBtn').addEventListener('click', () => { const r = recommendDoc(); if (r) startDoc(r.id, r.review); else show('reading'); });
function renderHomeReading() {
  const due = rDueDocs().length, rec = recommendDoc();
  $('homeRDue').textContent = due;
  $('homeReadBtn').textContent = rec ? `おすすめ：${RDOC[rec.id].title}${rec.review ? '（復習）' : ''}` : '長文へ';
}
