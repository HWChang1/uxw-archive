# -*- coding: utf-8 -*-
"""검수본 단독본(single-file) 빌더.

기획자에게 파일로 전달했을 때 fbn_wf/ 폴더가 없어 iframe이 깨지는 문제 해결.
- 와이어프레임 원본(html+js) → base64 페이로드 1회 인코딩 후 iframe.srcdoc 주입
  (srcdoc은 부모 origin을 상속하므로 file:// 로 열어도 부모↔iframe 스크립트 연동 유지)
- 이미지·폰트는 부모에 data URI 1회만 담고 페이로드 안에서는 __ASSET_n__ 치환
  (이중 base64로 용량이 1.77배 되는 것 방지)
- Pretendard Variable 6.7MB → 실제 사용 글리프만 서브셋
"""
import io, os, re, base64, hashlib

# 사용법: python3 tools/single_file.py <검수본.html> <와이어프레임_폴더> [출력.html]
import sys
DOC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/fbn/FBN_입점동선_0728.html'
WF = sys.argv[2] if len(sys.argv) > 2 else '/tmp/fbn/wf'
OUT = sys.argv[3] if len(sys.argv) > 3 else DOC.replace('.html', '_단독본.html')

wf = io.open(os.path.join(WF, 'index.html'), encoding='utf-8').read()

# ── 1. 폰트 서브셋 ────────────────────────────────────────────────
TTF = re.search(r'url\("([^"]+\.ttf)"\)', wf).group(1)
chars = set(wf) | set(chr(c) for c in range(0x20, 0x7f)) | set('✕ⓘ↗·—…')
from fontTools import subset
opts = subset.Options()
opts.layout_features = ['*']
opts.name_IDs = ['*']
opts.notdef_outline = True
opts.drop_tables = []
font = subset.load_font(os.path.join(WF, TTF), opts)
sub = subset.Subsetter(options=opts)
sub.populate(text=''.join(sorted(chars)))
sub.subset(font)
sub_path = os.path.join(os.path.dirname(OUT) or '.', '_sub.ttf')
subset.save_font(font, sub_path, opts)
print('폰트: %.1fMB → %dKB (글리프 %d자)' % (
    os.path.getsize(os.path.join(WF, TTF)) / 1048576, os.path.getsize(sub_path) / 1024, len(chars)))

# ── 2. 시작 가이드 캡처 경량화 ────────────────────────────────────
from PIL import Image
g_png = os.path.join(WF, 'guide_full.png')
g_jpg = os.path.join(os.path.dirname(OUT) or '.', '_guide.jpg')
im = Image.open(g_png).convert('RGB')
im.save(g_jpg, 'JPEG', quality=88, optimize=True, progressive=True)
if os.path.getsize(g_jpg) < os.path.getsize(g_png):
    guide_src, guide_mime = g_jpg, 'image/jpeg'
else:
    guide_src, guide_mime = g_png, 'image/png'
print('가이드 캡처: %dKB → %dKB (%s)' % (
    os.path.getsize(g_png) / 1024, os.path.getsize(guide_src) / 1024, guide_mime))

# ── 3. 에셋 테이블(부모에 1회만 base64) ───────────────────────────
ASSETS = []
def asset(path, mime):
    uri = 'data:%s;base64,%s' % (mime, base64.b64encode(io.open(path, 'rb').read()).decode())
    ASSETS.append(uri)
    return '__ASSET_%d__' % (len(ASSETS) - 1)

wf = wf.replace(TTF, asset(sub_path, 'font/ttf'))
for png in sorted(set(re.findall(r'src="([^"]+\.png)"', wf))):
    wf = wf.replace('src="%s"' % png, 'src="%s"' % asset(os.path.join(WF, png), 'image/png'))
GUIDE_IMG = asset(guide_src, guide_mime)

