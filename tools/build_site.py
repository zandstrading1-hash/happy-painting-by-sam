"""Assemble the Happy Painting by Sam multi-page site from shared parts.

Run from anywhere:  python3 tools/build_site.py
Reads parts/*.html next to this file and overwrites the six pages in
the repo root (index, services, work, colour-lab, about, contact).
style.css, script.js and img/ are edited directly, not generated.

Page copy (headings, text, lists, FAQ, photos) lives in content/site.json as plain text, which the
client dashboard edits; content/schema.json says which fields it may change. Text is HTML-escaped
here, and *stars* in headings become <em>. Parts use {{path.to.value}} placeholders for it.
"""
import html, json, pathlib, re

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


def fill(tpl, ctx, **raw):
    """{{a.b.0.c}} -> escaped text from ctx, {{a.b|em}} -> with <em>, {{=name}} -> raw[name]."""
    def sub(m):
        if m.group(1):
            return raw[m.group(2)]
        v = ctx
        for k in m.group(2).split('.'):
            v = v[int(k)] if isinstance(v, list) else v[k]
        return em(v) if m.group(3) == 'em' else esc(v)
    pattern = r'\{\{(=?)([\w.]+)(?:\|(\w+))?\}\}'
    # Check the template, not the output: client text may itself contain "{{".
    leftover = re.sub(pattern, '', tpl)
    assert '{{' not in leftover, leftover[leftover.index('{{'):][:80]
    return re.sub(pattern, sub, tpl)

# Web3Forms access key for the estimate form. Enter the inbox the requests should go to at
# web3forms.com and the key is emailed there. Blank: the form opens the visitor's email app instead.
FORM_KEY = ''

PHONE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.3 0 .7-.2 1z"/></svg>'

