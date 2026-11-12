# TOEIC 単語 忘却曲線トレーナー

基礎英単語（NGSL）とTOEIC頻出語（TSL）の約4000語を、忘却曲線に合わせて復習する単語アプリです。スマホのブラウザで動き、ホーム画面に追加して使えます。

## しくみ

- 出題形式：英単語を見て、日本語の意味を4つから選ぶ
- 復習のタイミング：覚えた日 → 1日後 → 3日後 → 7日後 → 14日後 → 30日後
- 新しい単語・復習の単語とも、正解するまでは学習済みに登録しない（その日のうちに正解するまで出題し、正解したら「1日後」からやり直し）
- 4択は赤シートで隠して出題（設定でオフにできる）
- 30日後の復習で正解すると「完全に覚えた」
- 1日の新しい単語の数は10〜100語（10語刻み）で設定
- 復習がたまった日は新しい単語を自動で休む（設定で切り替え可）
- 学習記録はブラウザの中（localStorage）に保存

## 文法

- 全515問：基礎文法30項目315問、Part 5タイプ別200問（品詞40・動詞30・前置詞か接続詞か25・代名詞20・前置詞25・関係詞20・ペア表現等40）
- 4択（赤シート対応）、解説・訳付き。まちがえた問題は正解するまで出題し、正解後は 1・3・7・14・30日後に復習
- 問題はこのアプリ用のオリジナル（TOEIC公式問題ではない）

## ファイル

| ファイル | 内容 |
|---|---|
| `index.html` / `style.css` / `app.js` | アプリ本体 |
| `words.json` | 単語データ（英単語・日本語訳・段階） |
| `grammar.json` | 文法の項目・解説・問題（`tools/build_grammar.py` で生成） |
| `sw.js` / `manifest.json` | オフライン対応とホーム画面追加 |

## 単語データの出典とライセンス

- New General Service List — Browne, C., Culligan, B. & Phillips, J. — CC BY-SA 4.0 — https://www.newgeneralservicelist.com/
- TOEIC Service List 1.2 — Browne, C. & Culligan, B. — CC BY-SA 4.0 — https://www.newgeneralservicelist.com/toeic-service-list
- 日本語訳：EJDict-hand（kujirahand、パブリックドメイン / CC0）をもとに自動整形し、辞書にない語は手作業で追加

`words.json` は上記リストをもとにした派生データのため、CC BY-SA 4.0 で公開します。アプリのコード（html / css / js）は MIT License です。
