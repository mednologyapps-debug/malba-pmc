"""Regression checks for multi-course student Excel workflow."""
import pathlib, unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
class ExcelMultiCourseTests(unittest.TestCase):
    def test_template_dropdowns_and_import_match(self):
        server=(ROOT/'server.js').read_text(encoding='utf-8')
        self.assertIn("workbook.definedNames.add",server)
        self.assertIn("CursosMALBA",server)
        for col in ("curso 1","curso 2","curso 3"):
            self.assertIn("row['"+col+"']",server)
        self.assertIn("for(const selected of selectedCourses)",server)
        self.assertIn("const byName=new Map",server)
        self.assertIn("const byId=new Map",server)
    def test_interface_explains_multi_course(self):
        admin=(ROOT/'dashboard/lms-admin.js').read_text(encoding='utf-8')
        self.assertIn('selecciona hasta tres cursos publicados por alumno',admin)
if __name__=='__main__':unittest.main()
