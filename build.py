#!/usr/bin/env python3
"""Builds index.html from src/. Run: python3 build.py"""
from pathlib import Path
S = Path(__file__).parent / 'src'
r = lambda n: (S / n).read_text(encoding='utf-8')
parts = [r('top.html'), '<style>\n', r('style.css'), '</style>\n', r('body.html'), '<script>\n',
         r('i18n.js'), r('i18n_v2.js'), r('cities.js'), r('v2.js'), r('app.js'), r('bottom.html')]
out = ''.join(parts)
(Path(__file__).parent / 'index.html').write_text(out, encoding='utf-8')
print('index.html', len(out.encode()), 'bytes')
