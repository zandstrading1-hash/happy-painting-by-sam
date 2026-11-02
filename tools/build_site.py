"""Assemble the Happy Painting by Sam multi-page site from shared parts.

Run from anywhere:  python3 tools/build_site.py
Reads parts/*.html next to this file and overwrites the six pages in
the repo root (index, services, work, colour-lab, about, contact).
style.css, script.js and img/ are edited directly, not generated.
"""
import pathlib, re

PARTS = pathlib.Path(__file__).parent / 'parts'
OUT = pathlib.Path(__file__).resolve().parents[1]  # repo root
P = {f.stem: f.read_text() for f in PARTS.glob('*.html')}

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
    h = re.sub(r'<title>.*?</title>', f'<title>{title}</title>', h)
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


def cta_band(title='Ready for walls you\'re happy with?', text='Free, no-pressure estimates across Windsor and Essex County. Sam will come out, look at the job and give you an honest quote.'):
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


def page(fname, title, desc, active, body, footer_variant='', home=False):
    html = head(title, desc, home) + header(active) + body + footer(footer_variant) + '\n' + actionbar()
    html = html.replace('\n\n\n', '\n\n')
    assert 'href="#estimate"' not in html and 'href="#services"' not in html, fname
    (OUT / fname).write_text(html)
    return fname, len(html)


# ================================================================ HOME
hero = P['hero']
hero = must_replace(hero, '<a class="btn btn--orange btn--lg" href="#estimate">', '<a class="btn btn--orange btn--lg" href="contact.html">')

services = P['services']
for svc, anchor, label in [('Interior', 'interior', 'interior'), ('Cabinets', 'cabinets', 'cabinet'), ('Exterior', 'exterior', 'exterior'), ('Commercial', 'commercial', 'commercial')]:
    services = re.sub(rf'<a href="#estimate" class="svc-link" data-service="{svc}">[^<]*</a>',
                      f'<a href="services.html#{anchor}" class="svc-link">More on {label} painting &rarr;</a>', services)
assert '#estimate' not in services

teaser_items = [
    ('open-plan-blue-walls', 'Open-plan blue walls', 900, 1200), ('kitchen-cabinet-refinish', 'Kitchen cabinet refinish', 1200, 900),
    ('exterior-stucco-brick', 'Exterior stucco &amp; brick', 900, 1200), ('entry-hall-stairs', 'Entry hall &amp; stairs', 1200, 900),
    ('bedroom-accent-wall', 'Bedroom accent wall', 1200, 900), ('warm-white-cabinets', 'Warm white cabinets', 1200, 900)]
teaser = '''    <!-- ============ WORK TEASER ============ -->
    <section class="teaser" aria-labelledby="teaser-title">
      <div class="wrap">
        <div class="sec-head sec-head--row">
          <div>
            <p class="eyebrow reveal">Recent work</p>
            <h2 id="teaser-title" class="reveal split">Fresh off the drop cloth.</h2>
          </div>
          <a class="btn btn--line-ink reveal" href="work.html">See all 16 projects <span class="arr">&rarr;</span></a>
        </div>
        <div class="teaser-grid">
''' + '\n'.join(f'          <a class="reveal" href="work.html"><img src="img/{f}.webp" alt="{alt}" loading="lazy" width="{w}" height="{h}" /><span>{alt}</span></a>' for f, alt, w, h in teaser_items) + '''
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
            <h2 id="lt-title">Can't pick a colour? Take one for a spin.</h2>
            <p>Tap a swatch and watch a room get rolled in it, then switch the trim between crisp white and modern black.</p>
            <a class="btn btn--ink" href="colour-lab.html">Open the Colour Lab <span class="arr">&rarr;</span></a>
          </div>
          <div class="lt-swatches" aria-hidden="true">''' + ''.join(f'<span style="--c:{c}"></span>' for c in swatches) + '''</div>
        </div>
      </div>
    </section>

'''

quote = P['quote']
process = P['process']

