# SPEC.md — Project Specification

> **Status**: `FINALIZED`

## Vision
Replace `jetdb` with `lmdb` across the zaileys codebase to ensure a more efficient, powerful, fast, and reliable database system without relying on abstract wrappers.

## Goals
1. Remove `jetdb` dependency completely.
2. Integrate `lmdb` natively into the configuration.
3. Rewrite consumers (Auth, Health, Client, Listeners) to leverage native key-value API and range operations.

## Success Criteria
- [ ] `jetdb` is removed from `package.json`
- [ ] `lmdb` is added to `package.json`
- [ ] Project builds successfully without type errors (`npm run build`).
