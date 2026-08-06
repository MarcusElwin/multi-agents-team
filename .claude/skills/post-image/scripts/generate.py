#!/usr/bin/env python3
"""
Generate a MAT-branded blog illustration with Nano Banana
(Google's Gemini image models) via the Interactions API.

Usage:
    export GEMINI_API_KEY=...            # https://aistudio.google.com/apikey
    pip install google-genai
    python generate.py --concept "a conductor directing three musicians in sequence" \
        --slug v1-orchestrated --size 2K --aspect 16:9

Writes: docs/blog/images/<slug>.jpg  (relative to the project root)

Models (Interactions API):
    gemini-3-pro-image     Nano Banana Pro — best fidelity, 2K/4K   (default)
    gemini-2.5-flash-image speed-optimized fallback
See https://ai.google.dev/gemini-api/docs/image-generation
"""
import argparse
import base64
import os
import sys
from pathlib import Path

STYLES = {
    "hero": (
        "Premium editorial illustration for a technical engineering blog post. "
        "Strict limited palette: warm ink near-black #1c1917, warm off-white "
        "cream background, soft warm stone-gray tints, and a single amber accent "
        "#d97706. Clean modern flat illustration with subtle depth, elegant and "
        "minimal — premium engineering-blog figure aesthetic, NOT clip art, NOT "
        "photographic. A clear visual metaphor for: {concept}. World of AI agents "
        "working as a team: abstract figures, nodes and connections, conductors, "
        "org trees, whiteboards, auction floors, ant trails. Absolutely NO text, "
        "NO letters, NO numbers, NO captions, NO logos, NO watermark. Crisp, high "
        "resolution, suitable as a full-width blog figure with generous negative "
        "space."
    ),
    "spot": (
        "Minimal spot illustration on a pure white background for a technical "
        "blog post. Strict limited palette: warm ink near-black #1c1917 linework "
        "with a single amber #d97706 accent. Clean single-weight line art with "
        "flat color fills, lots of negative space, centered composition. Elegant, "
        "premium, editorial — NOT clip art, NOT photographic. A clear visual "
        "metaphor for: {concept}. Absolutely NO text, NO letters, NO numbers, NO "
        "captions, NO logos, NO watermark. Crisp vector-like quality at high "
        "resolution."
    ),
}

DEFAULT_MODEL = "gemini-3-pro-image"  # Nano Banana Pro


def project_root() -> Path:
    # <root>/.claude/skills/post-image/scripts/
    return Path(__file__).resolve().parents[4]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--concept", required=True, help="One-line visual metaphor for the section.")
    ap.add_argument("--slug", required=True, help="Output filename stem, e.g. v1-orchestrated.")
    ap.add_argument("--style", default="hero", choices=sorted(STYLES))
    ap.add_argument("--model", default=os.environ.get("NANO_BANANA_MODEL", DEFAULT_MODEL))
    ap.add_argument("--size", default="2K", choices=["512px", "1K", "2K", "4K"])
    ap.add_argument("--aspect", default="16:9", help='e.g. "16:9", "21:9", "1:1".')
    ap.add_argument("--out", default=None, help="Override output path.")
    args = ap.parse_args()

    try:
        from google import genai
    except ImportError:
        print("Install the SDK first:  pip install google-genai", file=sys.stderr)
        return 1

    if not (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")):
        print("Set GEMINI_API_KEY (https://aistudio.google.com/apikey).", file=sys.stderr)
        return 1

    out = Path(args.out) if args.out else project_root() / "docs" / "blog" / "images" / f"{args.slug}.jpg"
    out.parent.mkdir(parents=True, exist_ok=True)

    client = genai.Client()
    interaction = client.interactions.create(
        model=args.model,
        input=STYLES[args.style].format(concept=args.concept),
        response_format={
            "type": "image",
            "mime_type": "image/jpeg",
            "aspect_ratio": args.aspect,
            "image_size": args.size,
        },
    )

    out.write_bytes(base64.b64decode(interaction.output_image.data))
    print(f"Wrote {out}")
    print(f"Wire it in:\n  ![...](images/{args.slug}.jpg)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
