"""Assemble the Happy Painting by Sam multi-page site from shared parts.

Run from anywhere:  python3 tools/build_site.py
Reads parts/*.html next to this file and overwrites the six pages in
the repo root (index, services, work, colour-lab, about, contact).
style.css, script.js and img/ are edited directly, not generated.

Page copy (headings, text, lists, FAQ, photos) lives in content/site.json as plain text, which the
client dashboard edits; content/schema.json says which fields it may change. Every other text and
photo on the pages is made editable too, by tools/page_edits.py. Text is HTML-escaped
here, and *stars* in headings become <em>. Parts use {{path.to.value}} placeholders for it.
"""
import html, json, pathlib, re

from page_edits import mark_page

PARTS = pathlib.Path(__file__).parent / 'parts'
OUT = pathlib.Path(__file__).resolve().parents[1]  # repo root
P = {f.stem: f.read_text() for f in PARTS.glob('*.html')}
C = json.loads((OUT / 'content' / 'site.json').read_text(encoding='utf-8'))


def esc(s):
    return html.escape(s, quote=False)


def attr(s):
    return html.escape(s).replace('&#x27;', "'")


def em(s):
    return re.sub(r'\*(.+?)\*', r'<em>\1</em>', esc(s))


def fill(tpl, ctx, prefix='', **raw):
    """{{a.b.0.c}} -> escaped text from ctx, {{a.b|em}} -> with <em>, {{=name}} -> raw[name],
    {{@a.b}} -> the value's full path in site.json (prefix + "." + a.b), for edit markers."""
    def sub(m):
        if m.group(1) == '=':
            return raw[m.group(2)]
        if m.group(1) == '@':
            return f'{prefix}.{m.group(2)}' if prefix else m.group(2)
        v = ctx
        for k in m.group(2).split('.'):
            v = v[int(k)] if isinstance(v, list) else v[k]
        return em(v) if m.group(3) == 'em' else esc(v)
    pattern = r'\{\{([=@]?)([\w.]+)(?:\|(\w+))?\}\}'
    # Check the template, not the output: client text may itself contain "{{".
    leftover = re.sub(pattern, '', tpl)
    assert '{{' not in leftover, leftover[leftover.index('{{'):][:80]
    return re.sub(pattern, sub, tpl)

# Edit markers: the client dashboard shows these pages and edits them in place. data-e marks text
# from site.json (by path), data-e-img a photo, data-e-bg a photo used as a CSS background,
# data-e-list a repeatable list and data-e-item each entry in it, data-e-tags a gallery item's filters.
def E(path, fmt=None):
    return f' data-e="{path}"' + (f' data-e-fmt="{fmt}"' if fmt else '')


def L(path):
    return f' data-e-list="{path}"'


def I(path):
    return f' data-e-item="{path}"'


def text_items(path, items, tag='li', sep=''):
    return sep.join(f'<{tag}{I(f"{path}.{i}")}{E(f"{path}.{i}")}>{esc(t)}</{tag}>' for i, t in enumerate(items))


# Web3Forms access key for the estimate form. Enter the inbox the requests should go to at
# web3forms.com and the key is emailed there. Blank: the form opens the visitor's email app instead.
FORM_KEY = ''

PHONE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.3 0 .7-.2 1z"/></svg>'

PAGES = [  # (file, nav label)
    ('services.html', 'Services'),
    ('work.html', 'Our Work'),
    ('colours.html', 'Colour Lab'),
    ('about.html', 'About'),
]


def must_replace(s, old, new, count=1):
    assert s.count(old) == count, (old[:80], s.count(old))
    return s.replace(old, new)


# ---------------------------------------------------------------- head
def head(title, desc, home=False):
    h = P['head']
    h = re.sub(r'<title>.*?</title>', lambda m: f'<title>{esc(title)}</title>', h)
    title, desc = attr(title), attr(desc)
    h = re.sub(r'(<meta name="description" content=")[^"]*(")', lambda m: m.group(1) + desc + m.group(2), h)
    h = re.sub(r'(<meta property="og:title" content=")[^"]*(")', lambda m: m.group(1) + title + m.group(2), h)
    h = re.sub(r'(<meta property="og:description" content=")[^"]*(")', lambda m: m.group(1) + desc + m.group(2), h)
    if not home:
        h = re.sub(r'\s*<script type="application/ld\+json">.*?</script>', '', h, flags=re.S)
    return h + '<body>\n\n  <a class="skip" href="#main">Skip to content</a>\n\n'


