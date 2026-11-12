'use strict';
// ===== 定数 =====
const INTERVALS = [1, 3, 7, 14, 30];   // 覚えた日からの日数
const KEY = 'toeic-srs-v1';
const PAGE = 100;
const VERSION = 7; // 更新したら index.html の ?v= と合わせて上げる

// ===== 日付 =====
function dayNum(date = new Date()) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 864e5);
}
function dayLabel(n, withWeek = true) {
  const d = new Date(n * 864e5);
  const w = '日月火水木金土'[d.getUTCDay()];
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}` + (withWeek ? `(${w})` : '');
}

// ===== 保存 =====
function defaultState() {
  return { v: 1, settings: { dailyNew: 20, startFrom: '基礎', autoThrottle: true, redSheet: true }, cards: {}, log: {}, gcards: {}, gstat: {} };
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    const d = defaultState();
    return { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) }, cards: s.cards || {}, log: s.log || {}, gcards: s.gcards || {}, gstat: s.gstat || {} };
  } catch (e) { return defaultState(); }
}
let saveFailed = false;
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); saveFailed = false; }
  catch (e) {
    if (!saveFailed) alert('記録を保存できませんでした。ブラウザのプライベートモードでは保存できないことがあります。');
    saveFailed = true;
  }
}

let S = load();
let WORDS = [];
let GRAMMAR = [];          // 文法の項目（grammar.json）
const GQ = {};             // 問題ID → { q, topic }

// ===== 計算 =====
function todayLog(t = dayNum()) {
  const l = S.log[t] || (S.log[t] = { n: 0, r: 0, ok1: 0, tot: 0 });
  if (l.gtot === undefined) { l.gn = 0; l.gr = 0; l.gok1 = 0; l.gtot = 0; }
  return l;
}
function dueList(t = dayNum()) {
  const out = [];
  for (const k in S.cards) {
    const c = S.cards[k];
    if (!c.m && c.due <= t) out.push(+k);
  }
  out.sort((a, b) => S.cards[a].due - S.cards[b].due || a - b);
  return out;
}
function orderedIndices() {
  const first = S.settings.startFrom;
  const a = [], b = [];
  WORDS.forEach((w, i) => (w.l === first ? a : b).push(i));
  return a.concat(b);
}
function newQuota(dueCount, t = dayNum()) {
  const n = S.settings.dailyNew;
  const left = Math.max(0, n - todayLog(t).n);
  if (S.settings.autoThrottle && todayLog(t).n === 0 && dueCount > n * 6) return 0;
  return left;
}
function nextNewWords(k) {
  const out = [];
  if (k <= 0) return out;
  // 長文から追加した単語を先に出す
  for (const i of (S.wprio || [])) {
    if (!(i in S.cards) && !out.includes(i)) { out.push(i); if (out.length >= k) return out; }
  }
  for (const i of orderedIndices()) {
    if (out.includes(i)) continue;
    if (!(i in S.cards)) { out.push(i); if (out.length >= k) break; }
  }
  return out;
}
function currentStage() {
  const order = orderedIndices();
  const next = order.find(i => !(i in S.cards));
  return next === undefined ? 'すべて学習済み' : (WORDS[next].l === '基礎' ? '基礎（NGSL）' : 'TOEIC頻出（TSL）');
}
function streak() {
  let t = dayNum();
  const active = d => S.log[d] && (S.log[d].tot > 0 || S.log[d].gtot > 0 || S.log[d].rdocs > 0);
  if (!active(t)) t -= 1;
  let n = 0;
  while (active(t)) { n++; t--; }
  return n;
}

// 正解・不正解のときの予定更新（単語・文法で共通）
// 新しいもの・復習とも、正解するまでは「学習済み」にしない（次の予定も決めない）
// practice=true は「項目を解く」「ミックス」で、復習日前の問題を解いたとき：正解なら予定は変えない
function srsUpdate(store, key, correct, t, misses = 0, practice = false) {
  let c = store[key];
  if (!c) { // 新しいもの：正解したときに初めて登録
    if (!correct) return null;
    return (store[key] = { s: 0, b: t, due: t + INTERVALS[0], lapses: misses });
  }
  if (c.p) { // 今日まちがえて、まだ正解していない
    if (correct) { c.due = t + INTERVALS[0]; delete c.p; }
    return c;
  }
  const notDue = c.m || c.due > t;
  if (correct) {
    if (practice && notDue) return c;
    c.s += 1;
    if (c.s >= INTERVALS.length) { c.m = true; c.due = null; return c; }
    let due = c.b + INTERVALS[c.s];
    const gap = INTERVALS[c.s] - INTERVALS[c.s - 1];
    if (due <= t) due = t + gap; // 復習が遅れたときは間隔を保つ
    c.due = due;
  } else {
    // 最初からやり直し。正解するまでは今日の復習に残す
    c.s = 0; c.b = t; c.due = t; c.p = 1; c.lapses = (c.lapses || 0) + 1; delete c.m;
  }
  return c;
}
function applyResult(i, correct, t = dayNum(), misses = 0) { return srsUpdate(S.cards, i, correct, t, misses); }
function gDueList(t = dayNum()) {
  const out = [];
  for (const k in S.gcards) {
    const c = S.gcards[k];
    if (!c.m && c.due <= t && GQ[k]) out.push(k);
  }
  out.sort((a, b) => S.gcards[a].due - S.gcards[b].due);
  return out;
}

// ===== 4択の選択肢 =====
function pickChoices(i) {
  const w = WORDS[i];
  const used = new Set([w.m]);
  const opts = [];
  const sameLevel = [];
  for (let j = Math.max(0, i - 400); j < Math.min(WORDS.length, i + 400); j++) {
    if (j !== i && WORDS[j].l === w.l) sameLevel.push(j);
  }
  const pools = [sameLevel, WORDS.map((_, j) => j)];
  for (const pool of pools) {
    let guard = 0;
    while (opts.length < 3 && guard++ < 500) {
      const j = pool[Math.floor(Math.random() * pool.length)];
      if (j === i) continue;
      const m = WORDS[j].m;
      if (used.has(m) || m.includes(w.m) || w.m.includes(m)) continue;
      used.add(m); opts.push(j);
    }
    if (opts.length >= 3) break;
  }
  const all = [i, ...opts];
  for (let k = all.length - 1; k > 0; k--) { const r = Math.floor(Math.random() * (k + 1)); [all[k], all[r]] = [all[r], all[k]]; }
  return all;
}

// ===== 画面切り替え =====
const $ = id => document.getElementById(id);
function show(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('hidden', v.id !== view));
  document.querySelectorAll('.nav').forEach(b => b.classList.toggle('on', b.dataset.view === view));
  document.querySelector('.top nav').classList.toggle('hidden', view === 'study' || view === 'rdoc');
  if (view === 'topic') document.querySelector('.nav[data-view=grammar]').classList.add('on');
  window.scrollTo(0, 0);
  if (view === 'home') renderHome();
  if (view === 'list') renderList(true);
  if (view === 'settings') renderSettings();
  if (view === 'grammar') renderGrammar();
  if (view === 'reading') renderReading();
}
document.querySelectorAll('.nav').forEach(b => b.addEventListener('click', () => show(b.dataset.view)));

// ===== ホーム =====
function renderHome() {
  const t = dayNum();
  const due = dueList(t);
  const q = newQuota(due.length, t);
  const avail = nextNewWords(q).length;
  $('todayLabel').textContent = `今日 ${dayLabel(t)}`;
  $('dueCount').textContent = due.length;
  $('newCount').textContent = avail;
  let note = '';
  if (S.settings.autoThrottle && todayLog(t).n === 0 && due.length > S.settings.dailyNew * 6 && S.settings.dailyNew > 0) {
    note = '復習がたまっているので、今日は新しい単語をお休みにしています（設定で変更できます）。';
  } else if (due.length + avail === 0) {
    note = todayLog(t).tot > 0 ? '今日の分は終わりました。おつかれさまでした。' : '今日やる単語はありません。';
  } else {
    note = `目安の時間：約${Math.max(1, Math.round(avail * 0.5 + due.length * 0.1))}分`;
  }
  $('todayNote').textContent = note;
  $('startBtn').disabled = due.length + avail === 0;
  const gd = gDueList(t).length;
  $('homeGDue').textContent = gd;
  $('homeGNote').textContent = gd ? '今日の文法の復習があります。' : '今日の文法の復習はありません。新しい項目を進めましょう。';
  if (READ.docs.length) renderHomeReading();

  const learned = Object.keys(S.cards).length;
  const mastered = Object.values(S.cards).filter(c => c.m).length;
  $('learned').textContent = `${learned} / ${WORDS.length}`;
  $('mastered').textContent = mastered;
  $('progBar').style.width = (WORDS.length ? learned / WORDS.length * 100 : 0) + '%';
  $('stageLabel').textContent = currentStage();
  $('streak').textContent = `${streak()}日`;

  // 7日間の予定（今日は「残り」）
  const counts = [];
  for (let k = 0; k < 7; k++) counts.push(0);
  for (const key in S.cards) {
    const c = S.cards[key];
    if (c.m) continue;
    const off = Math.max(0, c.due - t);
    if (off < 7) counts[off]++;
  }
  const max = Math.max(1, ...counts);
  $('forecast').innerHTML = counts.map((v, k) =>
    `<div class="fc"><div class="v">${v}</div><div class="bar" style="height:${v / max * 80}%"></div><div class="d">${k === 0 ? '今日' : dayLabel(t + k, false)}</div></div>`
  ).join('');
}

// ===== 学習セッション =====
let queue = [], cur = null, session = null;
function startSession() {
  const t = dayNum();
  const due = dueList(t);
  const news = nextNewWords(newQuota(due.length, t));
  // 復習 → 新しい単語（紹介→テスト）の順
  queue = due.map(i => ({ i, type: 'rev', first: true }));
  // 新しい単語も最初から4択で出題（答えは選んだあとに表示）
  news.forEach(i => queue.push({ i, type: 'new', first: true }));
  session = { kind: 'word', t, total: due.length + news.length, done: 0, newDone: 0, revDone: 0, ok1: 0, tot: 0 };
  $('doneCard').classList.add('hidden');
  show('study');
  nextItem();
}
function nextItem() {
  cur = queue.shift();
  $('quizCard').classList.add('hidden');
  if (!cur) return finish();
  $('studyProgress').textContent = `${session.done} / ${session.total}`;
  if (cur.kind === 'g') return renderGrammarQ();
  $('quizWord').classList.remove('sentence');
  const w = WORDS[cur.i];
  const tag = $('quizTag');
  tag.textContent = cur.type === 'new' ? (cur.first ? '新しい単語' : 'もう一度') : (cur.first ? '復習' : 'もう一度');
  tag.classList.toggle('new', cur.type === 'new' && cur.first);
  $('quizWord').textContent = w.w;
  const ch = pickChoices(cur.i);
  $('choices').innerHTML = '';
  ch.forEach(j => {
    const b = document.createElement('button');
    b.className = 'choice';
    b.textContent = WORDS[j].m;
    b.addEventListener('click', () => answer(j, b));
    $('choices').appendChild(b);
  });
  $('feedback').classList.add('hidden');
  setSheet(S.settings.redSheet);
  $('quizCard').classList.remove('hidden');
}
function shuffle(a) { for (let k = a.length - 1; k > 0; k--) { const r = Math.floor(Math.random() * (k + 1)); [a[k], a[r]] = [a[r], a[k]]; } return a; }
// 赤シート：意味を思い浮かべてから、タップでめくって4択を見る
function setSheet(on) {
  $('choiceWrap').classList.toggle('sheet-on', !!on);
  $('redsheet').classList.toggle('lifted', !on);
  document.querySelectorAll('.choice').forEach(b => { b.tabIndex = on ? -1 : 0; });
}
$('redsheet').addEventListener('click', () => setSheet(false));
function posJa(p) { return { noun: '名詞', verb: '動詞', adj: '形容詞', adv: '副詞' }[p] || p; }
function answer(j, btn) {
  const correct = j === cur.i;
  const t = session.t;
  document.querySelectorAll('.choice').forEach(b => {
    b.disabled = true;
    if (b.textContent === WORDS[cur.i].m) b.classList.add('ok');
  });
  if (!correct) btn.classList.add('ng');

  const log = todayLog(t);
  if (cur.first) { log.tot++; session.tot++; if (correct) { log.ok1++; session.ok1++; } }
  if (!correct) cur.misses = (cur.misses || 0) + 1;
  const c = applyResult(cur.i, correct, t, cur.misses || 0);

  let nextText;
  if (correct) {
    if (cur.type === 'new') { log.n++; session.newDone++; } else { log.r++; session.revDone++; }
    session.done++;
    nextText = c.m ? '30日後の復習まで正解しました。この単語は完全に覚えました。'
      : `学習済みに登録しました。次の復習：${dayLabel(c.due)}（${c.due - t}日後）`;
  } else {
    queue.push({ i: cur.i, type: cur.type, first: false, misses: cur.misses });  // 正解するまで今日のうちにもう一度
    nextText = '正解するまで学習済みには登録しません。このあともう一度出題します。';
  }
  save();
  $('fbTitle').textContent = correct ? '正解' : `不正解　正解は「${WORDS[cur.i].m}」`;
  $('fbTitle').className = 'fb-title ' + (correct ? 'ok' : 'ng');
  const w = WORDS[cur.i];
  $('fbDetail').textContent = `${w.w}：` + (w.p ? `[${posJa(w.p)}] ` : '') + w.d;
  $('fbNext').textContent = nextText;
  $('feedback').classList.remove('hidden');
  $('studyProgress').textContent = `${session.done} / ${session.total}`;
  $('nextBtn').focus({ preventScroll: true });
}
function finish() {
  const g = session.kind === 'g';
  $('doneTitle').textContent = g ? 'おつかれさまでした' : '今日の学習は完了です';
  $('doneNewLabel').textContent = g ? '初めて正解した問題' : '新しく覚えた単語';
  $('doneRevLabel').textContent = g ? '解き直した問題' : '復習した単語';
  $('doneNew').textContent = session.newDone;
  $('doneRev').textContent = session.revDone;
  $('doneRate').textContent = session.tot ? Math.round(session.ok1 / session.tot * 100) + '%' : '-';
  $('studyProgress').textContent = '';
  $('doneCard').classList.remove('hidden');
}
$('startBtn').addEventListener('click', startSession);
$('nextBtn').addEventListener('click', nextItem);
$('doneHome').addEventListener('click', () => show(session && session.kind === 'g' ? 'grammar' : 'home'));
$('quitBtn').addEventListener('click', () => {
  if (confirm('中断しますか？ここまでの記録は保存されています。')) show(session && session.kind === 'g' ? 'grammar' : 'home');
});

// ===== 単語一覧 =====
let listItems = [], listShown = 0;
function statusOf(i) {
  const c = S.cards[i];
  if (!c) return { k: 'new', txt: '未学習', cls: '' };
  if (c.m) return { k: 'mastered', txt: '完全に覚えた', cls: 'ms' };
  if (c.p) return { k: 'learning', txt: '今日やり直し', cls: 'l' };
  return { k: 'learning', txt: `次 ${dayLabel(c.due, false)}`, cls: 'l' };
}
function renderList(reset) {
  if (reset) {
    const q = $('search').value.trim().toLowerCase();
    const lv = $('filterLevel').value, st = $('filterStatus').value;
    listItems = orderedIndices().filter(i => {
      const w = WORDS[i];
      if (lv && w.l !== lv) return false;
      if (q && !w.w.toLowerCase().includes(q) && !w.d.includes(q)) return false;
      if (st === 'weak') return (S.cards[i] && S.cards[i].lapses >= 2);
      if (st && statusOf(i).k !== st) return false;
      return true;
    });
    listShown = 0;
    $('wordlist').innerHTML = '';
  }
  const frag = document.createDocumentFragment();
  listItems.slice(listShown, listShown + PAGE).forEach(i => {
    const w = WORDS[i], s = statusOf(i);
    const li = document.createElement('li');
    const lapses = S.cards[i] && S.cards[i].lapses ? `<br>ミス${S.cards[i].lapses}回` : '';
    li.innerHTML = `<div><div class="w"></div><div class="m"></div></div><div class="st ${s.cls}">${s.txt}${lapses}</div>`;
    li.querySelector('.w').textContent = w.w;
    li.querySelector('.m').textContent = w.d;
    frag.appendChild(li);
  });
  listShown += PAGE;
  $('wordlist').appendChild(frag);
  $('listCount').textContent = `${listItems.length}語`;
  $('moreBtn').classList.toggle('hidden', listShown >= listItems.length);
}
let searchTimer;
$('search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => renderList(true), 200); });
$('filterLevel').addEventListener('change', () => renderList(true));
$('filterStatus').addEventListener('change', () => renderList(true));
$('moreBtn').addEventListener('click', () => renderList(false));

// ===== 設定 =====
function renderSettings() {
  const sel = $('dailyNew');
  if (!sel.options.length) {
    for (let n = 10; n <= 100; n += 10) sel.add(new Option(`${n}語`, n));
  }
  sel.value = S.settings.dailyNew;
  $('startFrom').value = S.settings.startFrom;
  $('autoThrottle').checked = S.settings.autoThrottle;
  $('redSheetSetting').checked = S.settings.redSheet;
  renderEstimate();
}
function renderEstimate() {
  const n = S.settings.dailyNew;
  const days = Math.ceil(WORDS.length / n);
  $('loadEstimate').textContent =
    `1か月後からの1日の量：約${n * 6}語（2割まちがえると約${Math.round(n * 8.7)}語）。` +
    `時間の目安：約${n}分。全${WORDS.length}語の新規が終わるまで約${days}日。`;
}
$('dailyNew').addEventListener('change', e => { S.settings.dailyNew = +e.target.value; save(); renderEstimate(); });
$('startFrom').addEventListener('change', e => { S.settings.startFrom = e.target.value; save(); });
$('autoThrottle').addEventListener('change', e => { S.settings.autoThrottle = e.target.checked; save(); });
$('redSheetSetting').addEventListener('change', e => { S.settings.redSheet = e.target.checked; save(); });
$('resetBtn').addEventListener('click', () => {
  if (confirm('すべての学習記録を消します。元に戻せません。よろしいですか？')) {
    const keep = S.settings; S = defaultState(); S.settings = keep; save(); show('home');
  }
});

// ===== 文法 =====
const esc = x => String(x).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
function topicStats(tp) {
  let done = 0, tries = 0, ok = 0, mastered = 0, weak = 0;
  for (const q of tp.qs) {
    const c = S.gcards[q.id];
    if (c) { done++; if (c.m) mastered++; if (c.lapses >= 2) weak++; }
    const st = S.gstat[q.id];
    if (st) { tries += st[0]; ok += st[1]; }
  }
  return { done, mastered, weak, rate: tries ? Math.round(ok / tries * 100) : null };
}
function renderGrammar() {
  const t = dayNum();
  const due = gDueList(t);
  $('gDue').textContent = due.length;
  $('gReviewBtn').disabled = due.length === 0;
  const groups = [['basic', '基礎文法'], ['p5', 'Part 5 タイプ別']];
  let html = '';
  for (const [cat, label] of groups) {
    const tps = GRAMMAR.filter(x => x.cat === cat);
    const ready = tps.reduce((a, x) => a + x.qs.length, 0), plan = tps.reduce((a, x) => a + x.n, 0);
    html += `<h3 class="ghead">${label}<small>${ready === plan ? `${ready}問` : `公開中 ${ready}問 / 予定 ${plan}問`}</small></h3>`;
    let lastGroup = '';
    for (const tp of tps) {
      if (cat === 'basic' && tp.group !== lastGroup) { html += `<div class="gsub">${esc(tp.group)}</div>`; lastGroup = tp.group; }
      if (!tp.qs.length) {
        html += `<div class="gitem off"><div><div class="gt">${esc(tp.title)}</div><div class="gm">${tp.n}問・準備中</div></div></div>`;
        continue;
      }
      const st = topicStats(tp);
      const more = tp.qs.length < tp.n ? `（予定${tp.n}問）` : '';
      const rate = st.rate === null ? '' : `・1回目の正答率 ${st.rate}%`;
      html += `<button class="gitem" data-topic="${tp.id}"><div><div class="gt">${esc(tp.title)}</div>` +
        `<div class="gm">${tp.qs.length}問${more}・正解済み ${st.done}${rate}</div></div><span class="arrow">›</span></button>`;
    }
  }
  $('gList').innerHTML = html;
  $('gList').querySelectorAll('[data-topic]').forEach(b => b.addEventListener('click', () => openTopic(b.dataset.topic)));
}
let curTopic = null;
function openTopic(id) {
  curTopic = GRAMMAR.find(x => x.id === id);
  const st = topicStats(curTopic);
  $('tpTitle').textContent = curTopic.title;
  $('tpGroup').textContent = curTopic.cat === 'p5' ? 'Part 5 タイプ別' : `基礎文法・${curTopic.group}`;
  $('tpExplain').innerHTML = curTopic.explain; // 自前の解説（HTMLを含む）
  $('tpStats').textContent = `${curTopic.qs.length}問のうち正解済み ${st.done}問・完全に覚えた ${st.mastered}問` + (st.rate === null ? '' : `・1回目の正答率 ${st.rate}%`);
  $('tpStart').textContent = `この項目を解く（${curTopic.qs.length}問）`;
  show('topic');
}
function gType(qid, t) {
  const c = S.gcards[qid];
  if (!c) return 'new';
  return (!c.m && c.due <= t) ? 'rev' : 'prac';
}
function startGrammarSession(qids) {
  const t = dayNum();
  queue = qids.map(qid => ({ kind: 'g', qid, type: gType(qid, t), first: true }));
  session = { kind: 'g', t, total: queue.length, done: 0, newDone: 0, revDone: 0, ok1: 0, tot: 0 };
  $('doneCard').classList.add('hidden');
  show('study');
  nextItem();
}
$('tpStart').addEventListener('click', () => startGrammarSession(shuffle(curTopic.qs.map(q => q.id))));
$('tpBack').addEventListener('click', () => show('grammar'));
$('gReviewBtn').addEventListener('click', () => startGrammarSession(gDueList()));
$('gMixBtn').addEventListener('click', () => {
  const all = GRAMMAR.filter(x => x.cat === 'p5').flatMap(x => x.qs.map(q => q.id));
  startGrammarSession(shuffle(all).slice(0, 10));
});
function renderGrammarQ() {
  const { q, topic } = GQ[cur.qid];
  const tag = $('quizTag');
  const kindTxt = !cur.first ? 'もう一度' : { new: '新しい問題', rev: '復習', prac: '練習' }[cur.type];
  tag.textContent = `${topic.title}・${kindTxt}`;
  tag.classList.toggle('new', cur.type === 'new' && cur.first);
  $('quizWord').classList.add('sentence');
  $('quizWord').innerHTML = esc(q.q).replace('-------', '<span class="blank">　　　　</span>');
  $('choices').innerHTML = '';
  q.c.forEach((txt, k) => {
    const b = document.createElement('button');
    b.className = 'choice en';
    b.textContent = `(${'ABCD'[k]}) ${txt}`;
    b.dataset.k = k;
    b.addEventListener('click', () => answerGrammar(k, b));
    $('choices').appendChild(b);
  });
  $('feedback').classList.add('hidden');
  setSheet(S.settings.redSheet);
  $('quizCard').classList.remove('hidden');
}
function answerGrammar(k, btn) {
  const { q } = GQ[cur.qid];
  const correct = k === q.a;
  const t = session.t;
  document.querySelectorAll('.choice').forEach(b => {
    b.disabled = true;
    if (+b.dataset.k === q.a) b.classList.add('ok');
  });
  if (!correct) btn.classList.add('ng');
  const log = todayLog(t);
  if (cur.first) {
    log.gtot++; session.tot++;
    const st = S.gstat[cur.qid] || (S.gstat[cur.qid] = [0, 0]);
    st[0]++;
    if (correct) { log.gok1++; session.ok1++; st[1]++; }
  }
  if (!correct) cur.misses = (cur.misses || 0) + 1;
  const wasNew = !(cur.qid in S.gcards);
  const c = srsUpdate(S.gcards, cur.qid, correct, t, cur.misses || 0, cur.type === 'prac');
  let nextText;
  if (correct) {
    if (wasNew) { log.gn++; session.newDone++; } else { log.gr++; session.revDone++; }
    session.done++;
    nextText = c.m ? 'この問題は完全に覚えました。'
      : `次の復習：${dayLabel(c.due)}（${c.due - t}日後）`;
  } else {
    queue.push({ kind: 'g', qid: cur.qid, type: cur.type, first: false, misses: cur.misses });
    nextText = '正解するまで「正解済み」には登録しません。このあともう一度出題します。';
  }
  save();
  $('fbTitle').textContent = correct ? '正解' : `不正解　正解は (${'ABCD'[q.a]}) ${q.c[q.a]}`;
  $('fbTitle').className = 'fb-title ' + (correct ? 'ok' : 'ng');
  const full = esc(q.q).replace('-------', `<b class="ans">${esc(q.c[q.a])}</b>`);
  $('fbDetail').innerHTML = `<div class="fb-en">${full}</div><div class="fb-ja">${esc(q.t)}</div><div class="fb-ex">${esc(q.e)}</div>`;
  $('fbNext').textContent = nextText;
  $('feedback').classList.remove('hidden');
  $('studyProgress').textContent = `${session.done} / ${session.total}`;
  $('nextBtn').focus({ preventScroll: true });
}
$('homeGrammarBtn').addEventListener('click', () => show('grammar'));

// ===== 起動 =====
Promise.all([
  fetch('words.json?v=' + VERSION).then(r => r.json()),
  fetch('grammar.json?v=' + VERSION).then(r => r.json()),
  fetch('reading.json?v=' + VERSION).then(r => r.json()),
]).then(([words, grammar, reading]) => {
  initReading(reading);
  WORDS = words;
  GRAMMAR = grammar;
  for (const tp of GRAMMAR) for (const q of tp.qs) GQ[q.id] = { q, topic: tp };
  show('home');
}).catch(() => {
  $('todayNote').textContent = '単語データを読み込めませんでした。通信を確認して再読み込みしてください。';
});
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// 日付が変わったら更新
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !$('home').classList.contains('hidden')) renderHome();
});
