---
phase: 1
plan: 4
wave: 3
---

# Plan 1.4: Dependencies & Final Build Verification

## Objective
Finalize the dependency manifest and perform a complete TypeScript build to catch any lingering `jetdb` interfaces.

## Context
- package.json

## Tasks

<task type="auto">
  <name>Update Package Dependencies</name>
  <files>package.json</files>
  <action>
    - Drop `jetdb` completely from `dependencies`/`devDependencies`.
    - Ensure `lmdb` is present in dependencies.
  </action>
  <verify>npm list jetdb --depth=0 || true</verify>
  <done>package.json correctly declares lmdb.</done>
</task>

<task type="auto">
  <name>Verify Production Build</name>
  <files>src/*</files>
  <action>
    - Run `pnpm run build` or `npm run build` to verify standard TSC emissions succeed without syntax or structural property errors concerning missing jetdb functionality across the workspace.
  </action>
  <verify>npm run build</verify>
  <done>Build finishes successfully with exit code 0.</done>
</task>

## Success Criteria
- [ ] Build verifies entirely.
