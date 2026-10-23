"""Real installer with fake public-document downloads; no network or weights."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch


class PromptGuideInstallerTest(unittest.TestCase):
    def test_separate_install_is_idempotent_and_preserves_weight_ownership(self):
        source = Path(__file__).resolve().parents[2]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            script = root / 'source/scripts/prepare-h3-models.py'
            script.parent.mkdir(parents=True)
            shutil.copy(source / 'scripts/prepare-h3-models.py', script)
            directory = root / 'source/integrations/h3'
            directory.mkdir(parents=True)
            content = b'complete fixture documentation\n'
            manifest = {'schemaVersion': 1, 'models': [{
                'role': 'prompt-guides', 'repository': 'MiniMaxAI/MiniMax-H3',
                'revision': 'a' * 40, 'files': [{'path': 'docs/base.md',
                'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()}]}]}
            (directory / 'prompt-guides.json').write_text(json.dumps(manifest))
            runtime = root / 'runtime'
            weight = runtime / 'models/h3/MiniMax-H3/old/.studio-model-manifest'
            weight.parent.mkdir(parents=True)
            weight.write_text('unchanged-weight-manifest')
            spec = importlib.util.spec_from_file_location('h3_installer', script)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            def download(args, **_kwargs):
                self.assertEqual(args[0], 'curl')
                self.assertIn('/resolve/' + 'a' * 40 + '/docs/base.md', args[-1])
                Path(args[args.index('--output') + 1]).write_bytes(content)
            with patch.dict(os.environ, {'STUDIO_DATA_ROOT': str(runtime)}), \
                 patch.object(sys, 'argv', [str(script), '--prompt-guides', '--install']), \
                 patch.object(module.subprocess, 'run', side_effect=download) as fetch:
                module.main()
                self.assertEqual(fetch.call_count, 1)
                module.main()
                self.assertEqual(fetch.call_count, 1, 'second install must not download again')
            self.assertEqual(weight.read_text(), 'unchanged-weight-manifest')
            self.assertEqual((runtime / ('references/h3/MiniMax-H3/' + 'a' * 40 + '/docs/base.md')).read_bytes(), content)


if __name__ == '__main__':
    unittest.main()