# ── 4. 번들러 JS 인라인 ───────────────────────────────────────────
for js in re.findall(r'<script src="([0-9a-f-]+\.js)"></script>', wf):
    code = io.open(os.path.join(WF, js), encoding='utf-8').read()
    # <script>/<!-- 가 있으면 토크나이저 상태가 꼬일 수 있어 data URI로 우회
    if '<script' in code or '<!--' in code:
        repl = '<script src="data:text/javascript;base64,%s"></script>' % base64.b64encode(
            code.encode('utf-8')).decode()
    else:
        repl = '<script>%s</script>' % code.replace('</script', r'<\/script')
    wf = wf.replace('<script src="%s"></script>' % js, repl)
assert '.js"' not in wf and '.png"' not in wf and '.ttf"' not in wf, '외부 참조 잔존'

# ── 5. 시작 가이드 → 새 창에 직접 렌더 ────────────────────────────
GUIDE_JS = (
    "window.__GUIDE_HTML='<!DOCTYPE html><html lang=\"ko\"><head><meta charset=\"UTF-8\">"
    "<title>N배송 FBN 시작 가이드</title><style>*{margin:0;padding:0}body{background:#f1f4f6}"
    "img{display:block;width:100%;max-width:1512px;margin:0 auto}.close{position:fixed;top:14px;"
    "right:16px;z-index:10;height:34px;padding:0 14px;font-size:13px;font-weight:600;color:#0a7a3c;"
    "background:rgba(255,255,255,.95);border:1px solid rgba(0,184,79,.4);border-radius:99px;"
    "cursor:pointer}</style></head><body><button class=\"close\" onclick=\"window.close()\">"
    "✕ 닫기</button><img src=\"" + GUIDE_IMG + "\" alt=\"시작 가이드\">"
    "</body></html>';\n"
    "window.__openGuide=function(){var w=window.open('','_blank');"
    "if(!w){alert('팝업이 차단되었습니다. 허용 후 다시 해주세요.');return false;}"
    "w.document.write(window.__GUIDE_HTML);w.document.close();return false;};"
)
old_a = '<a href="guide.html" target="_blank" style="text-decoration:none;">'
assert old_a in wf
wf = wf.replace(old_a, '<a href="#" onclick="return window.__openGuide()" style="text-decoration:none;">')
wf = wf.replace('</head>', '<script>%s</script></head>' % GUIDE_JS, 1)

# ── 6. 페이로드(html+js만 base64 1회) ─────────────────────────────
payload = base64.b64encode(wf.encode('utf-8')).decode()

doc = io.open(DOC, encoding='utf-8').read()
ver = re.search(r'fbn_wf/index\.html\?v=([0-9a-f]+)', doc).group(1)
doc = doc.replace('<iframe src="fbn_wf/index.html?v=%s"' % ver, '<iframe id="wf-frame"')
doc = doc.replace('<a class="hdr-btn" href="fbn_wf/index.html?v=%s" target="_blank"' % ver,
                  '<a class="hdr-btn" href="#" onclick="return __openWF()"')
assert 'fbn_wf/' not in doc, '부모 문서에 상대경로 잔존'

RUNTIME = """
<script id="wf-assets">/* 단독본: 와이어프레임 원본을 문서 안에 내장(폴더 없이 파일 하나로 동작) */
var __A=%s;
var __WF=(function(){var b=atob("%s"),u=new Uint8Array(b.length);
  for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);
  return new TextDecoder('utf-8').decode(u).replace(/__ASSET_(\\d+)__/g,function(m,i){return __A[+i];});})();
document.getElementById('wf-frame').srcdoc=__WF;
function __openWF(){var w=window.open('','_blank');
  if(!w){alert('팝업이 차단되었습니다. 허용 후 다시 해주세요.');return false;}
  w.document.write(__WF);w.document.close();return false;}
</script>
"""
doc = doc.replace('</body>', RUNTIME % ('[' + ','.join('"%s"' % a for a in ASSETS) + ']', payload) + '</body>', 1)

io.open(OUT, 'w', encoding='utf-8').write(doc)
print('단독본: %s (%.1f MB)' % (OUT, os.path.getsize(OUT) / 1048576))