# ---------------------------------------------------------------- header
def header(active):
    h = P['header']
    h = h.replace('<a href="#top" class="logo"', '<a href="index.html" class="logo"')
    nav = '\n'.join(
        f'        <a href="{f}"' + (' class="is-active" aria-current="page"' if f == active else '') + f'>{label}</a>'
        for f, label in PAGES)
    h = re.sub(r'(<nav class="nav" aria-label="Primary">\n).*?(\n      </nav>)', lambda m: m.group(1) + nav + m.group(2), h, flags=re.S)
    h = must_replace(h, '<a class="btn btn--orange btn--sm" href="#estimate">Free estimate</a>',
                     '<a class="btn btn--orange btn--sm" href="contact.html">Free estimate</a>')
    menu_items = [('index.html', 'Home')] + PAGES + [('contact.html', 'Free Estimate')]
    menu = '\n'.join(f'      <a href="{f}"' + (' aria-current="page"' if f == active else '') + f'><span>{i:02d}</span>{label}</a>'
                     for i, (f, label) in enumerate(menu_items, 1))
    h = re.sub(r'(<nav class="menu-nav" aria-label="Mobile">\n).*?(\n    </nav>)', lambda m: m.group(1) + menu + m.group(2), h, flags=re.S)
    return h.replace('  <main id="main">\n', '') + '  <main id="main">\n\n'


# ---------------------------------------------------------------- page header
def page_header(crumb, title_html, lede, extra='', key=''):
    return f'''    <!-- ============ PAGE HEADER ============ -->
    <section class="ph">
      <div class="ph-art" aria-hidden="true"><span class="ph-stroke ph-stroke--o"></span><span class="ph-stroke ph-stroke--t"></span></div>
      <div class="wrap">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="index.html">Home</a><span aria-hidden="true">/</span><span aria-current="page">{crumb}</span></nav>
        <h1 class="ph-title"{E(f'pages.{key}.heading', 'em')}>{title_html}</h1>
        <p class="ph-lede"{E(f'pages.{key}.lede')}>{lede}</p>{extra}
      </div>
    </section>

'''


def cta_band(title=C['cta']['title'], text=C['cta']['text'], paths=('cta.title', 'cta.text')):
    title, text = esc(title), esc(text)
    tmark, xmark = E(paths[0]), E(paths[1])
    return f'''    <!-- ============ CTA ============ -->
    <section class="cta-band" aria-label="Get a free estimate">
      <div class="wrap cta-inner">
        <div>
          <h2 class="reveal split"{tmark}>{title}</h2>
          <p class="reveal"{xmark}>{text}</p>
        </div>
        <div class="cta-actions reveal">
          <a class="btn btn--ink btn--lg" href="contact.html">Get my free estimate <span class="arr">&rarr;</span></a>
          <a class="btn btn--line-ink btn--lg" href="tel:+15199917783">Call 519-991-7783</a>
        </div>
      </div>
    </section>

'''


# ---------------------------------------------------------------- footer
def footer(variant=''):
    f = P['footer']
    f = must_replace(f, '<footer class="footer">', f'<footer class="footer{(" " + variant) if variant else ""}">')
    f = must_replace(f, '<a href="#estimate" class="foot-big">', '<a href="contact.html" class="foot-big">')
    f = must_replace(f, '<a href="#top" class="logo logo--foot" aria-label="Back to top">', '<a href="index.html" class="logo logo--foot" aria-label="Happy Painting by Sam, home">')
    pages = '<ul><li><a href="services.html">Services</a></li><li><a href="work.html">Our Work</a></li><li><a href="colours.html">Colour Lab</a></li><li><a href="about.html">About Sam</a></li><li><a href="contact.html">Free Estimate</a></li></ul>'
    f = re.sub(r'<h4>Services</h4>\s*<ul>.*?</ul>', '<h4>Pages</h4>\n          ' + pages, f, flags=re.S)
    return '  </main>\n\n' + f


def actionbar():
    a = P['actionbar']
    return must_replace(a, '<a href="#estimate" class="ab-main">', '<a href="contact.html" class="ab-main">')


