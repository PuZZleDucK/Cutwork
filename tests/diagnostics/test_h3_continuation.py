"""Real PNG and copied-input diagnostics only; no providers, services or models."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from PIL import Image, PngImagePlugin

BASE = Path(__file__).resolve().parents[2] / 'integrations/h3'
def load(name):
    spec = importlib.util.spec_from_file_location('continuation_'+name, BASE/(name+'.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); return module
media, workflow = load('media'), load('workflow')

class ContinuationTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.project = Path(self.temp.name); self.source = self.project/'retained.png'
        with Image.new('RGB', (640,480), (20,40,60)) as image:
            image.save(self.source); self.pixel = hashlib.sha256(image.tobytes()).hexdigest()
        self.ref = {'path':str(self.source), 'sha256':media.sha256(self.source), 'pixelSha256':self.pixel}
        self.inputs = self.project/'inputs'; self.inputs.mkdir()
    def prepare(self):
        return media.prepare_first_frame(self.ref, self.inputs, Path(sys.executable), self.project)
    def test_image_and_audio_both_reach_guider_without_changing_joint_latent(self):
        args = dict(prompt='Continue the supplied scene', seed=str(2**64-1), frames=56, audio_filename='conditioning.wav')
        original = workflow.h3_graph(**args)
        graph = workflow.h3_graph(**args, first_frame_filename='continuation.png')
        self.assertEqual(graph['19'], {'class_type':'LoadImage','inputs':{'image':'continuation.png'}})
        self.assertEqual(graph['5']['inputs']['first_frame'], ['19',0])
        self.assertNotIn('last_frame', graph['5']['inputs'])
        del graph['19']; del graph['5']['inputs']['first_frame']
        self.assertEqual(graph, original)
    def test_original_snapshot_is_byte_and_pixel_exact_and_never_overwritten(self):
        result = self.prepare(); copied=Path(result['path'])
        self.assertEqual(copied.read_bytes(), self.source.read_bytes())
        self.assertEqual(result, {'path':str(self.inputs/'continuation.png'),'sourcePath':str(self.source),
            'sha256':self.ref['sha256'],'pixelSha256':self.pixel,'bytes':self.source.stat().st_size,'width':640,'height':480})
        with self.assertRaises(FileExistsError): self.prepare()
    def test_wrong_source_hash_pixel_hash_and_link_are_rejected(self):
        for field in ('sha256','pixelSha256'):
            with self.subTest(field=field):
                dest=self.project/field;dest.mkdir()
                with self.assertRaises(ValueError): media.prepare_first_frame(self.ref|{field:'0'*64},dest,Path(sys.executable),self.project)
        linked=self.project/'linked.png';linked.symlink_to(self.source)
        with self.assertRaises(ValueError):media.prepare_first_frame(self.ref|{'path':str(linked)},self.inputs,Path(sys.executable),self.project)
    def test_png_mode_and_dimensions_not_silently_converted(self):
        for mode,size in [('RGBA',(640,480)),('RGB',(32,32))]:
            with self.subTest(mode=mode,size=size):
                path=self.project/(mode+str(size[0])+'.png');Image.new(mode,size).save(path)
                with self.assertRaises(ValueError):media.inspect_input_png(path)
    def test_png_runtime_fingerprints_bind_both_conditioning_inputs(self):
        graph=workflow.h3_graph(prompt='Continue',seed='1',frames=56,audio_filename='conditioning.wav',first_frame_filename='continuation.png')
        observed=json.loads(json.dumps(graph));observed['6']['is_changed']=['audio-sha'];observed['19']['is_changed']=[self.ref['sha256']]
        media.validate_png_prompt(observed,graph,'audio-sha',self.ref['sha256'])
        for node in ('6','19'):
            wrong=json.loads(json.dumps(observed));wrong[node]['is_changed']=['different']
            with self.assertRaises(ValueError):media.validate_png_prompt(wrong,graph,'audio-sha',self.ref['sha256'])
    def test_original_output_inspector_checks_image_fingerprint_from_manifest(self):
        graph=workflow.h3_graph(prompt='Continue',seed=str(2**64-1),frames=56,audio_filename='conditioning.wav',first_frame_filename='continuation.png')
        observed=json.loads(json.dumps(graph));observed['6']['is_changed']=['audio-sha'];observed['19']['is_changed']=[self.ref['sha256']]
        png=PngImagePlugin.PngInfo();png.add_text('prompt',json.dumps(observed))
        output=self.project/'output.png';Image.new('RGB',(640,480)).save(output,pnginfo=png)
        inputs={'paths':[str(output)],'graph':graph,'audioSha256':'audio-sha','firstFrameSha256':self.ref['sha256']}
        manifest=self.project/'original-frame-inputs.json';manifest.write_text(json.dumps(inputs))
        self.assertEqual(media.inspect_pngs(manifest)[0]['sha256'],media.sha256(output))
        inputs['firstFrameSha256']='0'*64;manifest.write_text(json.dumps(inputs))
        with self.assertRaisesRegex(ValueError,'LoadImage'):media.inspect_pngs(manifest)
    def test_image_filename_traversal_is_rejected(self):
        for name in ('../other.png','/tmp/other.png','a\\b.png',''):
            with self.subTest(name=name),self.assertRaises(ValueError):
                workflow.h3_graph(prompt='Continue',seed='1',frames=56,audio_filename='conditioning.wav',first_frame_filename=name)
if __name__ == '__main__':unittest.main()
