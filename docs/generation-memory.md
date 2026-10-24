# Observed generation memory

Read from the retained native receipts/resource logs on 25 October 2026 for the
**24 October recorded Day Shift Sketchbook and Night Shift Garden demo**. These
figures describe the tested runs, not a minimum VRAM requirement or a guaranteed
ceiling for other prompts, durations, resolutions, model pins or offload settings.

## GPU memory

| Generator / scope | Highest recorded value | Measurement |
|---|---:|---|
| H3, nine video generations | **15,450 MiB = 15.09 GiB** | Owned ComfyUI process, sampled `nvidia-smi` compute-process memory |
| H3 plus other listed compute work | **15,684 MiB = 15.32 GiB** | Same sample includes an unrelated personal ComfyUI process using 234 MiB |
| YuE2, two song generations | **7.81 GiB allocated** | PyTorch peak live tensor allocation |
| YuE2, two song generations | **7.94 GiB reserved** | PyTorch peak allocator reservation, including cached blocks |

H3's observer samples approximately every two seconds (plus collection overhead).
The maximum is therefore the **highest observed sample**, not a proven instantaneous
peak. Every H3 run's samples were matched to the owned PID in that run's receipt;
there were no observation errors in these nine logs. The all-compute total is
**not a complete GPU-wide measurement**: display/driver/other non-compute allocations
may be outside that list.

YuE2 resets PyTorch peak counters before loading the pipeline and records them at
completion. Its tensor/allocation counters do not include every CUDA/driver or
other-process allocation, so they are not directly equivalent to H3's process-level
measurement. The larger Night song recorded 8,384,350,720 allocated bytes and
8,522,825,728 reserved bytes; the Day song was lower (7.10 / 7.20 GiB).

The H3 maximum came from native run `27075546-3671-4e41-ac33-f9ab4bae233c` in the
Night project. Its 104 resource observations include 101 samples listing the owned
GPU process. All nine runs completed successfully; the maximum does not come from
an unrelated process or a fabricated benchmark.

## What this means for installation

The **16 GB NVIDIA target remains appropriate** for the tested profile. These
observations do not validate 8 GB or 12 GB support. High observed usage also does
not establish the model's theoretical minimum: caching and automatic offload can
respond to available memory. No smaller-GPU configuration was tested here.

VRAM is separate from system RAM. The demo host had about 22 GiB RAM, with a
competing TTS service paused with permission and restored after testing. See the
[installation guide](installation.md) for resource cautions and the
[recorded journey](../devpost/recorded-demo-v2.md) for the full evidence boundary.

No fresh generation, installation or service interruption was needed to extract
these figures. Machine-specific raw logs remain private; this page records the
measurement method and public aggregate results.
