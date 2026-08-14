-- Seed catalogue: 10 well-known artworks. Embeddings stay NULL and are
-- backfilled by the embedding generation task.

insert into public.artworks
  (title, title_en, artist, artist_en, year_created, medium, style, museum, country, description, search_query, tags)
values
  ('睡蓮', 'Water Lilies', 'クロード・モネ', 'Claude Monet', '1916', '油彩・カンヴァス', '印象派', '国立西洋美術館ほか', 'フランス',
   '晩年のモネがジヴェルニーの自邸の池を描いた連作。水面に映る空と光の移ろいを、輪郭を溶かすような筆致で捉えている。',
   'Claude Monet Water Lilies', array['印象派', '風景', '連作', 'フランス']),
  ('星月夜', 'The Starry Night', 'フィンセント・ファン・ゴッホ', 'Vincent van Gogh', '1889', '油彩・カンヴァス', 'ポスト印象派', 'ニューヨーク近代美術館 (MoMA)', 'アメリカ',
   'サン＝レミの療養院から見た夜明け前の空を、記憶と想像を交えて描いた作品。渦巻く空と炎のような糸杉が対比をなす。',
   'Vincent van Gogh The Starry Night', array['ポスト印象派', '夜景', '風景', 'オランダ']),
  ('モナ・リザ', 'Mona Lisa', 'レオナルド・ダ・ヴィンチ', 'Leonardo da Vinci', '1503-1519', '油彩・板', 'ルネサンス', 'ルーヴル美術館', 'フランス',
   'スフマート技法による柔らかな陰影と、見る角度で変化するような微笑で知られる肖像画。背景には空想的な風景が広がる。',
   'Leonardo da Vinci Mona Lisa', array['ルネサンス', '肖像画', 'イタリア']),
  ('ダビデ像', 'David', 'ミケランジェロ・ブオナローティ', 'Michelangelo Buonarroti', '1501-1504', '大理石', 'ルネサンス', 'アカデミア美術館', 'イタリア',
   'ゴリアテと対峙する直前の緊張を秘めた青年ダビデの立像。高さ約5.17メートルの一塊の大理石から彫り出された。',
   'Michelangelo David statue', array['彫刻', 'ルネサンス', 'イタリア']),
  ('真珠の耳飾りの少女', 'Girl with a Pearl Earring', 'ヨハネス・フェルメール', 'Johannes Vermeer', '1665', '油彩・カンヴァス', 'バロック', 'マウリッツハイス美術館', 'オランダ',
   '暗い背景から浮かび上がる少女のトローニー（人物習作）。青と黄のターバン、そして光を受ける真珠が印象を決定づける。',
   'Johannes Vermeer Girl with a Pearl Earring', array['バロック', '肖像画', 'オランダ']),
  ('叫び', 'The Scream', 'エドヴァルド・ムンク', 'Edvard Munch', '1893', 'テンペラ・厚紙', '表現主義', 'オスロ国立美術館', 'ノルウェー',
   '血のような赤い空の下、橋の上で耳を塞ぐ人物を描く。ムンク自身が体験した「自然を貫く叫び」を視覚化した作品。',
   'Edvard Munch The Scream', array['表現主義', '象徴主義', 'ノルウェー']),
  ('接吻', 'The Kiss', 'グスタフ・クリムト', 'Gustav Klimt', '1907-1908', '油彩・金箔・カンヴァス', 'ウィーン分離派', 'ベルヴェデーレ宮殿オーストリア絵画館', 'オーストリア',
   '金箔を多用した「黄金様式」の代表作。抱き合う男女が装飾的な文様に包まれ、平面性と官能性が同居する。',
   'Gustav Klimt The Kiss', array['ウィーン分離派', '装飾', 'オーストリア']),
  ('富嶽三十六景 神奈川沖浪裏', 'The Great Wave off Kanagawa', '葛飾北斎', 'Katsushika Hokusai', '1831', '木版画（錦絵）', '浮世絵', '東京国立博物館ほか', '日本',
   '大波の爪先が舟と富士を呑み込もうとする瞬間を捉えた錦絵。ベロ藍（プルシアンブルー）の鮮烈な青が特徴。',
   'Hokusai The Great Wave off Kanagawa', array['浮世絵', '版画', '日本', '風景']),
  ('色絵藤花文茶壺', 'Tea Jar with Wisteria Design', '野々村仁清', 'Nonomura Ninsei', '17世紀', '色絵陶器', '京焼', 'MOA美術館', '日本',
   '白釉の地に藤の花房を金銀と色絵で描いた茶壺。京焼の優美な意匠を確立した仁清の代表作で、国宝に指定されている。',
   'Nonomura Ninsei tea jar wisteria', array['工芸', '陶芸', '国宝', '日本']),
  ('無限の網', 'Infinity Nets', '草間彌生', 'Yayoi Kusama', '1959', '油彩・カンヴァス', '現代美術', '個人蔵ほか', '日本',
   '網目状の筆触を画面いっぱいに反復させた連作。草間が幼少期から見ていた幻覚を、増殖するパターンとして定着させた。',
   'Yayoi Kusama Infinity Nets', array['現代美術', '抽象', '日本'])
on conflict (title, artist) do nothing;
