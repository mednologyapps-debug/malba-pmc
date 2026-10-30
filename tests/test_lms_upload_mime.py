from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
class LMSUploadTests(unittest.TestCase):
 def test_supported_file_extensions_have_explicit_mime(self):
  s=(ROOT/'server.js').read_text(encoding='utf8')
  for ext in ('.pdf','.png','.jpg','.jpeg','.webp','.mp4','.zip','.txt','.docx','.xlsx','.pptx'):
   self.assertIn("'"+ext+"':",s)
  self.assertIn("contentType,upsert:false",s)
 def test_admin_upload_error_message(self):
  s=(ROOT/'dashboard/lms-admin.js').read_text(encoding='utf8')
  self.assertIn('El servidor no devolvió una respuesta válida al subir el archivo',s)
if __name__=='__main__':unittest.main()