PAGE_FILES = ('index', 'services', 'work', 'colours', 'about', 'contact')


def clean_links(doc):
    # GitHub Pages serves /services from services.html, so links leave off ".html"
    return re.sub(r'href="(%s)\.html(?=["#?])' % '|'.join(PAGE_FILES),
                  lambda m: 'href="/' + ('' if m[1] == 'index' else m[1]), doc)


def page(fname, key, active, body, footer_variant='', home=False):
    meta = C['pages'][key]
    doc = head(meta['title'], meta['description'], home) + header(active) + body + footer(footer_variant) + '\n' + P['lightbox'] + actionbar()
    doc = clean_links(doc.replace('\n\n\n', '\n\n'))
    doc = mark_page(doc, fname.removesuffix('.html'), C.get('free', {}))
    assert 'href="#estimate"' not in doc and 'href="#services"' not in doc, fname
    (OUT / fname).write_text(doc)
    return fname, len(doc)


def intro(crumb, key, extra=''):
    meta = C['pages'][key]
    return page_header(crumb, em(meta['heading']), esc(meta['lede']), extra, key)


def img(spec, cls=None, path=None, item=False):
    c = f'class="{cls}" ' if cls else ''
    if path:
        c += (f'data-e-item="{path}" ' if item else '') + f'data-e-img="{path}" '
    return f'<img {c}src="{attr(spec["src"])}" alt="{attr(spec["alt"])}" loading="lazy" width="{spec["w"]}" height="{spec["h"]}" />'


# ================================================================ HOME
H = C['home']
hero = fill(P['hero'], H, 'home', hero_ticks=text_items('home.hero.ticks', H['hero']['ticks'], sep='\n')
            .replace('<li', '            <li'))
hero = must_replace(hero, '<a class="btn btn--orange btn--lg" href="#estimate">', '<a class="btn btn--orange btn--lg" href="contact.html">')

svc_cards = ''.join(
    fill(P['svc-card'], c, f'home.services.cards.{i - 1}', base=f'home.services.cards.{i - 1}', num=f'{i:02d}',
         src=attr(c['image']['src']), image=img(c['image'], path=f'home.services.cards.{i - 1}.image'), link=attr(c['link']),
         items=text_items(f'home.services.cards.{i - 1}.items', c['items']))
    for i, c in enumerate(H['services']['cards'], 1))
services = fill(P['services'], H, 'home', svc_cards=svc_cards)

teaser = '''    <!-- ============ WORK TEASER ============ -->
    <section class="teaser" aria-labelledby="teaser-title">
      <div class="wrap">
        <div class="sec-head sec-head--row">
          <div>
            <p class="eyebrow reveal">Recent work</p>
            <h2 id="teaser-title" class="reveal split"''' + E('home.teaser.title') + '>' + esc(H['teaser']['title']) + '''</h2>
          </div>
          <a class="btn btn--line-ink reveal" href="work.html">See all ''' + str(len(C['gallery'])) + ''' projects <span class="arr">&rarr;</span></a>
        </div>
        <div class="teaser-grid"''' + L('home.teaser.items') + '''>
''' + '\n'.join(f'          <a class="reveal" href="work.html"{I(f"home.teaser.items.{i}")}>{img(t["image"], path=f"home.teaser.items.{i}.image")}<span{E(f"home.teaser.items.{i}.caption")}>{esc(t["caption"])}</span></a>' for i, t in enumerate(H['teaser']['items'])) + '''
        </div>
      </div>
    </section>

'''

swatches = ['#1fa3ad', '#2f5f7f', '#8fa58a', '#e9b949', '#c27a5a', '#6e4a5e', '#263a57']
lab_teaser = '''    <!-- ============ COLOUR LAB TEASER ============ -->
    <section class="lab-teaser" aria-labelledby="lt-title">
      <div class="wrap">
        <div class="lt-inner reveal">
          <div>
            <p class="eyebrow">Colour Lab</p>
            <h2 id="lt-title"''' + E('home.lab.title') + '>' + esc(H['lab']['title']) + '''</h2>
            <p''' + E('home.lab.text') + '>' + esc(H['lab']['text']) + '''</p>
            <a class="btn btn--ink" href="colours.html">Open the Colour Lab <span class="arr">&rarr;</span></a>
          </div>
          <div class="lt-swatches" aria-hidden="true">''' + ''.join(f'<span style="--c:{c}"></span>' for c in swatches) + '''</div>
        </div>
      </div>
    </section>

'''

