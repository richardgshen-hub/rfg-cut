# RFG Cut Agent

This repository-local Codex plugin is the AI-driven path for RFG Cut.

It does not contain or require an OpenAI API key. In a Codex-hosted workflow, Codex interprets the user's intent and project context using the host allowance, while this plugin supplies three bounded local tools:

- `rfg_cut_create_review_plan`: normalizes timestamped transcript lines into highlight and cleanup candidates. It creates no edit.
- `rfg_cut_publish_narrative_plan`: validates a Codex-authored, review-required restructuring plan whose every beat maps back to original timestamped speech. It creates no edit.
- `rfg_cut_render_rough_cut`: creates a new MP4 with FFmpeg from exact user-confirmed ranges. It refuses to overwrite an existing output file.

The safety boundary is intentional: a proposed cut is never an approved cut. The agent must show candidates and wait for an explicit confirmation before it renders.

The RFG Cut web app's **交给 Codex** button copies the Brief and current transcript into a ready-to-paste Codex prompt.

## Local checks

```bash
node scripts/rfg-cut-mcp.mjs
```

The server speaks MCP JSON-RPC over standard input/output. The repository test workflow validates the plugin manifest and calls the review-plan tool with a timestamped sample.

## Optional local return channel

From the RFG Cut project root, run `npm run agent:bridge` before starting a Codex task. When `rfg_cut_create_review_plan` or `rfg_cut_publish_narrative_plan` finishes, the MCP server attempts to return its review-only plan to `http://127.0.0.1:8787`; the RFG Cut browser UI then displays it in the Codex panel. The bridge is optional, loopback-only, and never transfers media files. Set `RFG_CUT_BRIDGE_URL` only when using another local loopback address.
