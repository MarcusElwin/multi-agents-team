---
name: post-image
description: Generate MAT-branded blog illustrations with Nano Banana (Google's Gemini image models) for blog posts about the nine multi-agent architectures. Use when a blog section needs a hero image or a visual metaphor for an architecture pattern, or when the user asks for a post image / blog illustration.
---

# Post Image (Nano Banana)

Generate editorial illustrations for blog posts in `docs/blog/`. The visual
language follows MAT's brand (mat.umai-tech.com): warm stone/ink neutrals,
a single amber accent, generous negative space — calm, technical, premium.

## Style contract (non-negotiable)

Every image must be:

- **Brand palette only** — warm ink `#1c1917` (stone-900), warm off-white /
  cream background, soft stone tints, and a single **amber accent `#d97706`**.
  Duotone/limited-palette editorial illustration, never photographic stock.
- **Clean and minimal** — modern editorial illustration or subtle isometric
  line art. Think premium engineering-blog figure, not clip art.
- **About the concept** — a visual metaphor for the section's idea (agents as
  a team: conductors, orchestras, org trees, whiteboards, courtrooms, auction
  floors, relay runners, ant trails, networks of nodes).
- **No text, no letters, no numbers, no captions, no logos, no watermark** —
  all copy lives in the post, never in the image.
- **16:9 or wider**, 2K minimum, so it holds up as a full-width Medium figure.

## Workflow

1. **Pick the concept.** Write a one-line visual metaphor for the section.
   Examples:
   - Orchestrated → a conductor on a podium directing three musicians in sequence.
   - Market → an auction floor where bidders raise paddles toward a posted board.
   - Swarm → an ant trail converging on a shared canvas, traces accumulating.
2. **Generate** with the helper script. `GEMINI_API_KEY` must be set — source
   it from the agentproduct.dev project if not in the environment:

   ```bash
   set -a; source /Users/marcus.elwin/Desktop/Code/private/agentproduct.dev/.env; set +a
   python3 .claude/skills/post-image/scripts/generate.py \
     --concept "a conductor on a podium directing three musicians in sequence" \
     --slug v1-orchestrated --size 2K --aspect 16:9
   ```

   Writes `docs/blog/images/<slug>.jpg` (relative to the project root).

3. **Wire it into the post** — standard markdown figure:

   ```markdown
   ![Orchestrated: a conductor directing specialists](images/v1-orchestrated.jpg)
   ```

4. **Review** — confirm palette compliance, on-concept, and text-free.
   Regenerate with a sharper metaphor if not.

## Model

Default is **Nano Banana Pro** (`gemini-3-pro-image`), which supports 2K/4K.
Fall back to `gemini-2.5-flash-image` if the Pro model isn't available on the
key. Override with `--model` or `NANO_BANANA_MODEL`.

## Variants

- `--style hero` (default) — full-bleed editorial illustration for section
  headers and the post hero.
- `--style spot` — small spot illustration on pure white, extra negative
  space, for inline figures next to text.