quote = fill(P['quote'], H, 'home', quote_words=' '.join(f'<span>{esc(w)}</span>' for w in H['quote']['text'].split()))
process = fill(P['process'], H, 'home')

home_body = hero + services + process + teaser + quote + lab_teaser + cta_band()
results = [page('index.html', 'home', 'index.html', home_body, home=True)]

# ================================================================ SERVICES
sd_html = ''
for i, s in enumerate(C['services']):
    media_cls = 'sd-media' + ('' if len(s['images']) > 1 else ' sd-media--single')
    media = ''.join(img(m, cls, f'services.{i}.images.{j}', item=True) for j, (m, cls) in enumerate(zip(s['images'], ('m1', 'm2'))))
    sd_html += f'''    <section class="sd{' sd--alt' if i % 2 else ''}" id="{s['id']}" aria-labelledby="{s['id']}-title">
      <div class="wrap sd-grid">
        <div class="{media_cls} reveal"{L(f'services.{i}.images')}>{media}</div>
        <div class="sd-copy">
          <span class="sd-num reveal">{i + 1:02d}</span>
          <h2 id="{s['id']}-title" class="reveal split"{E(f'services.{i}.title')}>{esc(s['title'])}</h2>
          <p class="sd-lede reveal"{E(f'services.{i}.lede')}>{esc(s['lede'])}</p>
          <h3 class="sd-sub reveal">What we paint</h3>
          <ul class="ticks reveal"{L(f'services.{i}.items')}>{text_items(f'services.{i}.items', s['items'])}</ul>
          <div class="sd-notes reveal"{L(f'services.{i}.notes')}>{text_items(f'services.{i}.notes', s['notes'], 'span')}</div>
          <a class="btn btn--orange reveal" href="contact.html?type={s['type']}">Get a free {s['type'].lower().rstrip('s')} estimate <span class="arr">&rarr;</span></a>
        </div>
      </div>
    </section>

'''
jump = '\n        <nav class="ph-jump" aria-label="Jump to a service">' + ''.join(f'<a href="#{s["id"]}">{esc(s["title"].replace(" painting", ""))}</a>' for s in C['services']) + '</nav>'
results.append(page('services.html', 'services', 'services.html', intro('Services', 'services', jump) + sd_html + cta_band()))

# ================================================================ WORK
gallery = fill(P['gallery'], C, gallery_items='\n'.join(
    f'          <figure class="shot" data-cat="{attr(" ".join(g["tags"]))}"{I(f"gallery.{i}")} data-e-tags="gallery.{i}.tags">'
    f'<button>{img(g["image"], path=f"gallery.{i}.image")}</button><figcaption{E(f"gallery.{i}.caption")}>{esc(g["caption"])}</figcaption></figure>'
    for i, g in enumerate(C['gallery'])))
gallery = re.sub(r'<div class="sec-head sec-head--row">\s*<div>.*?</div>\s*(<div class="filters)', r'<div class="sec-head sec-head--row">\n          \1', gallery, flags=re.S)
gallery = gallery.replace('<section class="work" id="work" aria-labelledby="work-title">', '<section class="work" id="work" aria-label="Project gallery">')
results.append(page('work.html', 'work', 'work.html', intro('Our Work', 'work') + gallery + cta_band()))

# ================================================================ COLOUR LAB
lab = P['lab']
lab = re.sub(r'\s*<p class="eyebrow reveal">Colour Lab</p>\s*<h2 id="lab-title" class="reveal split">.*?</h2>', '', lab, flags=re.S)
lab = must_replace(lab, '<section class="lab" id="colour-lab" aria-labelledby="lab-title">', '<section class="lab" id="colour-lab" aria-label="Colour Lab">')
lab = must_replace(lab, '<a class="btn btn--ink lab-cta reveal" href="#estimate">', '<a class="btn btn--ink lab-cta reveal" href="contact.html?type=Interior">')
lab = must_replace(lab, 'Tap a swatch and watch the room get rolled. Your real pick happens with real paint chips, in your own light, at your free estimate.',
                   'Tap a swatch (or the room itself) and watch the walls get rolled. Your real pick happens with real paint chips, in your own light, at your free estimate.')
