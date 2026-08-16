# ブランド画像の作り方

`hero.png` / `ogp.png` / `src/app/icon.png` はこのディレクトリの HTML を Chrome で撮影して作っています。

```bash
# 1. アプリのスクリーンショット（docs/brand/screen.png）を撮り直す場合
#    本番の「睡蓮」画面をモバイル幅で撮影し、docs/brand/screen.png に置く

# 2. HTML を撮影（Chrome のヘッドレス。日本語は Noto Sans/Serif CJK JP を使用）
google-chrome --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
  --window-size=1200,675 --screenshot=docs/images/hero.png docs/brand/hero.html
google-chrome --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
  --window-size=1200,630 --screenshot=docs/images/ogp.png docs/brand/ogp.html
google-chrome --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
  --window-size=512,512 --screenshot=src/app/icon.png docs/brand/icon.html

# 3. 圧縮（500KB 以下に収める）
pngquant --quality 65-90 --strip --force --ext .png docs/images/hero.png docs/images/ogp.png
```

`docs/images/ogp.png` と同じ画像を `public/og-default.png`（共有カードの既定画像）にも置いています。

## スライドの作り方

発表用スライドは `docs/slides/*.html` に 1920x1080 の HTML として置き、
同梱の `docs/slides/render.sh` で Chrome ヘッドレス撮影します。実行すると
`docs/images/slides/01-title.png` 〜 `08-closing.png` が生成されます。

```bash
bash docs/slides/render.sh
```

Chrome の撮影フラグは上記のブランド画像と揃えています。ヘッドレスの実効 viewport は
1080px に届かないため、`--window-size=1920,1167` で撮って 1920x1080 に切り出しています。
圧縮は `render.sh` が `pngquant --quality 80-95`（無ければ oxipng / optipng）で行います。
暗い紺のグラデーションが主体なので、256 色パレット化は階調が飛ぶため使いません。