home_body = hero + P['marquee'] + services + process + teaser + quote + lab_teaser + cta_band()
results = [page('index.html', 'Happy Painting by Sam | Windsor &amp; Essex County Painters',
                'Interior, exterior and commercial painting in Windsor and Essex County, Ontario. Sam runs every job personally: free estimates, sharp lines and a full clean-up. Call or text 519-991-7783.',
                'index.html', home_body, home=True)]

# ================================================================ SERVICES
SERVICES = [
    dict(id='interior', n='01', h='Interior painting', alt=False,
         m1=('open-plan-blue-walls', 'Open-plan living area freshly painted in a deep blue', 900, 1200),
         m2=('bedroom-closet-trim', 'Bedroom with fresh walls, closet doors and trim', 1200, 900),
         lede='Walls, ceilings, trim, doors and full-room refreshes. Whether it\'s one bedroom or the whole house, the prep is careful and the lines are crisp.',
         items=['Living rooms &amp; bedrooms', 'Kitchens &amp; bathrooms', 'Walls &amp; ceilings', 'Trim, doors &amp; baseboards', 'Basements &amp; hallways', 'Accent &amp; feature walls'],
         notes=['Sharp lines, guaranteed', 'Most rooms done in a day', 'Floors &amp; furniture protected'], type='Interior'),
    dict(id='cabinets', n='02', h='Kitchen cabinets', alt=True,
         m1=('kitchen-cabinet-refinish', 'Kitchen with freshly painted white shaker cabinets', 1200, 900),
         m2=('warm-white-cabinets', 'Warm white upper cabinets and range hood', 1200, 900),
         lede='Kitchen cabinets, vanities and built-ins brought back with a clean, fresh finish. A big change for the room without tearing anything out.',
         items=['Kitchen cabinet refinishing', 'Vanities &amp; built-ins', 'Millwork &amp; trim detail', 'Basement kitchenettes'],
         notes=['Free in-person quote', 'Full clean-up'], type='Cabinets'),
    dict(id='exterior', n='03', h='Exterior painting', alt=False,
         m1=('exterior-stucco-brick', 'Home exterior with painted stucco and stone', 900, 1200), m2=None,
         lede='Curb appeal that holds up to Essex County summers and winters, from siding and stucco to the deck out back.',
         items=['Siding &amp; stucco', 'Brick painting &amp; staining', 'Trim, soffits &amp; doors', 'Decks &amp; fences', 'Porches &amp; garages'],
         notes=['Free in-person quote', 'On time, on schedule'], type='Exterior'),
    dict(id='commercial', n='04', h='Commercial painting', alt=True,
         m1=('hallway-doors-trim', 'Hallway with doors and trim freshly painted, floors protected', 900, 1200),
         m2=('basement-side-entry', 'Freshly painted side entry and stairwell', 1200, 900),
         lede='Offices, storefronts, rentals and listings, painted on schedule so your space gets back to business.',
         items=['Offices &amp; retail spaces', 'Property management &amp; rental turnovers', 'Real-estate refreshes', 'Cabinet &amp; millwork finishes'],
         notes=['On time, on schedule', 'Full clean-up'], type='Commercial'),
]


def img(spec, cls):
    f, alt, w, h = spec
    return f'<img class="{cls}" src="img/{f}.webp" alt="{alt}" loading="lazy" width="{w}" height="{h}" />'


