# RFG Cut Agent

This repository-local Codex plugin is the AI-driven path for RFG Cut.

It does not contain or require an OpenAI API key. In a Codex-hosted workflow, Codex interprets the user's intent and project context using the host allowance, while this plugin supplies bounded local tools:

- `rfg_cut_create_review_plan`: normalizes timestamped transcript lines into highlight and cleanup candidates. It creates no edit.
- `rfg_cut_publish_narrative_plan`: validates a Codex-authored, review-required restructuring plan whose every beat maps back to original timestamped speech. It creates no edit.
- `rfg_cut_render_rough_cut`: creates a new MP4 with FFmpeg from exact user-confirmed ranges. It refuses to overwrite an existing output file.
- `rfg_cut_get_context` / `rfg_cut_get_export`: lock plans to the active source and expose actual asynchronous export state.

The safety boundary is intentional: a proposed cut is never an approved cut. The agent must show candidates and wait for an explicit confirmation before it renders.

The RFG Cut editor's **复制 AI 编辑任务** button creates a fresh context lock and copies a ready-to-paste Codex task. Media stays in the local workspace; only the Brief and timestamped transcript are exposed through MCP.

## Local checks

```bash
node scripts/rfg-cut-mcp.mjs
```

The server speaks MCP JSON-RPC over standard input/output. The repository test workflow validates the plugin manifest and calls the review-plan tool with a timestamped sample.

## Local return channel

From the RFG Cut project root, run `npm start`. It launches the editor and loopback media service together. When a narrative plan is published, the editor receives it from `http://127.0.0.1:8791`. The service accepts only loopback hosts/origins and keeps media under the ignored `.rfg-cut/` workspace. Set `RFG_CUT_BRIDGE_URL` only for another local loopback address.
