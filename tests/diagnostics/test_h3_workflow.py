"""Cheap graph contract diagnostics; NOT native model tests."""
import importlib.util
import json
from pathlib import Path
import unittest

path = Path(__file__).resolve().parents[2] / "integrations/h3/workflow.py"
spec = importlib.util.spec_from_file_location("h3_workflow", path)
workflow = importlib.util.module_from_spec(spec)
spec.loader.exec_module(workflow)


class WorkflowTest(unittest.TestCase):
    def graph(self, **changes):
        return workflow.h3_graph(**({"prompt": "A quiet mountain lake", "seed": "8134981109389014333",
                                    "audio_filename": "conditioning.wav", "frames": 56} | changes))

    def test_seed_survives_native_json_without_js_rounding(self):
        for seed in ("0", "8134981109389014333", str(2**64 - 1)):
            self.assertEqual(str(json.loads(json.dumps(self.graph(seed=seed)))["9"]["inputs"]["noise_seed"]), seed)

    def test_invalid_seeds_are_rejected(self):
        for seed in (-1, 123, "01", "-1", "1.0", "1e3", str(2**64), ""):
            with self.subTest(seed=seed), self.assertRaises(ValueError):
                self.graph(seed=seed)

    def test_audio_conditions_guider_not_latent(self):
        graph = self.graph()
        self.assertEqual(graph["7"]["inputs"]["audio"], ["6", 0])
        self.assertEqual(graph["8"]["inputs"]["conditioning"], ["7", 0])
        self.assertEqual(graph["12"]["inputs"]["latent_image"], ["5", 1])

    def test_pngs_branch_before_encoding(self):
        graph = self.graph()
        self.assertEqual(graph["15"]["inputs"]["images"], ["13", 0])
        self.assertEqual(graph["16"]["inputs"]["images"], ["13", 0])
        self.assertEqual(graph["16"]["inputs"]["fps"], 24)
        self.assertEqual(graph["16"]["inputs"]["codec"], "none")

    def test_grid_does_not_introduce_four_second_minimum(self):
        for frames in (5, 22, 39, 56, 379):
            self.assertEqual(self.graph(frames=frames)["5"]["inputs"]["length"], frames)
        for frames in (0, 48, 56.0, True):
            with self.subTest(frames=frames), self.assertRaises(ValueError):
                self.graph(frames=frames)

    def test_dimensions_and_audio_names(self):
        for changes in ({"width": 641}, {"height": 0}, {"audio_filename": "../other.wav"},
                        {"audio_filename": "/tmp/other.wav"}, {"prompt": ""}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                self.graph(**changes)

    def test_fixture_uses_identical_output_branch_and_no_models(self):
        graph = workflow.synthetic_graph("synthetic.wav")
        forbidden = {"UNETLoader", "CLIPLoader", "VAELoader", "SamplerCustomAdvanced"}
        self.assertTrue(forbidden.isdisjoint(n["class_type"] for n in graph.values()))
        colors = workflow.fixture_colors()
        self.assertEqual(len(colors), 56)
        self.assertEqual(len(set(colors)), 56)
        for index, color in enumerate(colors):
            for other in colors[index+1:]:
                self.assertGreater(max(abs(a - b) for a, b in zip(color, other)), 2 * 5)
        for key, value in workflow.output_branch(["255", 0], ["6", 0]).items():
            self.assertEqual(graph[key], value)


if __name__ == "__main__":
    unittest.main()