sd_html = ''
for s in SERVICES:
    media_cls = 'sd-media' + ('' if s['m2'] else ' sd-media--single')
    media = img(s['m1'], 'm1') + (img(s['m2'], 'm2') if s['m2'] else '')
    sd_html += f'''    <section class="sd{' sd--alt' if s['alt'] else ''}" id="{s['id']}" aria-labelledby="{s['id']}-title">
      <div class="wrap sd-grid">
        <div class="{media_cls} reveal">{media}</div>
        <div class="sd-copy">
          <span class="sd-num reveal">{s['n']}</span>
          <h2 id="{s['id']}-title" class="reveal split">{s['h']}</h2>
          <p class="sd-lede reveal">{s['lede']}</p>
          <h3 class="sd-sub reveal">What we paint</h3>
          <ul class="ticks reveal">{''.join(f'<li>{i}</li>' for i in s['items'])}</ul>
          <div class="sd-notes reveal">{''.join(f'<span>{n}</span>' for n in s['notes'])}</div>
          <a class="btn btn--orange reveal" href="contact.html?type={s['type']}">Get a free {s['type'].lower().rstrip('s')} estimate <span class="arr">&rarr;</span></a>
        </div>
      </div>
    </section>

'''
jump = '\n        <nav class="ph-jump" aria-label="Jump to a service">' + ''.join(f'<a href="#{s["id"]}">{s["h"].replace(" painting", "")}</a>' for s in SERVICES) + '</nav>'
results.append(page('services.html', 'Painting Services | Happy Painting by Sam, Windsor',
                    'Interior, exterior, kitchen cabinet and commercial painting in Windsor and Essex County. Free estimates from Sam. Call or text 519-991-7783.',
                    'services.html',
                    page_header('Services', 'Every surface, <em>inside and out.</em>',
                                'Interior, cabinet, exterior and commercial painting across Windsor and Essex County, with every job run by Sam himself.', jump)
                    + sd_html + cta_band()))

# ================================================================ WORK
gallery = P['gallery']
gallery = re.sub(r'<div class="sec-head sec-head--row">\s*<div>.*?</div>\s*(<div class="filters)', r'<div class="sec-head sec-head--row">\n          \1', gallery, flags=re.S)
gallery = gallery.replace('<section class="work" id="work" aria-labelledby="work-title">', '<section class="work" id="work" aria-label="Project gallery">')
results.append(page('work.html', 'Our Work | Happy Painting by Sam, Windsor',
                    'Recent painting projects by Happy Painting by Sam in Windsor and Essex County: kitchens, cabinets, trim, feature walls and exteriors.',
                    'work.html',
                    page_header('Our Work', 'Fresh off the <em>drop cloth.</em>',
                                'Real projects from around Windsor and Essex County: kitchens, cabinets, trim, feature walls and exteriors. Tap any photo to see it bigger.')
                    + gallery + P['lightbox'] + cta_band()))

# ================================================================ COLOUR LAB
lab = P['lab']
lab = re.sub(r'\s*<p class="eyebrow reveal">Colour Lab</p>\s*<h2 id="lab-title" class="reveal split">.*?</h2>', '', lab, flags=re.S)
lab = must_replace(lab, '<section class="lab" id="colour-lab" aria-labelledby="lab-title">', '<section class="lab" id="colour-lab" aria-label="Colour Lab">')
lab = must_replace(lab, '<a class="btn btn--ink lab-cta reveal" href="#estimate">', '<a class="btn btn--ink lab-cta reveal" href="contact.html?type=Interior">')
lab = must_replace(lab, 'Tap a swatch and watch the room get rolled. Your real pick happens with real paint chips, in your own light, at your free estimate.',
                   'Tap a swatch (or the room itself) and watch the wall get rolled. Your real pick happens with real paint chips, in your own light, at your free estimate.')
results.append(page('colour-lab.html', 'Colour Lab | Happy Painting by Sam, Windsor',
                    'Try wall colours on a living room before you paint. A Colour Lab from Happy Painting by Sam, painters in Windsor and Essex County.',
                    'colour-lab.html',
                    page_header('Colour Lab', 'Take a colour <em>for a spin.</em>',
                                'Nine colours, one living room and a roller. Find the vibe you like, then bring it to your free estimate.')
                    + lab + cta_band('Found one you love?', 'Send it to Sam with your free estimate request and he\'ll talk you through finishes and real paint chips.')))

