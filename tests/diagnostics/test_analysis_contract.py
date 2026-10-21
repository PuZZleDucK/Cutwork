"""Learner-approved CPU analysis contract. Pure CPU cases; no installed Librosa needed.

Run after approval/implementation:
  python3 -m unittest discover -s tests/diagnostics -p test_analysis_contract.py -v
The missing target is a review prerequisite, NOT a behavioural red test.
"""
import importlib.util
from pathlib import Path
import unittest


class BeatResultContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path = Path(__file__).resolve().parents[2] / "integrations/analysis/analyze.py"
        if not path.is_file():
            raise RuntimeError("TEST REVIEW ONLY: analysis helper not implemented; no behavioural result")
        spec = importlib.util.spec_from_file_location("studio_analysis_contract", path)
        cls.analysis = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.analysis)

    def unavailable(self, result):
        self.assertEqual(result["status"], "unavailable")
        self.assertIsNone(result["estimatedBpm"])
        self.assertEqual(result["sampleIndices"], [])
        self.assertTrue(result["reason"].strip())

    def test_detector_gets_native_sample_rate_and_explicit_sample_units(self):
        mono = [0.0] * 96000
        calls = []

        def tracker(**kwargs):
            calls.append(kwargs)
            return [119.5], [12345, 36789, 60321]

        result = self.analysis.detect_beats(mono, 48000, tracker=tracker)
        self.assertEqual(len(calls), 1)
        self.assertEqual(list(calls[0]["y"]), mono)
        self.assertEqual({k: v for k, v in calls[0].items() if k != "y"}, {
            "sr": 48000, "hop_length": 512, "start_bpm": 120.0,
            "tightness": 100, "trim": True, "units": "samples", "sparse": True,
        })
        # start_bpm is an estimator prior, never a forced or fallback output BPM.
        self.assertEqual(result["estimatedBpm"], 119.5)
        self.assertEqual(result["sampleIndices"], ["12345", "36789", "60321"])

    def test_irregular_anchors_and_lead_in_are_preserved_without_video_quantisation(self):
        result = self.analysis.normalise_beats([119.5], [12345, 36789, 60321], sample_count=96000)
        self.assertEqual(result["status"], "available")
        self.assertEqual(result["sampleIndices"], ["12345", "36789", "60321"])
        self.assertNotIn("0", result["sampleIndices"])
        self.assertIsNone(result["reason"])

    def test_genuinely_detected_zero_anchor_is_not_discarded(self):
        result = self.analysis.normalise_beats(120.0, [0, 24000], sample_count=48000)
        self.assertEqual(result["status"], "available")
        self.assertEqual(result["sampleIndices"], ["0", "24000"])

    def test_no_onsets_does_not_publish_the_estimator_prior_as_bpm(self):
        for bpm in (0.0, 120.0):
            with self.subTest(bpm=bpm):
                self.unavailable(self.analysis.normalise_beats(bpm, [], sample_count=48000))

    def test_single_anchor_cannot_supply_an_extrapolation_interval(self):
        self.unavailable(self.analysis.normalise_beats(120.0, [24000], sample_count=48000))

    def test_invalid_tempo_is_not_replaced_by_a_default(self):
        for bpm in (0, -1, float("nan"), float("inf"), True, [], [90, 120], "120"):
            with self.subTest(bpm=bpm):
                self.unavailable(self.analysis.normalise_beats(bpm, [0, 24000], sample_count=48000))

    def test_invalid_positions_are_not_sorted_clamped_or_rounded_into_success(self):
        for samples in ([1, 1], [200, 100], [-1, 100], [1, 48000], [1.5, 100],
                        [False, 100], [0, float("nan")], [0, float("inf")], ["0", 100]):
            with self.subTest(samples=samples):
                self.unavailable(self.analysis.normalise_beats(120, samples, sample_count=48000))

    def test_tracker_failure_is_visible_without_inventing_a_map(self):
        def broken_tracker(**_kwargs):
            raise RuntimeError("fixture detector failure")

        result = self.analysis.detect_beats([0.0] * 48000, 48000, tracker=broken_tracker)
        self.unavailable(result)
        self.assertIn("fixture detector failure", result["reason"])

    def test_sample_integer_serialisation_does_not_round_through_javascript_numbers(self):
        # Pure representation fixture, not a claim to have decoded this huge song.
        first = 2**53 + 1
        result = self.analysis.normalise_beats(120, [first, first + 24000], sample_count=first + 48000)
        self.assertEqual(result["status"], "available")
        self.assertEqual(result["sampleIndices"], [str(first), str(first + 24000)])


if __name__ == "__main__":
    unittest.main()
