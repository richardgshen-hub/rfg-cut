---
name: rfg-cut
description: Use when the user wants a review-first AI edit plan or a local rough cut for a Chinese talking-head, interview, event recap, or podcast clip.
---

# RFG Cut Agent

RFG Cut is a review-first editing workflow. The host agent provides reasoning using its own allowance; the local MCP tools normalize the edit plan and can render confirmed segments with FFmpeg.

## Workflow

1. Collect the source-media path, the content Brief, and a timestamped transcript. Ask for missing material rather than inventing it.
2. Identify three kinds of *candidates*: semantic-safe filler words, long pauses, and likely breath gaps. Do not represent candidates as edits already made.
3. Call `rfg_cut_create_review_plan` with the source-media label, Brief, and transcript.
4. Present the returned highlights and cleanup candidates in concise Chinese. Explain why each highlight is narratively complete and why each cleanup candidate needs review.
5. Wait for explicit confirmation of the exact segments. Never call the renderer from a proposal alone.
6. After confirmation, call `rfg_cut_render_rough_cut` with an existing source file, a new output path, and only the confirmed time ranges. State that the MP4 is a rough cut and must still be watched through before publishing.

## Editorial boundaries

- Preserve meaning, speaker intent, and natural breathing. Do not automatically remove every pause or verbal tic.
- Do not invent quotes, scenes, B-roll, or evidence that is not in the supplied media/transcript.
- Treat a demo transcript as planning material only. Never render from it without an actual source file and confirmed ranges.
- A local rendering action creates a file and requires user approval.
