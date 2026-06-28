/* Globe Weekly — sample weekly script (data + JA/EN dialogue).
   In production this object is generated each week by Claude from the
   USGS / JMA / NOAA feeds. Here it is a hand-written sample for the
   week of Jun 20–26, 2026 so the studio can be previewed end to end.

   Two presenters:
     host   = ハルカ / Haruka  (進行 / Anchor)   — frames the program
     expert = リク   / Riku    (解説 / Analyst)  — explains the science
*/
window.WEEKLY = {
  week: { start_ja: '6月20日', end_ja: '6月26日', start_en: 'Jun 20', end_en: 'Jun 26', year: 2026, no: 26 },
  hosts: {
    host:   { ja: 'ハルカ', en: 'Haruka', role_ja: '進行', role_en: 'Anchor' },
    expert: { ja: 'リク',   en: 'Riku',   role_ja: '解説', role_en: 'Analyst' },
  },

  disclaimer: {
    ja: 'USGS・JMA・NOAAのデータをもとに自動生成した一般向けの解説です。公式の危険度評価ではありません。地震メカニズム・津波リスク・余震の見込みは推定であり、更新される場合があります。防災情報は各国の公式機関に従ってください。',
    en: 'An automatically generated, general-audience recap based on USGS, JMA and NOAA data — not an official hazard assessment. Earthquake mechanisms, tsunami risk and aftershock outlooks are estimates and may be revised. For disaster guidance, follow your country’s official agencies.',
  },

  events: {
    quakes: [
      { mag: 6.8, ja: 'フィリピン・ミンダナオ島沖', en: 'Off Mindanao, Philippines', coords: [126.4, 6.9],
        depth: 32, fault_ja: '沈み込み帯・逆断層', fault_en: 'Subduction thrust', mechanism: 'subduction',
        impact: { source: 'GDACS', alert: 'ORANGE', summary: 'Orange alert — population exposed to strong shaking near the coast.', url: 'https://www.gdacs.org/' },
        tsunami: true, day_ja: '6/23', day_en: 'Jun 23' },
      { mag: 6.1, ja: 'ケルマデック諸島', en: 'Kermadec Islands', coords: [-177.6, -30.5],
        depth: 45, fault_ja: '沈み込み帯', fault_en: 'Subduction', tsunami: false, day_ja: '6/21', day_en: 'Jun 21' },
      { mag: 5.9, ja: '北海道・十勝沖', en: 'Off Tokachi, Hokkaido', coords: [143.6, 42.0],
        depth: 50, fault_ja: 'プレート境界', fault_en: 'Plate boundary', tsunami: false, day_ja: '6/25', day_en: 'Jun 25' },
      { mag: 5.6, ja: 'チリ北部', en: 'Northern Chile', coords: [-70.2, -22.5],
        depth: 95, fault_ja: '深発地震', fault_en: 'Intermediate-depth', tsunami: false, day_ja: '6/20', day_en: 'Jun 20' },
    ],
    quakeTotal: 51,
    volcanoes: [
      { ja: '桜島', en: 'Sakurajima', where_ja: '日本・鹿児島', where_en: 'Kagoshima, Japan', coords: [130.66, 31.58],
        level: 3, label_ja: 'レベル3・入山規制', label_en: 'Level 3 — entry restricted', note_ja: '噴火継続・降灰', note_en: 'Ongoing ashfall',
        impact: { source: 'GDACS', alert: 'ORANGE', url: 'https://www.gdacs.org/' } },
      { ja: 'キラウエア', en: 'Kīlauea', where_ja: '米・ハワイ島', where_en: 'Hawaii, USA', coords: [-155.28, 19.42],
        aviation: 'ORANGE', label_ja: '航空コード オレンジ', label_en: 'Aviation code ORANGE', note_ja: '山頂で新たな噴火', note_en: 'New summit eruption' },
    ],
    flares: [
      { cls: 'X1.4', region: 'AR4146', coords: [142, 8], r: 'R3', peak_ja: '6/24 09:12 UT', peak_en: 'Jun 24, 09:12 UT',
        effect_ja: '太平洋側で短波障害', effect_en: 'Shortwave blackout over the Pacific', aurora: true },
    ],
    flareSummary_ja: 'Mクラス9回 ・ Xクラス1回', flareSummary_en: '9 M-class · 1 X-class',
  },

  segments: [
    // ---- cold open ----
    { id: 'open', kind: 'quake', titleCard: false, panel: { type: 'intro' },
      lines: [
        { who: 'host', focus: 'quake:0',
          ja: 'こんにちは、Globe Weekly です。今週も地球の動きを7日分、まとめてお届けします。',
          en: 'Hello and welcome to Globe Weekly — seven days of our restless planet, in one place.' },
        { who: 'expert',
          ja: '今週の主役は、ミンダナオ島沖のマグニチュード6.8。津波注意報も出ました。',
          en: 'The headline this week: a magnitude 6.8 off Mindanao — it even triggered a tsunami advisory.' },
        { who: 'host',
          ja: '地震、火山、太陽フレア。順番に見ていきましょう。',
          en: 'Earthquakes, volcanoes, and solar flares — let’s take them one by one.' },
      ] },

    // ---- earthquakes ----
    { id: 'quakes', kind: 'quake', titleCard: true,
      eyebrow_ja: 'セクション 01', eyebrow_en: 'Section 01',
      title_ja: '今週の地震', title_en: 'This Week in Earthquakes',
      sub_ja: '6/20–6/26 ・ M4.5以上 51回', sub_en: 'Jun 20–26 · 51 events M4.5+',
      panel: { type: 'quakelist' },
      lines: [
        { who: 'host', focus: 'list',
          ja: '今週、世界で観測されたマグニチュード4.5以上は51回。大きい方から見ていきます。',
          en: 'This week the world logged 51 quakes of magnitude 4.5 or greater. Let’s start at the top.' },
        { who: 'expert', focus: 'quake:0', panel: { type: 'quakefocus', ix: 0 },
          ja: '最大はミンダナオ島沖のM6.8。深さ32キロと比較的浅い、沈み込み帯の逆断層型です。',
          en: 'The largest was that M6.8 off Mindanao — shallow at 32 km, a thrust on the subduction zone.' },
        { who: 'host',
          ja: '津波注意報が出たのはなぜですか?',
          en: 'Why the tsunami advisory?' },
        { who: 'expert',
          ja: '海底が浅い場所で急にずれると、海水が持ち上げられます。今回は数十センチ規模で収まりました。',
          en: 'A shallow seafloor rupture lifts the water column. This time the waves stayed in the tens of centimetres.' },
        { who: 'host', focus: 'quake:2', panel: { type: 'quakefocus', ix: 2 },
          ja: '日本では、25日に十勝沖でM5.9。揺れは北海道の広い範囲で感じられました。',
          en: 'Closer to Japan, an M5.9 off Tokachi on the 25th — felt widely across Hokkaido.' },
        { who: 'expert',
          ja: 'プレート境界の典型的な地震で、被害の報告はありません。落ち着いた挙動でした。',
          en: 'A textbook plate-boundary event, no damage reported — it behaved quietly.' },
        { who: 'host',
          ja: 'ケルマデック諸島やチリ北部でも、M5〜6級が続きました。',
          en: 'The Kermadecs and northern Chile also saw events in the fives and sixes.' },
      ] },

    // ---- volcanoes ----
    { id: 'volcano', kind: 'volcano', titleCard: true,
      eyebrow_ja: 'セクション 02', eyebrow_en: 'Section 02',
      title_ja: '火山の動き', title_en: 'Volcano Watch',
      sub_ja: '警戒レベルの変化', sub_en: 'Changes in alert level',
      panel: { type: 'volcano', ix: 0 },
      lines: [
        { who: 'host', focus: 'volcano:0',
          ja: '続いて火山です。鹿児島の桜島は、噴火警戒レベル3が続いています。',
          en: 'On to volcanoes. Sakurajima in Kagoshima stays at eruption alert Level 3.' },
        { who: 'expert',
          ja: 'レベル3は「入山規制」。今週も噴火が続き、風下の地域では降灰に注意が必要です。',
          en: 'Level 3 means “do not approach.” Eruptions continued this week — watch for ashfall downwind.' },
        { who: 'host', focus: 'volcano:1', panel: { type: 'volcano', ix: 1 },
          ja: 'ハワイのキラウエアでは、山頂で新たな噴火。航空コードはオレンジに。',
          en: 'In Hawaii, Kīlauea began a new summit eruption — aviation code raised to ORANGE.' },
        { who: 'expert',
          ja: '溶岩は火口内にとどまっていますが、火山ガスと航空への影響が見どころです。',
          en: 'The lava is staying within the crater, but volcanic gas and aviation are the things to watch.' },
      ] },

    // ---- solar flares (Short candidate) ----
    { id: 'flare', kind: 'flare', titleCard: true, short: true,
      eyebrow_ja: 'セクション 03', eyebrow_en: 'Section 03',
      title_ja: '太陽フレア', title_en: 'Solar Flares',
      sub_ja: '今週いちばんの注目', sub_en: 'The week’s most striking story',
      panel: { type: 'flare', ix: 0 },
      lines: [
        { who: 'host', focus: 'flare:0',
          ja: '今週いちばんの注目は、太陽です。24日にXクラスの大型フレアが発生しました。',
          en: 'The week’s standout came from the Sun — an X-class flare erupted on the 24th.' },
        { who: 'expert',
          ja: 'X1.4。放射が地球に届き、太平洋側で短波通信が一時的に乱れました。R3クラスです。',
          en: 'X1.4. Its radiation reached Earth and briefly disrupted shortwave radio over the Pacific — an R3 event.' },
        { who: 'host',
          ja: 'オーロラへの影響は?',
          en: 'And the aurora?' },
        { who: 'expert',
          ja: 'コロナ質量放出も伴いました。高緯度では、いつもより低い緯度までオーロラが見えた可能性があります。',
          en: 'It came with a coronal mass ejection — auroras may have reached lower latitudes than usual.' },
        { who: 'host',
          ja: 'スマホでも撮れるかもしれない。空を見上げる理由が、ひとつ増えましたね。',
          en: 'Maybe even catchable on a phone. One more reason to look up.' },
      ] },

    // ---- the week ahead ----
    { id: 'outlook', kind: 'outlook', titleCard: true,
      eyebrow_ja: 'セクション 04', eyebrow_en: 'Section 04',
      title_ja: '今後の見込み', title_en: 'The Week Ahead',
      sub_ja: '注意して見ておきたい3つ', sub_en: 'Three things worth watching',
      panel: { type: 'outlook' },
      lines: [
        { who: 'host',
          ja: '最後に、これからの一週間で気をつけて見ておきたい点を3つ。',
          en: 'Finally, three things worth keeping an eye on in the week ahead.' },
        { who: 'expert',
          ja: 'まずミンダナオ島沖。M6.8のあとは、しばらく余震が続きます。現地の情報に注意を。',
          en: 'First, off Mindanao — after an M6.8, aftershocks continue for a while. Follow local guidance.' },
        { who: 'expert',
          ja: '次に太陽。同じ活動領域がまだ地球を向いていて、追加のフレアの可能性があります。',
          en: 'Second, the Sun — that active region still faces Earth, so more flares are possible.' },
        { who: 'expert',
          ja: 'そして桜島。降灰は続く見込みです。洗濯物や運転にはご注意を。',
          en: 'And third, Sakurajima — ashfall is likely to continue. Mind the laundry and the roads.' },
      ] },

    // ---- outro ----
    { id: 'outro', kind: 'outlook', titleCard: false, panel: { type: 'outro' },
      lines: [
        { who: 'host',
          ja: '以上、今週のGlobe Weeklyでした。',
          en: 'That’s your Globe Weekly.' },
        { who: 'expert',
          ja: '回転する地球の上で、すべての地震・火山・フレアをいつでも見られます。説明欄のリンクから。',
          en: 'See every quake, volcano and flare live on the spinning globe — link in the description.' },
        { who: 'host',
          ja: 'また来週、お会いしましょう。',
          en: 'We’ll see you next week.' },
      ] },
  ],
};
