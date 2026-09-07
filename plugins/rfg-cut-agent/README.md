# RFG Cut Agent

This repository-local Codex plugin is the AI-driven path for RFG Cut.

It does not contain or require an OpenAI API key. In a Codex-hosted workflow, Codex interprets the user's intent and project context using the host allowance, while this plugin supplies two bounded local tools:

- `rfg_cut_create_review_plan`: normalizes timestamped transcript lines into highlight and cleanup candidates. It creates no edit.
- `rfg_cut_render_rough_cut`: creates a new MP4 with FFmpeg from exact user-confirmed ranges. It refuses to overwrite an existing output file.

The safety boundary is intentional: a proposed cut is never an approved cut. The agent must show candidates and wait for an explicit confirmation before it renders.

The RFG Cut web app's **交给 Codex** button copies the Brief and current transcript into a ready-to-paste Codex prompt.

## Local checks

```bash
node scripts/rfg-cut-mcp.mjs
```

The server speaks MCP JSON-RPC over standard input/output. The repository test workflow validates the plugin manifest and calls the review-plan tool with a timestamped sample.
