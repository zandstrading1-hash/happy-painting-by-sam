"""Makes every piece of text and every photo on a built page editable from the client dashboard,
and applies the client's edits to them.

Copy that lives in content/site.json is already marked by build_site.py (data-e and friends).
Everything else on the page (headings in the templates, buttons, menus, footer, hero photos...)
gets a key worked out from the template itself, and the client's changes are stored under that
key in site.json's "free" block:

  free.text[key]  new wording for an element's own text (child elements are left alone)
  free.img[key]   a different photo for an <img>, or null to remove it
  free.add[key]   photos the client added below a spot on the page

A key comes from the element's tag and original text (or a photo's original file), so it stays
put when other parts of the page change. Header, footer and mobile-bar keys are shared by every
page; the rest belong to one page. Edits for keys that no longer exist are simply not shown.
"""
import hashlib, html, re
from html.parser import HTMLParser

VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}
SKIP_TAGS = {'head', 'script', 'style', 'svg', 'noscript', 'textarea', 'select', 'option', 'template', 'title'}
SKIP_CLASSES = {'lightbox'}
SHARED_TAGS = {'header', 'footer'}
SHARED_CLASSES = {'actionbar'}
# Added photos go after the nearest of these around the spot the client picked (frame.js matches it).
BLOCK = {'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'figure', 'details', 'blockquote', 'div', 'section', 'dl', 'table', 'form'}
KEY = re.compile(r'^[kpe][0-9a-f]{10}(-\d{1,3})?$')


class Node:
    __slots__ = ('tag', 'attrs', 'start', 'tag_end', 'end', 'parent', 'runs', 'skip', 'in_e', 'shared')

    def __init__(self, tag, attrs, start, tag_end, parent):
        self.tag, self.attrs, self.start, self.tag_end, self.parent = tag, dict(attrs), start, tag_end, parent
        self.end = tag_end
        self.runs = []  # [start, end] spans of the element's own text, in source order
        classes = set((self.attrs.get('class') or '').split())
        p = parent
        self.skip = tag in SKIP_TAGS or bool(classes & SKIP_CLASSES) or 'data-noedit' in self.attrs or bool(p and p.skip)
        self.in_e = bool(p and (p.in_e or 'data-e' in p.attrs))
        self.shared = tag in SHARED_TAGS or bool(classes & SHARED_CLASSES) or bool(p and p.shared)


class Scan(HTMLParser):
    def __init__(self, doc):
        super().__init__(convert_charrefs=False)
        self.doc = doc
        self.lines = [0]
        for m in re.finditer('\n', doc):
            self.lines.append(m.end())
        self.stack, self.nodes = [], []
        self.feed(doc)
        self.close()

    def pos(self):
        line, col = self.getpos()
        return self.lines[line - 1] + col

    def _open(self, tag, attrs, void):
        start = self.pos()
        n = Node(tag, attrs, start, start + len(self.get_starttag_text()), self.stack[-1] if self.stack else None)
        self.nodes.append(n)
        if not void:
            self.stack.append(n)

    def handle_starttag(self, tag, attrs):
        self._open(tag, attrs, tag in VOID)

    def handle_startendtag(self, tag, attrs):
        self._open(tag, attrs, True)

    def handle_endtag(self, tag):
        if not any(n.tag == tag for n in self.stack):
            return
        end = self.doc.index('>', self.pos()) + 1
        while self.stack:
            n = self.stack.pop()
            n.end = end
            if n.tag == tag:
                break

    def _text(self, raw):
        if not self.stack:
            return
        s = self.pos()
        runs = self.stack[-1].runs
        if runs and runs[-1][1] == s:
            runs[-1][1] = s + len(raw)
        else:
            runs.append([s, s + len(raw)])

    def handle_data(self, data):
        self._text(data)

    def handle_entityref(self, name):
        self._text(f'&{name};')

    def handle_charref(self, name):
        self._text(f'&#{name};')


def _hash(*parts):
    return hashlib.sha1('|'.join(parts).encode()).hexdigest()[:10]


def _norm(raw):
    return ' '.join(html.unescape(raw).split())


def _esc(s):
    return html.escape(s, quote=False)


def _attr(s):
    return html.escape(s).replace('&#x27;', "'")


def _set_attr(tag_text, name, value):
    """Sets (or with value None removes) an attribute in a start tag's source text."""
    pat = re.compile(r'\s%s(?:\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s>]+))?(?=[\s/>])' % re.escape(name))
    tag_text = pat.sub('', tag_text)
    if value is None:
        return tag_text
    close = '/>' if tag_text.endswith('/>') else '>'
    body = tag_text[:-len(close)].rstrip()
    return f'{body} {name}="{_attr(value)}"' + (' />' if close == '/>' else '>')


def strip_html(key, photos):
    imgs = ''.join(
        f'<img data-e-item="free.add.{key}.{i}" data-e-img="free.add.{key}.{i}" src="{_attr(p["src"])}" alt="{_attr(p["alt"])}"'
        f' loading="lazy" width="{p["w"]}" height="{p["h"]}" />' for i, p in enumerate(photos))
    return f'\n<div class="x-photos" data-e-list="free.add.{key}">{imgs}</div>'


def mark_page(doc, page, free):
    """Returns the page with edit markers added and the client's free edits applied."""
    texts, imgs, adds = free.get('text', {}), free.get('img', {}), free.get('add', {})
    scan = Scan(doc)
    seen = {}
    edits = []  # (start, end, replacement); never overlapping
    anchors = {}  # key -> node
    tags = {}  # node -> new start-tag text

    def unique(base):
        n = seen.get(base, 0)
        seen[base] = n + 1
        return base if n == 0 else f'{base}-{n}'

    for n in scan.nodes:
        if n.skip or n.in_e:
            continue
        scope = '*' if n.shared else page
        tag_text = doc[n.start:n.tag_end]
        if n.tag == 'img':
            if 'data-e-img' in n.attrs:
                key = unique('e' + _hash(scope, 'img', n.attrs['data-e-img']))
            elif n.attrs.get('src'):
                key = unique('p' + _hash(scope, n.attrs['src']))
                if key in imgs and imgs[key] is None:
                    edits.append((n.start, n.tag_end, ''))
                    continue
                if key in imgs:
                    v = imgs[key]
                    for a, val in (('srcset', None), ('src', v['src']), ('alt', v['alt']), ('width', str(v['w'])), ('height', str(v['h']))):
                        tag_text = _set_attr(tag_text, a, val)
                tag_text = _set_attr(tag_text, 'data-e-img', f'free.img.{key}')
            else:
                continue
        elif 'data-e' in n.attrs:
            key = unique('e' + _hash(scope, n.attrs['data-e']))
        else:
            own = [r for r in n.runs if doc[r[0]:r[1]].strip()]
            if not own:
                continue
            original = _norm(''.join(doc[s:e] for s, e in n.runs))
            key = unique('k' + _hash(scope, n.tag, original))
            if key in texts:
                new = texts[key]
                first, rest = own[0], own[1:]
                raw = doc[first[0]:first[1]]
                lead = raw[:len(raw) - len(raw.lstrip())]
                trail = raw[len(raw.rstrip()):]
                edits.append((first[0], first[1], lead + _esc(new) + trail))
                edits.extend((s, e, ' ' if doc[s:e][:1].isspace() or doc[s:e][-1:].isspace() else '') for s, e in rest)
                href = n.attrs.get('href') or ''
                digits = re.sub(r'\D', '', new)
                if href.startswith('tel:') and len(digits) in (10, 11):
                    tag_text = _set_attr(tag_text, 'href', 'tel:+' + (digits if len(digits) == 11 else '1' + digits))
            tag_text = _set_attr(_set_attr(tag_text, 'data-e', f'free.text.{key}'), 'data-e-fmt', 'own')
        tags[n] = _set_attr(tag_text, 'data-x', key)
        anchors[key] = n

    for n, t in tags.items():
        edits.append((n.start, n.tag_end, t))
    for key, photos in adds.items():
        n = anchors.get(key)
        if not n or not photos:
            continue
        block = n if n.tag not in VOID else n.parent
        while block and block.tag not in BLOCK:
            block = block.parent
        if block:
            edits.append((block.end, block.end, strip_html(key, photos)))

    out, last = [], len(doc)
    # Same-position inserts keep their order: sort is stable and we build back to front.
    for s, e, rep in sorted(edits, key=lambda x: (x[0], x[1]), reverse=True):
        assert e <= last, (s, e, last)
        out.append(doc[e:last])
        out.append(rep)
        last = s
    out.append(doc[:last])
    return ''.join(reversed(out))
