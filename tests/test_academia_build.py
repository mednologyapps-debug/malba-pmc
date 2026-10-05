"""Content publishing, registration and escaping checks for the future CMS contract."""
import copy, importlib.util, json, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('build',ROOT/'scripts/build_academia.py')
build=importlib.util.module_from_spec(spec);spec.loader.exec_module(build)
class AcademiaPublishingTests(unittest.TestCase):
    def setUp(self):self.data=json.loads((ROOT/'content/academia.json').read_text())
    def test_publish_content_changes_in_catalog_and_detail(self):
        p=self.data['programs'][0]
        p.update(title='Nuevo título del programa',startDate='2027-03-15',hours=32,sessions=10,image='assets/programs/pmo-960.webp',status='abierto')
        p['pricing'].update(regular=450,launch=390,launchEndsAt='2099-03-01T00:00:00-05:00')
        p['learning']['items'][0]['description']='Contenido actualizado por el CMS.'
        build.validate(self.data)
        catalog=build.academy(self.data);page=build.program_page(p,self.data['programs'])
        for output in [catalog,page]:
            self.assertIn('Nuevo título del programa',output);self.assertIn('US$ 390',output);self.assertIn('32 horas',output);self.assertIn('10 sesiones',output)
        self.assertIn('15 de marzo de 2027',page);self.assertIn('Contenido actualizado por el CMS.',page);self.assertIn('Inscribirme ahora',page)
    def test_paused_programs_do_not_offer_checkout(self):
        for p in self.data['programs'][1:]:
            page=build.program_page(p,self.data['programs'])
            self.assertIn('disabled>Inscripciones próximamente',page);self.assertNotIn('href="'+str(p['checkoutUrl'])+'"',page)
    def test_expired_launch_price_is_not_published(self):
        p=self.data['programs'][0];p['pricing']['launchEndsAt']='2000-08-06T00:00:00-05:00'
        self.assertIn('US$ 350',build.price(p));self.assertNotIn('US$ 300',build.price(p))
    def test_content_is_escaped_and_unsafe_urls_rejected(self):
        p=self.data['programs'][0];p['title']='<script>alert(1)</script>'
        page=build.program_page(p,self.data['programs'])
        self.assertNotIn('<script>alert(1)</script>',page);self.assertIn('&lt;script&gt;',page)
        p['brochureUrl']='javascript:alert(1)'
        with self.assertRaises(ValueError):build.validate(self.data)
    def test_configurable_features_and_themes_are_safe(self):
        self.data['academy']['features'][0]['title']='Método actualizado'
        self.assertIn('Método actualizado',build.academy(self.data))
        p=self.data['programs'][0];p['theme']['accent']='#123456'
        self.assertIn('--course-accent:#123456',build.program_page(p,self.data['programs']))
        p['theme']['accent']='red;position:fixed'
        with self.assertRaises(ValueError):build.validate(self.data)
        p['theme']['accent']='#123456';p['sectionImage']='assets/a);color:red.webp'
        with self.assertRaises(ValueError):build.validate(self.data)
    def test_imported_curriculum_is_complete(self):
        self.assertEqual([len(p['curriculum']['modules']) for p in self.data['programs']],[9,9,6])
        self.assertEqual([len(p['outcomes']['items']) for p in self.data['programs']],[10,9,6])
        self.assertEqual([t['name'] for t in self.data['programs'][2]['instructors']],['Dayana Romero','Miguel Alba'])
if __name__=='__main__':unittest.main()
