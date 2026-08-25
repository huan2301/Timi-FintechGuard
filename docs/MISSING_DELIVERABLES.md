# Missing-file audit

This is the current file-level status after reviewing the repository Markdown,
checklists, workflows and referenced paths.

## Completed in this pass

- Golden runners are no longer empty: `eval/runners/run_all.py`,
  `run_transaction_golden.py`, and `run_guardian_golden.py` now validate and
  count contract cases.
- Golden changelogs exist for all five suites.
- `docs/BASELINE_REPORT.md` now provides the stable baseline-report path.
- `presentation/pitch_deck.md` contains the deck source outline.

## Still missing as real deliverables

| File/artifact | Reason | Status |
|---|---|---|
| `presentation/pitch_deck.pptx` | Requires final slide design/export | Manual creation required |
| `presentation/video_demo.mp4` | Requires screen recording and upload | Manual recording required |
| `docs/PHASE2_REPORT.md` | Phase 2 is roadmap-only | Do not create until Phase 2 work exists |
| `prompts/manager_v0.1.yaml` | Phase 2 Manager not implemented | Planned, not current MVP |
| `schemas/manager_recommendation.json` | Phase 2 Manager schema not implemented | Planned, not current MVP |
| `eval/scripts/run_manager_mock.py` | Phase 2 Manager mock not implemented | Planned, not current MVP |

## Documentation path mismatches

Some older architecture documents reference `src/app/api/...`, while the
maintained implementation is under `src/app/routers/api/...`. Those references
should be corrected in a documentation cleanup pass; compatibility facades in
`src/app/api/` exist only for older test imports.

Tutorial examples under `docs/guide/` intentionally use generic template paths
such as `app/api/chat.py`; they are educational examples, not missing project
files.

