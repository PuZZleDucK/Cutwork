"""API graphs for the pinned ComfyUI revision in models.json.

These are native-tool helpers, not a restriction on how creative agents work.
The output branch is shared by the synthetic probe and the H3 graph. A passing
synthetic probe says nothing about H3 loading, inference or GPU feasibility.
"""
from pathlib import PurePosixPath
import re


def node(class_type, **inputs):
    return {"class_type": class_type, "inputs": inputs}


def output_branch(images, audio):
    # Both consumers receive the SAME original IMAGE batch. Never extract the
    # preserved PNGs from an encoded video. They are 8-bit images, not tensors.
    return {
        "15": node("SaveImage", images=images, filename_prefix="raw/frame"),
        "16": node("CreateVideo", images=images, audio=audio, fps=24,
                   codec="none", bit_depth=8, color_space="sRGB"),
        "17": node("SaveVideo", video=["16", 0], filename_prefix="native/clip", **{
            "format": "mp4", "format.codec": "h264",
            "format.codec.encoding": "re-encode", "format.codec.encoding.crf": 18,
        }),
        "18": node("SaveAudioAdvanced", audio=audio,
                   filename_prefix="audio/clip", format="flac"),
    }


def audio_input_name(value):
    if not isinstance(value, str) or not value or "\\" in value:
        raise ValueError("Expected a relative ComfyUI input audio filename")
    path = PurePosixPath(value)
    if path.is_absolute() or ".." in path.parts or str(path) != value:
        raise ValueError("Expected a relative ComfyUI input audio filename")
    return value


def h3_graph(*, prompt, seed, audio_filename, frames, width=640, height=480, first_frame_filename=None):
    """Build native graph; caller supplies sample-exact conditioned audio.

    `frames` is the native count from the existing TypeScript planner, not the
    requested placement length. Seeds enter as decimal strings so no JavaScript
    Number conversion can silently round a recorded 64-bit value.
    """
    if not isinstance(prompt, str) or not prompt.strip():
        raise ValueError("A prompt is required")
    if not isinstance(seed, str) or not re.fullmatch(r"0|[1-9][0-9]*", seed) or int(seed) >= 2**64:
        raise ValueError("Seed must be a canonical unsigned 64-bit decimal string")
    if type(frames) is not int or frames < 5 or (frames - 5) % 17:
        raise ValueError("Native H3 frame count must be 17k+5, k >= 0")
    if any(type(v) is not int or v < 32 or v % 32 for v in (width, height)):
        raise ValueError("Width and height must be positive multiples of 32")
    graph = {
        "1": node("UNETLoader", unet_name="minimax_h3_fl2va_pruned_w6a8.safetensors", weight_dtype="default"),
        "2": node("CLIPLoader", clip_name="qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors", type="minimax", device="default"),
        "3": node("VAELoader", vae_name="minimax_h3_video_vae_int8_convrot.safetensors"),
        "4": node("VAELoader", vae_name="minimax_h3_audio_vae_fp32.safetensors"),
        "5": node("MiniMaxH3ImageToVideo", clip=["2", 0], vae=["3", 0], prompt=prompt,
                  width=width, height=height, length=frames),
        "6": node("LoadAudio", audio=audio_input_name(audio_filename)),
        # AddGuide returns only CONDITIONING. It does not replace the latent.
        "7": node("MiniMaxH3AddGuide", positive=["5", 0], latent=["5", 1],
                  frame_idx=0, audio=["6", 0], audio_vae=["4", 0]),
        "8": node("BasicGuider", model=["1", 0], conditioning=["7", 0]),
        "9": node("RandomNoise", noise_seed=int(seed)),
        "10": node("KSamplerSelect", sampler_name="res_multistep"),
        "11": node("BasicScheduler", model=["1", 0], scheduler="simple", steps=20, denoise=1.0),
        "12": node("SamplerCustomAdvanced", noise=["9", 0], guider=["8", 0],
                   sampler=["10", 0], sigmas=["11", 0], latent_image=["5", 1]),
        "13": node("VAEDecode", samples=["12", 0], vae=["3", 0]),
        "14": node("VAEDecodeAudio", samples=["12", 0], vae=["4", 0]),
    }
    if first_frame_filename is not None:
        graph["19"] = node("LoadImage", image=audio_input_name(first_frame_filename))
        graph["5"]["inputs"]["first_frame"] = ["19", 0]
    return graph | output_branch(["13", 0], ["14", 0])


def fixture_colors():
    # Adjacent colours must be farther apart than twice the lossy-decode
    # tolerance; otherwise swapping neighbouring video frames can look valid.
    return [(32 + 64*(i % 4), 32 + 64*((i // 4) % 4), 32 + 64*(i // 16)) for i in range(56)]


def synthetic_graph(audio_filename):
    """56 distinct, ordered solid-colour frames; absolutely no model nodes."""
    graph = {"6": node("LoadAudio", audio=audio_input_name(audio_filename))}
    batch = None
    for index, (red, green, blue) in enumerate(fixture_colors()):
        image_id, batch_id = str(100 + index), str(200 + index)
        graph[image_id] = node("EmptyImage", width=640, height=480, batch_size=1,
                               color=(red << 16) | (green << 8) | blue)
        if batch is None:
            batch = [image_id, 0]
        else:
            graph[batch_id] = node("ImageBatch", image1=batch, image2=[image_id, 0])
            batch = [batch_id, 0]
    return graph | output_branch(batch, ["6", 0])