results.append(page('colours.html', 'lab', 'colours.html',
                    intro('Colour Lab', 'lab') + lab + cta_band(C['lab']['cta_title'], C['lab']['cta_text'], ('lab.cta_title', 'lab.cta_text'))))

# ================================================================ ABOUT
A = C['about']
about_intro = '''    <!-- ============ ABOUT INTRO ============ -->
    <section class="about-intro" aria-labelledby="ai-title">
      <div class="wrap ai-grid">
        <div class="ai-media reveal"''' + L('about.images') + '''>
''' + ''.join(f'          {img(m, cls, f"about.images.{j}", item=True)}\n' for j, (m, cls) in enumerate(zip(A['images'], ('m1', 'm2')))) + '''        </div>
        <div class="ai-copy"''' + L('about.paragraphs') + '''>
          <p class="eyebrow reveal">About</p>
          <h2 id="ai-title" class="reveal split"''' + E('about.title') + '>' + esc(A['title']) + '''</h2>
''' + ''.join(f'          <p class="reveal"{I(f"about.paragraphs.{i}")}{E(f"about.paragraphs.{i}")}>{esc(t)}</p>\n' for i, t in enumerate(A['paragraphs'])) + '''          <ul class="ticks reveal"''' + L('about.ticks') + '>' + text_items('about.ticks', A['ticks']) + '''</ul>
          <a class="btn btn--orange reveal" href="contact.html">Book a free estimate <span class="arr">&rarr;</span></a>
        </div>
      </div>
    </section>

'''
area = P['area']
area = must_replace(area, '<section class="area" id="area" aria-labelledby="area-title">', '<section class="area area--light" id="area" aria-labelledby="area-title">')
results.append(page('about.html', 'about', 'about.html', intro('About', 'about') + about_intro + fill(P['promise'], A, 'about') + area + cta_band()))

# ================================================================ CONTACT
est = P['estimate']
est = re.sub(r'<p class="eyebrow reveal">Free estimate</p>\s*<h2 id="est-title" class="reveal split">.*?</h2>',
             '<h2 id="est-title" class="reveal split">Tell Sam about the job.</h2>', est, flags=re.S)
est = must_replace(est, 'Tell us a little about the job and your email app will open with everything filled in. Or skip the form and reach Sam directly.',
                   'Fill in the form and it goes straight to Sam. Or skip the form and reach him directly.' if FORM_KEY else
                   'Fill in the form and your email app will open with everything ready to send. Or skip the form and reach Sam directly.')
est = must_replace(est, '<form class="est-form reveal" novalidate>', f'<form class="est-form reveal" novalidate data-key="{FORM_KEY}">')
faq = '''    <!-- ============ FAQ ============ -->
    <section class="faq" aria-labelledby="faq-title">
      <div class="wrap faq-grid">
        <div>
          <p class="eyebrow reveal">Questions</p>
          <h2 id="faq-title" class="reveal split">Good to know.</h2>
        </div>
        <div class="faq-list reveal"''' + L('faq') + '''>
''' + '\n'.join(f'          <details{I(f"faq.{i}")}><summary{E(f"faq.{i}.q")}>{esc(f["q"])}</summary><p{E(f"faq.{i}.a")}>{esc(f["a"])}</p></details>' for i, f in enumerate(C['faq'])) + '''
        </div>
      </div>
    </section>

'''
results.append(page('contact.html', 'contact', 'contact.html', intro('Free Estimate', 'contact') + est + faq, footer_variant='footer--cream'))

# the Colour Lab used to live at colour-lab.html; keep old links and search results working
(OUT / 'colour-lab.html').write_text('''<!DOCTYPE html>
<html lang="en-CA">
<head>
  <meta charset="utf-8" />
  <title>Colour Lab | Happy Painting by Sam</title>
  <meta name="robots" content="noindex" />
  <meta http-equiv="refresh" content="0; url=/colours" />
  <script>location.replace('/colours' + location.search + location.hash);</script>
</head>
<body><p>The Colour Lab has moved to <a href="/colours">happypaintingbysam.ca/colours</a>.</p></body>
</html>
''')

for r in results:
    print(*r)
