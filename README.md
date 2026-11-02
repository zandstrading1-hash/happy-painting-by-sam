# Happy Painting by Sam

Website for Happy Painting by Sam (painters in Windsor & Essex County, ON).

- Live: https://happypaintingbysam.ca (GitHub Pages, DNS on Cloudflare)
- Moved out of `zandstrading1-hash/zs-mockups` (folders `happy-painting-by-sam/` and
  `source/happy-painting-by-sam/`).

## Layout

```
index.html services.html work.html colour-lab.html about.html contact.html   <- generated
style.css  script.js           <- edit directly (shared by all pages)
img/*.webp                     <- Sam's project photos, 1200px max
CNAME                          <- custom domain for GitHub Pages
_config.yml                    <- keeps tools/ and this README off the published site
_headers                       <- only used if the site is ever moved to Cloudflare Pages

tools/
  build_site.py                <- writes the six .html pages
  parts/*.html                 <- shared fragments (head, header, footer, sections)
  check_pages.js               <- smoke test for all pages, desktop + phone
  package.json                 <- npm run build / check
```

## Editing

- **Styles or behaviour:** edit `style.css` or `script.js`. Nothing to rebuild.
- **Page content, nav, footer, CTA band:** edit `tools/parts/*.html` and/or `tools/build_site.py`, then run

  ```
  python3 tools/build_site.py
  ```

  This overwrites the six HTML pages. If you hand-edit a page instead, the next build will undo it,
  so pick one way and stick to it. `build_site.py` holds the page-specific copy (service details,
  About text, FAQ, page titles and descriptions); `parts/` holds sections reused across pages.
- `script.js` only runs the modules a page has (`if` the element exists), so a section can move
  between pages without JS changes.

Every push to `main` redeploys the site.

## Checking

```
python3 -m http.server 8765        # from the repo root, leave it running

cd tools
npm install && npx playwright install chromium   # once
npm run check                      # or: npm run check:shots  (saves to tools/screenshots/, gitignored)
```

It loads all six pages at 1440×900 and 390×844, fails on console errors, horizontal overflow or a
broken form prefill, and exits non-zero if anything fails.

## Domain (Cloudflare DNS)

`happypaintingbysam.ca` uses Cloudflare nameservers. In Cloudflare, **DNS → Records**, with the
proxy turned off (grey cloud, "DNS only") so GitHub can issue the HTTPS certificate:

| Type  | Name | Content                       |
|-------|------|-------------------------------|
| A     | @    | 185.199.108.153               |
| A     | @    | 185.199.109.153               |
| A     | @    | 185.199.110.153               |
| A     | @    | 185.199.111.153               |
| CNAME | www  | zandstrading1-hash.github.io  |

GitHub redirects `www` to the bare domain. Once the certificate is issued, turn on
**Enforce HTTPS** under the repo's **Settings → Pages**.

## Before it goes live for Sam

- **Search engines:** every page has `<meta name="robots" content="noindex, nofollow">` (in
  `tools/parts/head.html`). Remove it and rebuild once Sam signs off.
- **Estimate form:** it opens the visitor's email app with a prefilled message to
  happypaintingbysam@gmail.com (`mailto:`). There's no backend. A real launch should post to a form
  service so requests arrive without relying on the visitor's mail app.
- **Copy:** service details, About and FAQ only restate what's on Sam's existing site (free
  estimates, most rooms in a day, sharp lines, floors and furniture protected, full clean-up, the 8
  towns). There are no invented reviews or stats. A photo of Sam and his own story would make About
  much stronger.
- **Domain:** it's registered under Z&S Trading. Transfer it to Sam or include it in the price.
