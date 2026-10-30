"""Prevent regression: ordinary LMS lessons must save valid non-null quiz JSON."""
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]

class LMSLessonSaveTests(unittest.TestCase):
    def test_non_quiz_lessons_never_write_null_quiz(self):
        server=(ROOT/'server.js').read_text(encoding='utf8')
        self.assertIn("quiz:l.type==='quiz'?(l.quiz||{}):{}",server)
        self.assertNotIn("quiz:l.quiz||null,sort_order:li",server)

    def test_course_publication_occurs_after_lessons(self):
        server=(ROOT/'server.js').read_text(encoding='utf8')
        block=server.split('async function saveCourse(course,publish=false) {',1)[1].split('\nfunction studentFrom(',1)[0]
        self.assertLess(block.index("const lr=await supabase.from('lms_lessons').upsert"),block.index("const finalized=await supabase.from('lms_courses').update({status})"))
        self.assertIn("status:initialStatus",block)

if __name__=='__main__':
    unittest.main()
