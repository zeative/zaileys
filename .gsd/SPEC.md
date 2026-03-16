# SPEC.md — Project Specification

> **Status**: `FINALIZED`

## Vision
Zaileys is an established simplified WhatsApp Node.js TypeScript/JavaScript API wrapper based on Baileys. The current objective is to ensure code quality and standard compliance by introducing Husky for git hooks.

## Goals
1. Maintain existing WhatsApp API features natively.
2. Introduce `husky` to automate pre-commit checks.
3. Ensure the commit process is clean, error-free, and automated.

## Non-Goals (Out of Scope)
- Developing new features for the underlying WhatsApp wrapper.
- Changing the existing JetDB integration or Baileys dependencies.

## Users
- Developers maintaining the Zaileys repository.
- Open-source contributors who will clone and submit pull requests.

## Constraints
- Must use existing package manager (`pnpm`).
- Must not break the existing TS build pipeline (`tsup`).

## Success Criteria
- [ ] Husky is installed and `prepare` script is added.
- [ ] Pre-commit hook is operational and runs basic validations or checks before commit.
- [ ] Commitlint is installed and configured with `commit-msg` hook to ensure conventional commits.