PAGES = [  # (file, nav label)
    ('services.html', 'Services'),
    ('work.html', 'Our Work'),
    ('colour-lab.html', 'Colour Lab'),
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
def page_header(crumb, title_html, lede, extra=''):
    return f'''    <!-- ============ PAGE HEADER ============ -->
    <section class="ph">
      <div class="ph-art" aria-hidden="true"><span class="ph-stroke ph-stroke--o"></span><span class="ph-stroke ph-stroke--t"></span></div>
      <div class="wrap">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="index.html">Home</a><span aria-hidden="true">/</span><span aria-current="page">{crumb}</span></nav>
        <h1 class="ph-title">{title_html}</h1>
        <p class="ph-lede">{lede}</p>{extra}
      </div>
    </section>

'''


def cta_band(title=C['cta']['title'], text=C['cta']['text']):
    title, text = esc(title), esc(text)
    return f'''    <!-- ============ CTA ============ -->
    <section class="cta-band" aria-label="Get a free estimate">
      <div class="wrap cta-inner">
        <div>
          <h2 class="reveal split">{title}</h2>
          <p class="reveal">{text}</p>
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
    pages = '<ul><li><a href="services.html">Services</a></li><li><a href="work.html">Our Work</a></li><li><a href="colour-lab.html">Colour Lab</a></li><li><a href="about.html">About Sam</a></li><li><a href="contact.html">Free Estimate</a></li></ul>'
    f = re.sub(r'<h4>Services</h4>\s*<ul>.*?</ul>', '<h4>Pages</h4>\n          ' + pages, f, flags=re.S)
    return '  </main>\n\n' + f


def actionbar():
    a = P['actionbar']
    return must_replace(a, '<a href="#estimate" class="ab-main">', '<a href="contact.html" class="ab-main">')


def page(fname, key, active, body, footer_variant='', home=False):
    meta = C['pages'][key]
    doc = head(meta['title'], meta['description'], home) + header(active) + body + footer(footer_variant) + '\n' + actionbar()
    doc = doc.replace('\n\n\n', '\n\n')
    assert 'href="#estimate"' not in doc and 'href="#services"' not in doc, fname
    (OUT / fname).write_text(doc)
    return fname, len(doc)


def intro(crumb, key, extra=''):
    meta = C['pages'][key]
    return page_header(crumb, em(meta['heading']), esc(meta['lede']), extra)


def img(spec, cls=None):
    c = f'class="{cls}" ' if cls else ''
    return f'<img {c}src="{attr(spec["src"])}" alt="{attr(spec["alt"])}" loading="lazy" width="{spec["w"]}" height="{spec["h"]}" />'


# ================================================================ HOME
H = C['home']
hero = fill(P['hero'], H, hero_ticks='\n'.join(f'            <li>{esc(t)}</li>' for t in H['hero']['ticks']))
hero = must_replace(hero, '<a class="btn btn--orange btn--lg" href="#estimate">', '<a class="btn btn--orange btn--lg" href="contact.html">')

svc_cards = ''.join(
    fill(P['svc-card'], c, num=f'{i:02d}', src=attr(c['image']['src']), image=img(c['image']), link=attr(c['link']),
         items=''.join(f'<li>{esc(t)}</li>' for t in c['items']))
    for i, c in enumerate(H['services']['cards'], 1))
services = fill(P['services'], H, svc_cards=svc_cards)

teaser = '''    <!-- ============ WORK TEASER ============ -->
    <section class="teaser" aria-labelledby="teaser-title">
      <div class="wrap">
        <div class="sec-head sec-head--row">
          <div>
            <p class="eyebrow reveal">Recent work</p>
            <h2 id="teaser-title" class="reveal split">''' + esc(H['teaser']['title']) + '''</h2>
          </div>
          <a class="btn btn--line-ink reveal" href="work.html">See all ''' + str(len(C['gallery'])) + ''' projects <span class="arr">&rarr;</span></a>
        </div>
        <div class="teaser-grid">
''' + '\n'.join(f'          <a class="reveal" href="work.html">{img(t["image"])}<span>{esc(t["caption"])}</span></a>' for t in H['teaser']['items']) + '''
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
            <h2 id="lt-title">''' + esc(H['lab']['title']) + '''</h2>
            <p>''' + esc(H['lab']['text']) + '''</p>
            <a class="btn btn--ink" href="colour-lab.html">Open the Colour Lab <span class="arr">&rarr;</span></a>
          </div>
          <div class="lt-swatches" aria-hidden="true">''' + ''.join(f'<span style="--c:{c}"></span>' for c in swatches) + '''</div>
        </div>
      </div>
    </section>

'''

quote = fill(P['quote'], H, quote_words=' '.join(f'<span>{esc(w)}</span>' for w in H['quote']['text'].split()))
process = fill(P['process'], H)

home_body = hero + services + process + teaser + quote + lab_teaser + cta_band()
results = [page('index.html', 'home', 'index.html', home_body, home=True)]

# ================================================================ SERVICES
sd_html = ''
for i, s in enumerate(C['services']):
    media_cls = 'sd-media' + ('' if len(s['images']) > 1 else ' sd-media--single')
    media = ''.join(img(m, cls) for m, cls in zip(s['images'], ('m1', 'm2')))
    sd_html += f'''    <section class="sd{' sd--alt' if i % 2 else ''}" id="{s['id']}" aria-labelledby="{s['id']}-title">
      <div class="wrap sd-grid">
        <div class="{media_cls} reveal">{media}</div>
        <div class="sd-copy">
          <span class="sd-num reveal">{i + 1:02d}</span>
          <h2 id="{s['id']}-title" class="reveal split">{esc(s['title'])}</h2>
          <p class="sd-lede reveal">{esc(s['lede'])}</p>
          <h3 class="sd-sub reveal">What we paint</h3>
          <ul class="ticks reveal">{''.join(f'<li>{esc(t)}</li>' for t in s['items'])}</ul>
          <div class="sd-notes reveal">{''.join(f'<span>{esc(n)}</span>' for n in s['notes'])}</div>
          <a class="btn btn--orange reveal" href="contact.html?type={s['type']}">Get a free {s['type'].lower().rstrip('s')} estimate <span class="arr">&rarr;</span></a>
        </div>
      </div>
    </section>

'''
jump = '\n        <nav class="ph-jump" aria-label="Jump to a service">' + ''.join(f'<a href="#{s["id"]}">{esc(s["title"].replace(" painting", ""))}</a>' for s in C['services']) + '</nav>'
results.append(page('services.html', 'services', 'services.html', intro('Services', 'services', jump) + sd_html + cta_band()))

# ================================================================ WORK
gallery = fill(P['gallery'], C, gallery_items='\n'.join(
    f'          <figure class="shot" data-cat="{attr(" ".join(g["tags"]))}"><button>{img(g["image"])}</button><figcaption>{esc(g["caption"])}</figcaption></figure>'
    for g in C['gallery']))
gallery = re.sub(r'<div class="sec-head sec-head--row">\s*<div>.*?</div>\s*(<div class="filters)', r'<div class="sec-head sec-head--row">\n          \1', gallery, flags=re.S)
gallery = gallery.replace('<section class="work" id="work" aria-labelledby="work-title">', '<section class="work" id="work" aria-label="Project gallery">')
results.append(page('work.html', 'work', 'work.html', intro('Our Work', 'work') + gallery + P['lightbox'] + cta_band()))

# ================================================================ COLOUR LAB
lab = P['lab']
lab = re.sub(r'\s*<p class="eyebrow reveal">Colour Lab</p>\s*<h2 id="lab-title" class="reveal split">.*?</h2>', '', lab, flags=re.S)
lab = must_replace(lab, '<section class="lab" id="colour-lab" aria-labelledby="lab-title">', '<section class="lab" id="colour-lab" aria-label="Colour Lab">')
lab = must_replace(lab, '<a class="btn btn--ink lab-cta reveal" href="#estimate">', '<a class="btn btn--ink lab-cta reveal" href="contact.html?type=Interior">')
lab = must_replace(lab, 'Tap a swatch and watch the room get rolled. Your real pick happens with real paint chips, in your own light, at your free estimate.',
                   'Tap a swatch (or the room itself) and watch the wall get rolled. Your real pick happens with real paint chips, in your own light, at your free estimate.')
results.append(page('colour-lab.html', 'lab', 'colour-lab.html',
                    intro('Colour Lab', 'lab') + lab + P['myroom'] + cta_band(C['lab']['cta_title'], C['lab']['cta_text'])))

# ================================================================ ABOUT
A = C['about']
about_intro = '''    <!-- ============ ABOUT INTRO ============ -->
    <section class="about-intro" aria-labelledby="ai-title">
      <div class="wrap ai-grid">
        <div class="ai-media reveal">
''' + ''.join(f'          {img(m, cls)}\n' for m, cls in zip(A['images'], ('m1', 'm2'))) + '''        </div>
        <div class="ai-copy">
          <p class="eyebrow reveal">About</p>
          <h2 id="ai-title" class="reveal split">''' + esc(A['title']) + '''</h2>
''' + ''.join(f'          <p class="reveal">{esc(t)}</p>\n' for t in A['paragraphs']) + '''          <ul class="ticks reveal">''' + ''.join(f'<li>{esc(t)}</li>' for t in A['ticks']) + '''</ul>
          <a class="btn btn--orange reveal" href="contact.html">Book a free estimate <span class="arr">&rarr;</span></a>
        </div>
      </div>
    </section>

'''
area = P['area']
area = must_replace(area, '<section class="area" id="area" aria-labelledby="area-title">', '<section class="area area--light" id="area" aria-labelledby="area-title">')
results.append(page('about.html', 'about', 'about.html', intro('About', 'about') + about_intro + fill(P['promise'], A) + area + cta_band()))

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
        <div class="faq-list reveal">
''' + '\n'.join(f'          <details><summary>{esc(f["q"])}</summary><p>{esc(f["a"])}</p></details>' for f in C['faq']) + '''
        </div>
      </div>
    </section>

'''
results.append(page('contact.html', 'contact', 'contact.html', intro('Free Estimate', 'contact') + est + faq, footer_variant='footer--cream'))

for r in results:
    print(*r)