# ================================================================ ABOUT
about_intro = '''    <!-- ============ ABOUT INTRO ============ -->
    <section class="about-intro" aria-labelledby="ai-title">
      <div class="wrap ai-grid">
        <div class="ai-media reveal">
          <img class="m1" src="img/stairwell-in-progress.webp" alt="Stairwell mid-job with floors protected" loading="lazy" width="900" height="1200" />
          <img class="m2" src="img/bedroom-accent-wall.webp" alt="Bedroom accent wall being painted, floor covered" loading="lazy" width="1200" height="900" />
        </div>
        <div class="ai-copy">
          <p class="eyebrow reveal">About</p>
          <h2 id="ai-title" class="reveal split">One painter who knows your project.</h2>
          <p class="reveal">Happy Painting by Sam is a residential and commercial painting company based in Windsor, Ontario. Sam runs every job personally. He's the one who comes out to look at your space, gives you an honest quote and makes sure the final coat is right, with clear communication the whole way through.</p>
          <p class="reveal">That's the idea behind the name: the job isn't finished until you're happy with it.</p>
          <ul class="ticks reveal"><li>Free, honest estimates</li><li>Floors &amp; furniture protected</li><li>Sharp lines, guaranteed</li><li>Full clean-up before he leaves</li></ul>
          <a class="btn btn--orange reveal" href="contact.html">Book a free estimate <span class="arr">&rarr;</span></a>
        </div>
      </div>
    </section>

'''
area = P['area']
area = must_replace(area, '<section class="area" id="area" aria-labelledby="area-title">', '<section class="area area--light" id="area" aria-labelledby="area-title">')
results.append(page('about.html', 'About Sam | Happy Painting by Sam, Windsor',
                    'Happy Painting by Sam is a Windsor, Ontario painting company. Sam runs every job personally, from free estimate to final coat.',
                    'about.html',
                    page_header('About', 'Run by Sam. <em>Every job.</em>',
                                'Quality work, happy homes. Here\'s what that looks like on a job, and where in Essex County Sam paints.')
                    + about_intro + P['promise'] + area + cta_band()))

# ================================================================ CONTACT
est = P['estimate']
est = re.sub(r'<p class="eyebrow reveal">Free estimate</p>\s*<h2 id="est-title" class="reveal split">.*?</h2>',
             '<h2 id="est-title" class="reveal split">Tell Sam about the job.</h2>', est, flags=re.S)
est = must_replace(est, 'Tell us a little about the job and your email app will open with everything filled in. Or skip the form and reach Sam directly.',
                   'Fill in the form and your email app will open with everything ready to send. Or skip the form and reach Sam directly.')
FAQ = [
    ('Are estimates really free?', 'Yes. Sam comes out, looks at the project in person and gives you an honest quote at no cost and with no obligation.'),
    ('How long does a typical room take?', 'Most residential rooms are finished in a single day. For bigger jobs, ask Sam for a timeline when he quotes.'),
    ('Will my floors and furniture be protected?', 'Yes. Floors and furniture are covered with drop cloths and edges are taped before painting starts, and everything is cleaned up before Sam leaves.'),
    ('Which areas do you serve?', 'Windsor, Tecumseh, LaSalle, Lakeshore, Essex, Amherstburg, Belle River and Kingsville. Somewhere else in the county? Ask anyway.'),
    ('Do you paint exteriors and commercial spaces?', 'Yes. Exteriors include siding, stucco, brick, trim, soffits, doors, decks, fences, porches and garages. Commercial work includes offices, retail, rental turnovers and real-estate refreshes.'),
    ('What if I\'m not happy with the result?', 'Then the job isn\'t done. Sam doesn\'t consider a job finished until you\'re happy with it. It\'s in the name.'),
]
faq = '''    <!-- ============ FAQ ============ -->
    <section class="faq" aria-labelledby="faq-title">
      <div class="wrap faq-grid">
        <div>
          <p class="eyebrow reveal">Questions</p>
          <h2 id="faq-title" class="reveal split">Good to know.</h2>
        </div>
        <div class="faq-list reveal">
''' + '\n'.join(f'          <details><summary>{q}</summary><p>{a}</p></details>' for q, a in FAQ) + '''
        </div>
      </div>
    </section>

'''
results.append(page('contact.html', 'Free Estimate | Happy Painting by Sam, Windsor',
                    'Get a free painting estimate in Windsor and Essex County. Call or text Sam at 519-991-7783 or send the form.',
                    'contact.html',
                    page_header('Free Estimate', 'Let\'s get your walls <em>happy.</em>',
                                'Free, no-obligation estimates across Windsor and Essex County. Use the form, or call or text Sam directly.')
                    + est + faq, footer_variant='footer--cream'))

for r in results:
    print(*r)
