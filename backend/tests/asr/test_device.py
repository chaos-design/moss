from __future__ import annotations

import unittest

from backend.services.asr.engine import resolve_asr_device, resolve_asr_dtype


class ResolveAsrDeviceTest(unittest.TestCase):
    def test_explicit_setting_always_wins(self) -> None:
        self.assertEqual(
            resolve_asr_device(
                "cpu",
                cuda_available=True,
                mps_available=True,
                apple_silicon=True,
            ),
            "cpu",
        )

    def test_auto_prefers_cuda(self) -> None:
        self.assertEqual(
            resolve_asr_device(
                "auto",
                cuda_available=True,
                mps_available=True,
                apple_silicon=True,
            ),
            "cuda:0",
        )

    def test_auto_selects_mps_only_on_apple_silicon(self) -> None:
        self.assertEqual(
            resolve_asr_device(
                "auto",
                cuda_available=False,
                mps_available=True,
                apple_silicon=True,
            ),
            "mps",
        )

    def test_auto_falls_back_to_cpu_on_intel_mac_even_when_mps_reported(self) -> None:
        # Intel Macs report torch.backends.mps.is_available() == True, but the
        # transformers warmup allocation fails on Metal there ("Invalid buffer
        # size"), so auto must resolve to CPU.
        self.assertEqual(
            resolve_asr_device(
                "auto",
                cuda_available=False,
                mps_available=True,
                apple_silicon=False,
            ),
            "cpu",
        )

    def test_auto_falls_back_to_cpu_without_accelerators(self) -> None:
        self.assertEqual(
            resolve_asr_device(
                "auto",
                cuda_available=False,
                mps_available=False,
                apple_silicon=False,
            ),
            "cpu",
        )


class ResolveAsrDtypeTest(unittest.TestCase):
    def test_auto_uses_bfloat16_on_cpu(self) -> None:
        # float32 roughly doubles CPU memory and OOM-kills the shared dev stack
        # on a 16 GB machine, so auto must pick bfloat16 on CPU.
        self.assertEqual(resolve_asr_dtype("auto", "cpu"), "bfloat16")

    def test_auto_uses_bfloat16_on_cuda(self) -> None:
        self.assertEqual(resolve_asr_dtype("auto", "cuda:0"), "bfloat16")

    def test_auto_uses_float16_on_mps(self) -> None:
        self.assertEqual(resolve_asr_dtype("auto", "mps"), "float16")

    def test_explicit_setting_wins(self) -> None:
        self.assertEqual(resolve_asr_dtype("float32", "cpu"), "float32")
        self.assertEqual(resolve_asr_dtype("bfloat16", "cpu"), "bfloat16")

    def test_rejects_float16_on_cpu(self) -> None:
        # PyTorch has no half-precision CPU LayerNorm kernel, so float16 on CPU
        # crashes mid-inference; fail fast at load with a clear message instead.
        with self.assertRaisesRegex(ValueError, "not supported on CPU"):
            resolve_asr_dtype("float16", "cpu")

    def test_allows_float16_on_mps(self) -> None:
        self.assertEqual(resolve_asr_dtype("float16", "mps"), "float16")


if __name__ == "__main__":
    unittest.main()
