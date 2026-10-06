"""Genera Cotizador-MEDITIENDA.html: la aplicación completa en un solo archivo
(estilos, código y logo incluidos) para abrirla con doble clic sin descomprimir nada.
Uso: python3 cotizador/build.py"""
import base64, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
read = lambda p: open(os.path.join(HERE, p), encoding='utf-8').read()

html = read('index.html')
html = html.replace('<link rel="stylesheet" href="css/styles.css">', '<style>\n' + read('css/styles.css') + '\n</style>')

def inline_js(m):
    code = read(m.group(1)).replace('</script', '<\\/script')
    return '<script>\n/* ' + m.group(1) + ' */\n' + code + '\n</script>'
html = re.sub(r'<script src="(js/[^"]+)"></script>', inline_js, html)

logo = base64.b64encode(open(os.path.join(HERE, 'img/logo-meditienda.jpg'), 'rb').read()).decode()
html = html.replace('src="img/logo-meditienda.jpg"', 'src="data:image/jpeg;base64,' + logo + '"')

assert 'src="js/' not in html and 'href="css/' not in html and 'img/logo' not in html
out = os.path.join(HERE, 'Cotizador-MEDITIENDA.html')
open(out, 'w', encoding='utf-8').write(html)
print(out, len(html) // 1024, 'KB')
