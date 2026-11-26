"""
Generate a seamless 10-second Studio Ghibli Polar Bear & Red-Scarf Penguin video loop
using Google Gemini Omni 1.2 Flash (`gemini-omni-1.2-flash`) via the official google-genai
Interactions API with Start Frame == End Frame interpolation, then auto-crop to a crisp 1:1
stage, encode 24 FPS VP9 WebM, and sync straight into bin/Debug & bin/Release!

Usage:
    $env:GEMINI_API_KEY = "AQ...."
    python d:\\chisaln\\app\\scripts\\generate-arctic-veo.py
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

WEB_DIR = Path(r"d:\chisaln\app\web")
ASSETS_DIR = WEB_DIR / "assets"
SEED_SQUARE = ASSETS_DIR / "arctic-stage-seed.png"
SEED_16X9 = ASSETS_DIR / "arctic-stage-seed-16x9.png"
SNOW_TEX = ASSETS_DIR / "arctic-snow-tex.webp"
RAW_MP4 = Path(r"d:\chisaln\app\scripts\arctic-stage-omni-raw.mp4")
OUT_WEBM = ASSETS_DIR / "arctic-stage.webm"
DEBUG_WEB = Path(r"d:\chisaln\app\bin\Debug\net8.0-windows\web")
RELEASE_WEB = Path(r"d:\chisaln\app\bin\Release\net8.0-windows\web")

DEFAULT_PROMPT = (
    "In a single continuous, unbroken shot with no scene cuts, strictly locked static top-down "
    "overhead orthographic camera with zero camera movement, zero pan, zero zoom, and a completely "
    "still warm cream Arches watercolor snow paper background. "
    "Hand-painted Studio Ghibli 2D cel-shaded watercolor animation with consistent fine warm "
    "brown-slate ink outlines, soft periwinkle-lavender watercolor snow shadows, and matte paper grain. "
    "[0-2s] Starting from the exact first frame, the plump white polar bear sleeps cozily curled on "
    "the cream snow, breathing gently as the small translucent sleep bubble expands at its nose, "
    "while the tiny penguin in a knitted red scarf bobs playfully inside the faceted aquamarine ice hole "
    "with gentle watercolor water ripples. "
    "[2-4s] The mischievous red-scarf penguin hops neatly out of the ice hole onto the snow, waddles "
    "two quick tiny steps to the bear, reaches up with one flipper to poke the sleep bubble so it pops "
    "into a delicate puff of white mist, then hurries cheerfully back and splashes into the aquamarine "
    "ice hole, sending soft turquoise ripples across the water. "
    "[4-7s] Startled awake, the polar bear lifts its head groggily, pushes smoothly up into a cozy "
    "sitting pose, blinks and glances around puzzled, scratches gently behind one ear with a paw, "
    "and lets out a big warm sleepy yawn. "
    "[7-10s] Still drowsy, the polar bear settles softly back down onto the snow, tucks its paws under "
    "its chin, closes its eyes, and curls smoothly back into the exact starting sleeping posture as a "
    "fresh sleep bubble forms at its nose while the red-scarf penguin peeks playfully back out of the "
    "ice hole, matching the exact final frame seamlessly. "
    "Keep the outer cream snow background completely uniform, clean, and stationary with zero cliffs, "
    "zero ocean edges, no extra characters, no text, no dialogue, no embellishments."
)

FILE_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")


def build_16x9_seed(src_square: Path, dst_16x9: Path) -> Path:
    """Pad the 1024x1024 square seed cleanly onto a native 1280x720 (16:9) Arches snow canvas."""
    if not src_square.exists():
        raise FileNotFoundError(f"Missing square seed image: {src_square}")

    sq = Image.open(src_square).convert("RGB")
    sq_720 = sq.resize((720, 720), Image.Resampling.LANCZOS)
    sq_arr = np.asarray(sq_720, dtype=np.float32)

    edges = np.vstack([
        sq_arr[:16, :, :].reshape(-1, 3),
        sq_arr[-16:, :, :].reshape(-1, 3),
        sq_arr[:, :16, :].reshape(-1, 3),
        sq_arr[:, -16:, :].reshape(-1, 3),
    ])
    snow_med = np.median(edges, axis=0)

    W, H = 1280, 720
    canvas = np.broadcast_to(snow_med[None, None, :], (H, W, 3)).copy()

    if SNOW_TEX.exists():
        sn = Image.open(SNOW_TEX).convert("RGB").resize((W, H), Image.Resampling.BICUBIC)
        sn_arr = np.asarray(sn, dtype=np.float32)
        sn_blur = np.asarray(sn.filter(ImageFilter.GaussianBlur(14)), dtype=np.float32)
        canvas = np.clip(canvas + (sn_arr - sn_blur) * 0.24, 0, 255)

    ox = (W - 720) // 2
    xx = np.arange(720, dtype=np.float32)
    feather = np.minimum(np.clip(xx / 48.0, 0.0, 1.0), np.clip((719.0 - xx) / 48.0, 0.0, 1.0))
    feather = feather * feather * (3.0 - 2.0 * feather)

    roi = canvas[:, ox:ox + 720, :]
    canvas[:, ox:ox + 720, :] = roi * (1.0 - feather[None, :, None]) + sq_arr * feather[None, :, None]

    Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8)).save(dst_16x9, optimize=True)
    return dst_16x9


def extract_file_id(uri: str | None) -> str | None:
    if not uri:
        return None
    if uri.startswith("files/"):
        fid = uri.removeprefix("files/")
        return fid if FILE_ID_RE.fullmatch(fid) else None
    parsed = urllib.parse.urlparse(uri)
    if parsed.scheme == "https" and parsed.netloc == "generativelanguage.googleapis.com":
        m = re.search(r"/files/([A-Za-z0-9_-]+)", parsed.path)
        return m.group(1) if m else None
    return None


def download_file_uri(file_uri: str, out_path: Path, api_key: str) -> None:
    fid = extract_file_id(file_uri)
    if not fid:
        raise ValueError(f"Unexpected generated video URI: {file_uri}")
    url = f"https://generativelanguage.googleapis.com/v1beta/files/{fid}:download?alt=media"
    fallback_url = f"https://generativelanguage.googleapis.com/files/{fid}?alt=media"
    last_err = None
    for dl_url in (fallback_url, url):
        try:
            req = urllib.request.Request(dl_url)
            req.add_header("x-goog-api-key", api_key)
            with urllib.request.urlopen(req, timeout=480) as resp:
                out_path.parent.mkdir(parents=True, exist_ok=True)
                with out_path.open("wb") as f:
                    while True:
                        chunk = resp.read(16384)
                        if not chunk:
                            break
                        f.write(chunk)
            return
        except Exception as e:
            last_err = e
    raise RuntimeError(f"Failed downloading generated video: {last_err}")


def mirror_builds() -> None:
    for target in (DEBUG_WEB, RELEASE_WEB):
        res = subprocess.run(
            ["robocopy", str(WEB_DIR), str(target), "/MIR", "/NFL", "/NDL", "/NJH", "/NJS", "/NC", "/NS"],
            capture_output=True,
            text=True,
        )
        if res.returncode >= 8:
            raise RuntimeError(f"robocopy to {target} failed (code {res.returncode}): {res.stderr}")


def encode_stage_webm(input_mp4: Path, out_webm: Path, fps: int = 24, size: int = 720, crop_square: bool = True) -> None:
    if crop_square:
        vf = f"fps={fps},crop='min(iw,ih)':'min(iw,ih)',scale={size}:{size}:flags=lanczos"
    else:
        vf = f"fps={fps},scale='min({size},iw)':-2:flags=lanczos"
    cmd = [
        "ffmpeg", "-y", "-i", str(input_mp4),
        "-an",
        "-vf", vf,
        "-c:v", "libvpx-vp9", "-crf", "26", "-b:v", "0",
        "-row-mt", "1", "-deadline", "good", "-cpu-used", "2",
        "-auto-alt-ref", "0",
        str(out_webm),
    ]
    res = subprocess.run(cmd, check=False)
    if res.returncode != 0:
        raise RuntimeError(f"FFmpeg encode failed (exit {res.returncode})")


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate Arctic AI Video loop via Gemini Omni 1.2 Flash")
    parser.add_argument("--model", default="gemini-omni-1.2-flash", help="Gemini Omni video model ID")
    parser.add_argument("--duration", type=int, default=10, help="Clip duration in seconds (3..10)")
    parser.add_argument("--fps", type=int, default=24, help="Output WebM FPS")
    parser.add_argument("--size", type=int, default=720, help="Output square WebM resolution")
    parser.add_argument("--prompt", default=DEFAULT_PROMPT, help="Custom animation prompt")
    parser.add_argument("--api-key", default=None, help="Gemini API key (defaults to GEMINI_API_KEY env var)")
    parser.add_argument("--poll-id", default=None, help="Resume polling & downloading an existing background interaction ID")
    parser.add_argument("--prepare-seed-only", action="store_true", help="Only build the 16:9 seed image and exit")
    parser.add_argument("--no-encode", action="store_true", help="Download raw MP4 only (skip WebM encode/sync)")
    args = parser.parse_args()

    seed_path = build_16x9_seed(SEED_SQUARE, SEED_16X9)
    print(f"[1/4] Native 16:9 seed ready: {seed_path} (1280x720)", flush=True)
    if args.prepare_seed_only:
        mirror_builds()
        print("[OK] Dry-run complete and synced to Debug & Release.", flush=True)
        return 0

    api_key = args.api_key or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print("[ERROR] GEMINI_API_KEY not set.", file=sys.stderr)
        return 2

    from google import genai

    client = genai.Client(api_key=api_key)
    t0 = time.time()

    if args.poll_id:
        inter_id = args.poll_id
        print(f"[2/4] Resuming background interaction: {inter_id}", flush=True)
        interaction = client.interactions.get(inter_id, timeout=60.0)
    else:
        print("[2/4] Uploading seed frame to Gemini Files API...", flush=True)
        uploaded = client.files.upload(file=str(seed_path))
        file_name = uploaded.name
        while getattr(uploaded.state, "name", str(uploaded.state)) == "PROCESSING":
            time.sleep(2)
            uploaded = client.files.get(name=file_name)
        state_name = getattr(uploaded.state, "name", str(uploaded.state))
        if state_name != "ACTIVE":
            raise RuntimeError(f"Uploaded seed file failed activation: state={state_name}")

        fid = extract_file_id(uploaded.uri or uploaded.name)
        norm_uri = f"https://generativelanguage.googleapis.com/files/{fid}"
        mime = uploaded.mime_type or "image/png"
        print(f"      Uploaded ACTIVE file: {norm_uri} ({mime})", flush=True)

        # Supply the exact same seed image as BOTH Start Frame AND End Frame for a 100% seamless loop!
        input_parts = [
            {"type": "image", "uri": norm_uri, "mime_type": mime},
            {"type": "image", "uri": norm_uri, "mime_type": mime},
            {"type": "text", "text": args.prompt},
        ]
        video_config = {
            "type": "video",
            "aspect_ratio": "16:9",
            "delivery": "uri",
            "duration": f"{args.duration}s",
        }

        print(f"[3/4] Submitting {args.duration}s 16:9 AI video job to '{args.model}' (background polling)...", flush=True)
        interaction = client.interactions.create(
            model=args.model,
            input=input_parts,
            response_format=video_config,
            background=True,
            timeout=60.0,
        )
        inter_id = interaction.id
        print(f"      Interaction ID: {inter_id} (status={getattr(interaction, 'status', None)})", flush=True)

    while getattr(interaction, "status", None) in ("in_progress", "pending", "queued", None):
        elapsed = int(time.time() - t0)
        print(f"      Rendering on Gemini Omni... ({elapsed}s, status={getattr(interaction, 'status', None)})", flush=True)
        time.sleep(10)
        interaction = client.interactions.get(inter_id, timeout=60.0)

    status = getattr(interaction, "status", None)
    if status != "completed":
        errs = getattr(interaction, "errors", None) or getattr(interaction, "error", None)
        raise RuntimeError(f"Interaction did not complete: status={status} errors={errs}")
    print(f"      Interaction completed in {time.time() - t0:.1f}s! id={inter_id}", flush=True)

    output_video = getattr(interaction, "output_video", None)
    video_uri = getattr(output_video, "uri", None) if output_video else None
    if not video_uri:
        # Fallback inspection if output lives in interaction.outputs
        for part in (getattr(interaction, "outputs", None) or []):
            u = getattr(part, "uri", None) or (part.get("uri") if isinstance(part, dict) else None)
            if u:
                video_uri = u
                break
    if not video_uri:
        raise RuntimeError(f"No video URI returned in interaction response: {interaction}")

    print(f"      Downloading generated video: {video_uri}", flush=True)
    download_file_uri(video_uri, RAW_MP4, api_key)
    raw_mb = RAW_MP4.stat().st_size / (1024 * 1024)
    print(f"      Saved raw MP4: {RAW_MP4} ({raw_mb:.2f} MB)", flush=True)

    if args.no_encode:
        print("[DONE] Raw MP4 saved (--no-encode).", flush=True)
        return 0

    encode_stage_webm(RAW_MP4, OUT_WEBM, fps=args.fps, size=args.size, crop_square=True)
    out_kb = OUT_WEBM.stat().st_size / 1024
    print(f"[4/4] Encoded 1:1 VP9 WebM: {OUT_WEBM} ({out_kb:.1f} KB)", flush=True)

    mirror_builds()
    print("[DONE] Synced to bin/Debug & bin/Release! Click 'Tải lại' in the app to watch.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
