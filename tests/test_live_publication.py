"""Regression tests: published CMS snapshots must drive public page HTML."""
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

class PublicPublicationTests(unittest.TestCase):
    def render(self, data):
        p=subprocess.run([sys.executable,str(ROOT/'scripts/render_publication.py')],
            input=json.dumps(data,ensure_ascii=False),text=True,capture_output=True,check=True,timeout=25,cwd=ROOT)
        return json.loads(p.stdout)

    def test_academy_publication_updates_visible_html(self):
        data=json.loads((ROOT/'content/academia.json').read_text(encoding='utf-8'))
        before=self.render(data)
        self.assertIn('academia/index.html',before)
        program=data['programs'][0]
        old=program['title']
        program['title']='PROGRAMA-PUBLICADO-PRUEBA-2026'
        after=self.render(data)
        self.assertIn('PROGRAMA-PUBLICADO-PRUEBA-2026',after['academia/index.html'])
        self.assertNotIn('PROGRAMA-PUBLICADO-PRUEBA-2026',before['academia/index.html'])
        self.assertIn('index.html',after)
        self.assertIn('sitemap.xml',after)
        program['title']=old

if __name__=='__main__':
    unittest.main()
