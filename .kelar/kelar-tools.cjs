#!/usr/bin/env node
'use strict';

/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║           KELAR TOOLS v2 — Ultra Magic Edition               ║
 * ║                                                               ║
 * ║  The brain behind KELAR's multi-agent system.                 ║
 * ║  Not just a CLI — a context intelligence layer.               ║
 * ╚═══════════════════════════════════════════════════════════════╝
 *
 * STANDARD (v1):
 *   state get|patch|snapshot
 *   tasks log|active|complete|pause
 *   memory search|save|index
 *   patterns get|set|list
 *   handoff write|read
 *   plan validate|tasks|wave
 *   git status|changed|commit|checkpoint
 *   debt add|list
 *   session start|end
 *   health · version
 *
 * ULTRA MAGIC (v2):
 *   context build [task]     Token-aware context assembler for agents
 *   context inject [agent]   Generate complete Task() spawn prompt, pre-loaded
 *   scan risk [path]         Static analysis: secrets, N+1, empty catch, any types
 *   scan imports [file]      Full import dependency graph for a file
 *   impact score [file]      0-100 importance score based on dependents
 *   diff smart [from] [to]   Semantic diff: breaking changes, new exports
 *   tokens estimate [path]   Token count per file/dir, context window fit
 *   plan generate [desc]     Auto-generate XML plan skeleton from description
 *   knowledge extract        Analyze git commits, suggest knowledge entries
 *   timeline [N]             Project timeline from TASKS.md + git log
 *   debt score               Technical debt score (0-100) with trend tracking
 *   similar [file]           Find 5 most structurally similar files
 *   watch [path]             File watcher: auto-log changes to TASKS.md
 *   agent brief [name]       Complete spawn prompt for any KELAR agent
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── Config ────────────────────────────────────────────────────────────────────
const VERSION = '2.0.0';
const KELAR_DIR = findKelarDir();

function p(rel) { return path.join(KELAR_DIR, rel); }
const STATE_F    = p('state/STATE.md');
const TASKS_F    = p('state/TASKS.md');
const PATTERNS_F = p('state/PATTERNS.md');
const DEBT_F     = p('state/DEBT.md');
const DIARY_F    = p('state/DIARY.md');
const HANDOFF_F  = p('state/HANDOFF.md');
const MEMORY_DIR = p('memory');
const MEMORY_IDX = p('memory/INDEX.md');
const AGENTS_DIR = p('agents');

function findKelarDir() {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const c = path.join(dir, '.kelar');
    if (fs.existsSync(c)) return c;
    dir = path.dirname(dir);
  }
  return path.join(process.cwd(), '.kelar');
}

// ─── Utils ─────────────────────────────────────────────────────────────────────
const now     = () => new Date().toISOString().replace('T', ' ').split('.')[0];
const nowDate = () => new Date().toISOString().split('T')[0];
const readF   = f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
const appendF = (f, s) => { ensureF(f); fs.appendFileSync(f, '\n' + s, 'utf8'); };
const ensureF = (f, d = '') => {
  if (!fs.existsSync(f)) {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, d);
  }
};

function out(data) {
  process.stdout.write((typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data)) + '\n');
}
function die(msg) { process.stderr.write('ERROR: ' + msg + '\n'); process.exit(1); }
function bash(cmd) {
  try { return execSync(cmd, { encoding: 'utf8' }).trim(); }
  catch { return ''; }
}

function walkFiles(dir, exts) {
  const defaultExts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs'];
  const useExts = exts !== undefined ? exts : defaultExts;
  const result = [];
  const ignored = new Set(['node_modules', '.git', '.kelar', 'dist', 'build', '.next', 'coverage', '__pycache__']);
  if (!fs.existsSync(dir)) return result;
  function recurse(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory() && !ignored.has(e.name)) recurse(full);
      else if (e.isFile() && (useExts.length === 0 || useExts.some(x => e.name.endsWith(x)))) result.push(full);
    }
  }
  recurse(dir);
  return result;
}

function estimateTokens(text) { return Math.ceil(text.length / 4); }

// ═══════════════════════════════════════════════════════════════════════════════
// V1 — STANDARD COMMANDS
// ═══════════════════════════════════════════════════════════════════════════════

function stateGet(field) {
  const c = readF(STATE_F);
  const m = c.match(new RegExp(`^${field}\\s*:\\s*(.+)$`, 'm'));
  if (m) { out(m[1].trim()); return; }
  const s = c.match(new RegExp(`^## ${field}\\s*\\n([\\s\\S]*?)(?=^## |$)`, 'm'));
  out(s ? s[1].trim() : '');
}
function statePatch(field, value) {
  let c = readF(STATE_F);
  const re = new RegExp(`^(${field}\\s*:\\s*)(.+)$`, 'm');
  c = re.test(c) ? c.replace(re, `$1${value}`) : c + `\n${field}: ${value}`;
  fs.writeFileSync(STATE_F, c, 'utf8');
  out({ ok: true, field, value });
}
function stateSnapshot() {
  const c = readF(STATE_F);
  const snap = {};
  for (const f of ['Type', 'Stack', 'Working on', 'Progress']) {
    const m = c.match(new RegExp(`^${f}\\s*:\\s*(.+)$`, 'm'));
    if (m) snap[f.toLowerCase().replace(/ /g, '_')] = m[1].trim();
  }
  const fm = c.match(/## Current Feature\s*\n([\s\S]*?)(?=^## |$)/m);
  if (fm) snap.current_feature = fm[1].trim().split('\n')[0];
  out(snap);
}

function tasksLog(type, message) {
  const ts = now();
  const map = {
    start:         `\n## [${ts}] TASK STARTED\n${message}`,
    done:          `[${ts}] ✅ ${message}`,
    pause:         `\n## [${ts}] PAUSED ⏸\n${message}`,
    note:          `[${ts}] 📝 ${message}`,
    notice:        `[${ts}] 🔍 NOTICED: ${message}`,
    knowledge:     `[${ts}] 📚 KNOWLEDGE: ${message}`,
    error:         `[${ts}] ❌ ERROR: ${message}`,
    wave:          `\n### [${ts}] WAVE COMPLETE\n${message}`,
    feature_start: `\n## [${ts}] FEATURE STARTED: ${message}`,
    feature_done:  `\n## [${ts}] FEATURE COMPLETE ✅: ${message}`,
    fix_start:     `\n## [${ts}] FIX STARTED: ${message}`,
    fix_done:      `\n## [${ts}] FIX COMPLETE ✅: ${message}`,
  };
  appendF(TASKS_F, map[type] || `[${ts}] ${type.toUpperCase()}: ${message}`);
  out({ ok: true, type, timestamp: ts });
}
function tasksActive() {
  const content = readF(TASKS_F);
  const blocks = content.split(/(?=^## \[)/m).filter(Boolean);
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    if (block.includes('TASK STARTED') || block.includes('FEATURE STARTED')) {
      const name = block.match(/STARTED[^:]*:\s*(.+)/)?.[1]?.trim() || 'unknown';
      const completedLater = blocks.slice(i + 1).some(b =>
        b.includes('COMPLETE') && b.includes(name.split(' ').slice(0, 3).join(' '))
      );
      if (!completedLater) {
        out({ name, status: block.includes('PAUSED') ? 'paused' : 'active', next_step: block.match(/Next step\s*:\s*(.+)/)?.[1]?.trim() || null });
        return;
      }
    }
  }
  out({ name: null, status: 'idle', next_step: null });
}
function tasksPause(id, nextStep) {
  appendF(TASKS_F, `\n## [${now()}] PAUSED ⏸\nTask    : ${id}\nNext step : ${nextStep}\nResume with: /kelar:resume`);
  out({ ok: true, next_step: nextStep });
}

function memorySearch(query) {
  if (!fs.existsSync(MEMORY_DIR)) { out([]); return; }
  const results = [];
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  function searchDir(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { searchDir(full); continue; }
      if (!e.name.endsWith('.md')) continue;
      const raw = readF(full);
      const lower = raw.toLowerCase();
      let score = 0;
      for (const w of words) score += (lower.match(new RegExp(w, 'g')) || []).length;
      if (score > 0) {
        results.push({
          file: full.replace(KELAR_DIR, '.kelar'),
          title: raw.match(/^##\s+(.+)/m)?.[1] || e.name,
          score,
          snippet: raw.split('\n').find(l => words.some(w => l.toLowerCase().includes(w)))?.trim().substring(0, 120) || '',
        });
      }
    }
  }
  searchDir(MEMORY_DIR);
  out(results.sort((a, b) => b.score - a.score).slice(0, 5));
}
function memorySave(category, title, content) {
  const valid = ['domain', 'technical', 'solutions', 'environment'];
  if (!valid.includes(category)) die(`Category: ${valid.join(', ')}`);
  const fileName = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.md';
  const filePath = path.join(MEMORY_DIR, category, fileName);
  const entry = `## ${title}\nAdded: ${nowDate()}\n\n${content}\n`;
  if (fs.existsSync(filePath)) fs.appendFileSync(filePath, '\n---\n\n' + entry, 'utf8');
  else { fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(filePath, entry, 'utf8'); }
  memoryRebuildIndex();
  out({ ok: true, file: filePath.replace(KELAR_DIR, '.kelar'), category, title });
}
function memoryRebuildIndex() {
  if (!fs.existsSync(MEMORY_DIR)) return;
  const cats = { domain: [], technical: [], solutions: [], environment: [] };
  for (const cat of Object.keys(cats)) {
    const d = path.join(MEMORY_DIR, cat);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      if (!f.endsWith('.md')) continue;
      const raw = readF(path.join(d, f));
      cats[cat].push({ title: raw.match(/^##\s+(.+)/m)?.[1] || f.replace('.md', ''), summary: (raw.split('\n').find(l => l.length > 20 && !l.startsWith('#') && !l.startsWith('Added:')) || '').trim().substring(0, 80) });
    }
  }
  const lines = [`# KELAR Knowledge Index\nLast updated: ${nowDate()}\n`,
    ...Object.entries(cats).map(([cat, entries]) => `## ${cat.charAt(0).toUpperCase() + cat.slice(1)}\n` + (entries.length ? entries.map(e => `- **${e.title}** — ${e.summary}`).join('\n') : '*(none yet)*'))
  ];
  fs.writeFileSync(MEMORY_IDX, lines.join('\n\n'), 'utf8');
  out({ ok: true, total: Object.values(cats).flat().length });
}

function patternsGet(cat) {
  const c = readF(PATTERNS_F);
  const m = c.match(new RegExp(`## ${cat}[^\n]*\n([\\s\\S]*?)(?=^## |$)`, 'm'));
  out(m ? { category: cat, pattern: m[1].trim() } : { category: cat, pattern: null });
}
function patternsSet(cat, pattern) {
  let c = readF(PATTERNS_F);
  const re = new RegExp(`## ${cat}[^\n]*\n[\\s\\S]*?(?=^## |$)`, 'm');
  const entry = `## ${cat} — ${nowDate()}\n${pattern}\n\n`;
  fs.writeFileSync(PATTERNS_F, re.test(c) ? c.replace(re, entry) : c + '\n' + entry, 'utf8');
  out({ ok: true, category: cat });
}
function patternsList() {
  out([...readF(PATTERNS_F).matchAll(/^## (.+?) —/gm)].map(m => m[1].trim()));
}

function handoffWrite() {
  const tasks = readF(TASKS_F);
  const recent = tasks.split('\n').slice(-40).join('\n');
  const last = (tasks.match(/## \[(.+?)\] (?:TASK STARTED|PAUSED)[^\n]*\n([^#]+)/g) || []).at(-1) || '';
  const nextStep = last.match(/Next step\s*:\s*(.+)/)?.[1] || 'Check TASKS.md';
  const feature = readF(STATE_F).match(/Working on\s*:\s*(.+)/)?.[1]?.trim() || 'Unknown';
  fs.writeFileSync(HANDOFF_F, `# KELAR HANDOFF\nGenerated: ${now()}\n\n## Status\nFeature   : ${feature}\nNext step : ${nextStep}\n\n## Recent Activity\n\`\`\`\n${recent}\n\`\`\`\n\n## Resume\n1. Run /kelar:resume\n2. Confirm next step\n`, 'utf8');
  out({ ok: true, next_step: nextStep, feature });
}
function handoffRead() {
  const c = readF(HANDOFF_F);
  if (!c) { out({ exists: false }); return; }
  out({ exists: true, feature: c.match(/Feature\s*:\s*(.+)/)?.[1]?.trim() || null, next_step: c.match(/Next step\s*:\s*(.+)/)?.[1]?.trim() || null, generated: c.match(/Generated:\s*(.+)/)?.[1]?.trim() || null, raw: c });
}

function planValidate(file) {
  if (!fs.existsSync(file)) die(`Not found: ${file}`);
  const c = readF(file);
  const errors = [], warnings = [];
  if (!c.includes('<kelar_plan>')) errors.push('Missing <kelar_plan>');
  if (!c.includes('<meta>')) errors.push('Missing <meta>');
  if (!c.includes('<goal>')) errors.push('Missing <goal>');
  if (!c.includes('<wave')) errors.push('No waves defined');
  for (const t of [...c.matchAll(/<task id="([^"]+)">/g)]) {
    const id = t[1];
    const body = c.slice(c.indexOf(`<task id="${id}">`), c.indexOf('</task>', c.indexOf(`<task id="${id}">`)));
    if (!body.includes('<action>')) warnings.push(`Task ${id}: missing <action>`);
    if (!body.includes('<done>'))   warnings.push(`Task ${id}: missing <done>`);
    if (!body.includes('<file>'))   errors.push(`Task ${id}: missing <file>`);
  }
  out({ valid: errors.length === 0, task_count: [...c.matchAll(/<task id="/g)].length, errors, warnings });
}
function planTasks(file) {
  if (!fs.existsSync(file)) die(`Not found: ${file}`);
  const c = readF(file);
  const ex = (body, tag) => { const m = body.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)); return m ? m[1].trim() : null; };
  out([...c.matchAll(/<task id="([^"]+)">([\s\S]*?)<\/task>/g)].map(m => {
    const dep = ex(m[2], 'depends_on');
    return { id: m[1], title: ex(m[2], 'title'), file: ex(m[2], 'file'), action: ex(m[2], 'action'), verify: ex(m[2], 'verify'), done: ex(m[2], 'done'), depends_on: dep ? dep.split(',').map(s => s.trim()).filter(Boolean) : [] };
  }));
}
function planWave(file, num) {
  if (!fs.existsSync(file)) die(`Not found: ${file}`);
  const c = readF(file);
  const wm = c.match(new RegExp(`<wave number="${num}"([^>]*)>([\\s\\S]*?)<\\/wave>`));
  if (!wm) { out({ wave: null, tasks: [] }); return; }
  const ex = (body, tag) => { const m = body.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)); return m ? m[1].trim() : null; };
  out({ wave: parseInt(num), title: wm[1].match(/title="([^"]+)"/)?.[1] || '', parallel: wm[1].includes('parallel="true"'), tasks: [...wm[2].matchAll(/<task id="([^"]+)">([\s\S]*?)<\/task>/g)].map(m => ({ id: m[1], title: ex(m[2], 'title'), file: ex(m[2], 'file'), action: ex(m[2], 'action') })) });
}

function gitStatus() {
  const status = bash('git status --porcelain');
  const branch = bash('git branch --show-current');
  const changed = status.split('\n').filter(Boolean).map(l => ({ status: l.substring(0, 2).trim(), file: l.substring(3).trim() }));
  out({ branch, changed_count: changed.length, changed });
}
function gitChanged() { out(bash('git diff --name-only HEAD 2>/dev/null').split('\n').filter(Boolean)); }
function gitCommit(msg) {
  try { bash('git add -A'); bash(`git commit -m ${JSON.stringify(msg)}`); out({ ok: true, hash: bash('git rev-parse --short HEAD'), message: msg }); }
  catch(e) { out({ ok: false, error: e.message }); }
}
function gitCheckpoint() {
  const label = `kelar-checkpoint-${nowDate().replace(/-/g, '')}-${Date.now()}`;
  try { bash(`git stash push -m "${label}"`); out({ ok: true, label, rollback: 'git stash pop' }); }
  catch(e) { out({ ok: false, error: e.message }); }
}

function debtAdd(file, issue, priority) {
  const pr = (priority || 'MEDIUM').toUpperCase();
  if (!['HIGH', 'MEDIUM', 'LOW'].includes(pr)) die('Priority: HIGH, MEDIUM, or LOW');
  const emoji = { HIGH: '🔴', MEDIUM: '🟡', LOW: '🟢' }[pr];
  let c = readF(DEBT_F);
  const entry = `| ${nowDate()} | ${file} | ${issue} | ${emoji} ${pr} | ? |`;
  const ip = c.indexOf('## Resolved');
  fs.writeFileSync(DEBT_F, ip > -1 ? c.slice(0, ip) + entry + '\n' + c.slice(ip) : c + '\n' + entry, 'utf8');
  out({ ok: true, file, issue, priority: pr });
}
function debtList() {
  out([...readF(DEBT_F).matchAll(/^\| (\d{4}-\d{2}-\d{2}) \| (.+?) \| (.+?) \| (.+?) \| (.+?) \|$/gm)]
    .map(r => ({ date: r[1], file: r[2].trim(), issue: r[3].trim(), priority: r[4].trim(), est: r[5].trim() })));
}

function health() {
  const required = ['state/STATE.md', 'state/TASKS.md', 'state/PATTERNS.md', 'memory/INDEX.md'].map(r => p(r));
  const checks = required.map(f => ({ file: f.replace(KELAR_DIR, '.kelar'), exists: fs.existsSync(f) }));
  out({ healthy: checks.every(c => c.exists), kelar_dir: KELAR_DIR, checks });
}
function sessionStart(task) { tasksLog('start', `Task: ${task}`); out({ ok: true, started: now(), task }); }
function sessionEnd() {
  const recent = readF(TASKS_F).split('\n').slice(-20).filter(l => l.includes('✅')).slice(-5).map(l => `  - ${l.trim()}`).join('\n');
  const feature = readF(STATE_F).match(/Working on\s*:\s*(.+)/)?.[1]?.trim() || 'unknown';
  appendF(DIARY_F, `\n## ${nowDate()} ${now().split(' ')[1]}\nWorked on : ${feature}\nActivity  :\n${recent}\nNext      : [see HANDOFF.md]\n`);
  handoffWrite();
  out({ ok: true });
}

// ═══════════════════════════════════════════════════════════════════════════════
// V2 — ULTRA MAGIC
// ═══════════════════════════════════════════════════════════════════════════════

function contextBuild(taskDesc, tokenBudget) {
  const budget = parseInt(tokenBudget) || 8000;
  const result = { task: taskDesc, token_budget: budget, sections: [], files_included: [], files_excluded: [], total_tokens: 0 };
  let remaining = budget;

  function addSection(name, content, extra) {
    const tokens = estimateTokens(content);
    if (tokens > remaining) { result.files_excluded.push({ name, tokens, reason: 'over budget' }); return false; }
    result.sections.push({ name, content, tokens, ...extra });
    remaining -= tokens;
    return true;
  }

  addSection('project_state', readF(STATE_F));
  addSection('patterns', readF(PATTERNS_F).split('\n').slice(0, 40).join('\n'));
  addSection('recent_activity', readF(TASKS_F).split('\n').slice(-25).join('\n'));

  if (taskDesc) {
    // Memory search
    const memResults = JSON.parse(bash(`node "${__filename}" memory search ${JSON.stringify(taskDesc)}`) || '[]');
    for (const entry of memResults.slice(0, 3)) {
      const full = path.join(process.cwd(), entry.file);
      if (fs.existsSync(full)) addSection(`memory:${entry.title}`, readF(full), { relevance: entry.score });
    }

    // Relevant source files by keyword density
    const keywords = taskDesc.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter(w => w.length > 3 && !['this', 'that', 'with', 'from', 'have', 'will', 'need', 'make'].includes(w));

    const srcDir = path.join(process.cwd(), 'src');
    const files = walkFiles(fs.existsSync(srcDir) ? srcDir : process.cwd());
    const scored = files.map(f => {
      const c = readF(f); const lower = c.toLowerCase(); const name = path.basename(f).toLowerCase();
      let score = 0;
      for (const kw of keywords) { score += (lower.match(new RegExp(kw, 'g')) || []).length; if (name.includes(kw)) score += 10; }
      return { file: f, content: c, score, tokens: estimateTokens(c) };
    }).filter(f => f.score > 0).sort((a, b) => b.score - a.score);

    for (const f of scored) {
      const truncated = f.tokens > remaining * 0.4 ? f.content.substring(0, remaining * 0.4 * 4) + '\n...[truncated]' : f.content;
      if (!addSection(`source:${path.relative(process.cwd(), f.file)}`, truncated, { relevance: f.score })) break;
      result.files_included.push(path.relative(process.cwd(), f.file));
    }
  }

  result.total_tokens = budget - remaining;
  result.remaining_tokens = remaining;
  out(result);
}

function contextInject(agentName) {
  if (!agentName) die('Usage: context inject <agent-name>');
  const agentFile = path.join(AGENTS_DIR, `${agentName}.md`);
  if (!fs.existsSync(agentFile)) {
    const avail = fs.existsSync(AGENTS_DIR) ? fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md')).map(f => f.replace('.md', '')) : [];
    die(`Agent '${agentName}' not found. Available: ${avail.join(', ')}`);
  }
  const agentDef = readF(agentFile);
  const snap = JSON.parse(bash(`node "${__filename}" state snapshot`) || '{}');
  const active = JSON.parse(bash(`node "${__filename}" tasks active`) || '{}');
  const recentActivity = readF(TASKS_F).split('\n').slice(-15).join('\n');
  const patterns = readF(PATTERNS_F).split('\n').slice(0, 30).join('\n');

  const prompt = `You are ${agentName}. Read your role definition and begin immediately.

<agent_definition>
${agentDef}
</agent_definition>

<project_context>
Stack: ${snap.stack || 'see STATE.md'} | Type: ${snap.type || 'unknown'}
Working on: ${snap.working_on || active.name || 'awaiting task'}
Status: ${active.status || 'idle'}${active.next_step ? ` | Next: ${active.next_step}` : ''}
</project_context>

<recent_activity>
${recentActivity}
</recent_activity>

<approved_patterns>
${patterns}
</approved_patterns>

<files_to_read>
AGENTS.md
.kelar/state/STATE.md
.kelar/state/PATTERNS.md
.kelar/memory/INDEX.md
</files_to_read>

<kelar_tools_reference>
node .kelar/kelar-tools.cjs tasks log start "Task: [name]"
node .kelar/kelar-tools.cjs tasks log done "Task [id]: [result]"
node .kelar/kelar-tools.cjs memory save technical "[title]" "[content]"
node .kelar/kelar-tools.cjs memory search "[query]"
node .kelar/kelar-tools.cjs git checkpoint
node .kelar/kelar-tools.cjs git commit "feat(kelar): [message]"
node .kelar/kelar-tools.cjs debt add "[file]" "[issue]" "MEDIUM"
</kelar_tools_reference>`;

  out({ agent: agentName, prompt, prompt_tokens: estimateTokens(prompt) });
}

function scanRisk(scanPath) {
  const targetDir = path.resolve(process.cwd(), scanPath || 'src');
  const files = walkFiles(targetDir);
  const issues = [];

  const patterns = [
    { re: /(?:password|secret|api_key|apikey|token)\s*[:=]\s*['"][^'"]{6,}/gi, severity: 'HIGH',   category: 'secret',          msg: 'Potential hardcoded secret' },
    { re: /https?:\/\/(?:localhost|127\.0\.0\.1|192\.168)/gi,                  severity: 'HIGH',   category: 'hardcoded_url',   msg: 'Hardcoded local/internal URL' },
    { re: /:\s*any\b/g,                                                         severity: 'MEDIUM', category: 'any_type',        msg: 'TypeScript any type' },
    { re: /as\s+any\b/g,                                                        severity: 'HIGH',   category: 'any_cast',        msg: 'Unsafe any cast' },
    { re: /\/\/ @ts-ignore/g,                                                   severity: 'MEDIUM', category: 'ts_ignore',       msg: 'TypeScript error suppressed' },
    { re: /\/\/ @ts-nocheck/g,                                                  severity: 'HIGH',   category: 'ts_nocheck',      msg: 'TypeScript disabled for file' },
    { re: /catch\s*\([^)]*\)\s*\{\s*\}/g,                                       severity: 'HIGH',   category: 'empty_catch',     msg: 'Empty catch — swallowed error' },
    { re: /\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\)/g,                            severity: 'HIGH',   category: 'empty_catch',     msg: 'Empty catch callback' },
    { re: /for\s*\([^)]+\)[^{]*\{[^}]*await\s+\w+\(/gs,                       severity: 'HIGH',   category: 'n_plus_1',        msg: 'Possible N+1: await inside loop' },
    { re: /\.forEach\([^)]+async/g,                                             severity: 'MEDIUM', category: 'async_foreach',   msg: 'async in forEach — errors silently swallowed' },
    { re: /console\.(log|warn|error|info|debug)\s*\(/g,                         severity: 'LOW',    category: 'console_log',     msg: 'console.log found' },
    { re: /\/\/\s*(TODO|FIXME|HACK|XXX|TEMP|BUG):/gi,                          severity: 'LOW',    category: 'todo',            msg: 'TODO/FIXME comment' },
    { re: /debugger;/g,                                                         severity: 'HIGH',   category: 'debugger',        msg: 'debugger statement' },
  ];

  for (const file of files) {
    const content = readF(file);
    const rel = path.relative(process.cwd(), file);

    // Function length check
    for (const m of [...content.matchAll(/(?:function\s+\w+|(?:const|let)\s+\w+\s*=\s*(?:async\s+)?\([^)]*\)\s*=>)\s*\{/g)]) {
      const line = content.substring(0, m.index).split('\n').length;
      let depth = 0, end = m.index;
      for (let i = m.index; i < Math.min(content.length, m.index + 4000); i++) {
        if (content[i] === '{') depth++;
        else if (content[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
      }
      const len = content.substring(m.index, end).split('\n').length;
      if (len > 25) issues.push({ file: rel, line, severity: 'MEDIUM', category: 'long_function', message: `Function is ${len} lines (max 20)`, snippet: m[0].substring(0, 60) });
    }

    for (const { re, severity, category, msg } of patterns) {
      const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
      let m;
      while ((m = g.exec(content)) !== null) {
        issues.push({ file: rel, line: content.substring(0, m.index).split('\n').length, severity, category, message: msg, snippet: m[0].trim().substring(0, 80) });
      }
    }
  }

  const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const sorted = issues.sort((a, b) => order[a.severity] - order[b.severity] || a.file.localeCompare(b.file));
  out({ summary: { total: sorted.length, HIGH: sorted.filter(i => i.severity === 'HIGH').length, MEDIUM: sorted.filter(i => i.severity === 'MEDIUM').length, LOW: sorted.filter(i => i.severity === 'LOW').length, files_scanned: files.length }, issues: sorted });
}

function scanImports(filePath) {
  if (!filePath) die('Usage: scan imports <file>');
  const abs = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(abs)) die(`Not found: ${filePath}`);
  const content = readF(abs);
  const targetBase = path.basename(abs, path.extname(abs));
  const allFiles = walkFiles(path.join(process.cwd(), 'src'));
  const direct = [...content.matchAll(/(?:import|require)\s*(?:\{[^}]*\}|\w+)?\s*(?:from\s*)?['"]([^'"]+)['"]/g)]
    .map(m => m[1]).filter(i => i.startsWith('.') || i.startsWith('@/'));
  const dependents = allFiles.filter(f => f !== abs && readF(f).includes(targetBase)).map(f => path.relative(process.cwd(), f));
  out({
    file: path.relative(process.cwd(), abs), direct_imports: direct, direct_import_count: direct.length,
    depended_on_by: dependents, dependent_count: dependents.length,
    blast_radius: dependents.length === 0 ? 'LOW' : dependents.length < 4 ? 'MEDIUM' : 'HIGH',
  });
}

function impactScore(filePath) {
  if (!filePath) die('Usage: impact score <file>');
  const abs = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(abs)) die(`Not found: ${filePath}`);
  const content = readF(abs);
  const base = path.basename(abs, path.extname(abs));
  const allFiles = walkFiles(path.join(process.cwd(), 'src'));
  let deps = 0, refs = 0;
  for (const f of allFiles) {
    if (f === abs) continue;
    const fc = readF(f);
    if (fc.includes(base)) { deps++; refs += (fc.match(new RegExp(base, 'g')) || []).length; }
  }
  const exports = (content.match(/^export /gm) || []).length;
  const size = fs.statSync(abs).size;
  const score = Math.min(100, Math.round(Math.min(40, deps * 5) + Math.min(20, refs * 2) + Math.min(20, exports * 3) + Math.min(20, size / 500)));
  const level = score >= 70 ? 'CRITICAL' : score >= 40 ? 'HIGH' : score >= 20 ? 'MEDIUM' : 'LOW';
  out({ file: path.relative(process.cwd(), abs), score, level, stats: { files_that_import_it: deps, total_references: refs, exports, size_bytes: size }, recommendation: level === 'CRITICAL' || level === 'HIGH' ? '⚠️  Run: node .kelar/kelar-tools.cjs git checkpoint first' : 'Standard procedures apply.' });
}

function diffSmart(from, to) {
  const a = from || 'HEAD~1', b = to || 'HEAD';
  const raw = bash(`git diff ${a} ${b} 2>/dev/null`);
  if (!raw) { out({ changes: [], summary: 'No changes' }); return; }
  const changes = [];
  for (const fileDiff of raw.split(/^diff --git /m).filter(Boolean)) {
    const fm = fileDiff.match(/a\/(.+?) b\//);
    if (!fm || !fm[1].match(/\.(ts|tsx|js|jsx|py|go)$/)) continue;
    const added   = fileDiff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).map(l => l.slice(1));
    const removed = fileDiff.split('\n').filter(l => l.startsWith('-') && !l.startsWith('---')).map(l => l.slice(1));
    const newFns  = added.filter(l => l.match(/^(?:export\s+)?(?:async\s+)?function\s+\w+|^(?:export\s+)?const\s+\w+\s*=\s*(?:async\s+)?\(/));
    const rmFns   = removed.filter(l => l.match(/^(?:export\s+)?(?:async\s+)?function\s+\w+|^(?:export\s+)?const\s+\w+\s*=\s*(?:async\s+)?\(/));
    const breaking = rmFns.filter(rm => {
      const name = rm.match(/function\s+(\w+)/)?.[1] || rm.match(/const\s+(\w+)/)?.[1];
      return name && !newFns.some(a => a.includes(name));
    }).map(rm => `Deleted: ${(rm.match(/function\s+(\w+)/)?.[1] || rm.match(/const\s+(\w+)/)?.[1]) || '?'}`);
    changes.push({ file: fm[1], new_functions: newFns.slice(0, 5).map(f => f.trim().substring(0, 80)), removed_functions: rmFns.slice(0, 5).map(f => f.trim().substring(0, 80)), breaking_changes: breaking, risk: breaking.length > 0 ? 'HIGH' : rmFns.length > 0 ? 'MEDIUM' : 'LOW', lines_added: added.length, lines_removed: removed.length });
  }
  const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  out({ from: a, to: b, files_changed: changes.length, breaking_total: changes.reduce((s, c) => s + c.breaking_changes.length, 0), changes: changes.sort((a, b) => order[a.risk] - order[b.risk]) });
}

function tokensEstimate(targetPath) {
  const abs = path.resolve(process.cwd(), targetPath || 'src');
  if (!fs.existsSync(abs)) die(`Not found: ${targetPath}`);
  if (fs.statSync(abs).isFile()) {
    const tokens = estimateTokens(readF(abs));
    out({ file: targetPath, tokens, fits_in: { '8k': tokens < 8000, '32k': tokens < 32000, '100k': tokens < 100000, '200k': tokens < 200000 } });
    return;
  }
  const results = walkFiles(abs, []).map(f => ({ file: path.relative(process.cwd(), f), tokens: estimateTokens(readF(f)), size_bytes: fs.statSync(f).size })).sort((a, b) => b.tokens - a.tokens);
  const total = results.reduce((s, r) => s + r.tokens, 0);
  out({ path: targetPath, total_tokens: total, file_count: results.length, fits_200k: total < 200000, biggest_files: results.slice(0, 10) });
}

function planGenerate(desc) {
  if (!desc) die('Usage: plan generate "description"');
  const lower = desc.toLowerCase();
  const has = f => f.test(lower);
  const hasUI      = has(/component|page|form|button|modal|ui|interface|layout|screen|view/);
  const hasAuth    = has(/auth|login|logout|session|token|jwt|oauth|permission|role/);
  const hasDB      = has(/database|schema|migration|model|table|query|prisma|orm|sql/);
  const hasAPI     = has(/api|endpoint|route|controller|rest|graphql|webhook/);
  const hasService = has(/service|logic|business|process|calculate|compute/);
  const slug       = desc.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-').substring(0, 40).replace(/-$/, '');

  let wn = 0;
  const waves = [];
  const task = (id, title, file, action, verify, done) => `    <task id="${id}">\n      <title>${title}</title>\n      <file>${file}</file>\n      <action>${action}</action>\n      <verify>${verify}</verify>\n      <done>${done}</done>\n      <depends_on></depends_on>\n    </task>`;

  // Wave 1: Foundation
  const w1 = [];
  if (hasDB)   w1.push(task('1.1', 'Define schema / migration', 'prisma/schema.prisma', `Schema for: ${desc}`, 'Migration valid', 'Schema reflects requirements'));
  w1.push(task(`1.${w1.length+1}`, 'Define TypeScript types', `src/types/${slug}.ts`, `Types and interfaces for: ${desc}`, 'tsc --noEmit passes', 'All types exported'));
  waves.push(`  <wave number="${++wn}" title="Foundation" parallel="true">\n${w1.join('\n')}\n  </wave>`);

  // Wave 2: Core
  if (hasService || hasAPI || hasDB) {
    const w2 = [];
    if (hasService) w2.push(task('2.1', 'Implement service logic', `src/services/${slug}Service.ts`, `Main logic for: ${desc}`, 'Service compiles', 'Core logic implemented'));
    if (hasDB)      w2.push(task(`2.${w2.length+1}`, 'Implement repository', `src/repositories/${slug}Repository.ts`, 'DB queries following existing pattern', 'Queries type-safe', 'Data layer working'));
    waves.push(`  <wave number="${++wn}" title="Core Logic" parallel="false">\n${w2.join('\n')}\n  </wave>`);
  }

  // Wave 3: API
  if (hasAPI) {
    waves.push(`  <wave number="${++wn}" title="API Layer" parallel="false">\n${task(`${wn}.1`, 'Create API endpoints', 'src/routes/[feature].ts', `Endpoints for: ${desc}`, 'Route responds', 'Endpoint validates input')}\n  </wave>`);
  }

  // Wave 4: UI
  if (hasUI) {
    const w = [];
    w.push(task(`${wn+1}.1`, 'Build UI component', `src/components/${slug}/${slug}.tsx`, `UI for: ${desc}. All 8 states required.`, 'Renders without errors', 'All states: default, hover, focus, active, disabled, loading, error, empty'));
    w.push(task(`${wn+1}.2`, 'Wire component to data', `src/components/${slug}/${slug}.tsx`, 'Connect to API/service', 'Shows real data', 'Data flows through component'));
    waves.push(`  <wave number="${++wn}" title="UI" parallel="true">\n${w.join('\n')}\n  </wave>`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<kelar_plan>
  <meta>
    <feature>${slug}</feature>
    <goal>[TODO: one sentence user-facing goal]</goal>
    <wave_count>${waves.length}</wave_count>
    <created>${new Date().toISOString()}</created>
    <generated_by>kelar-tools plan generate</generated_by>
  </meta>

${waves.join('\n\n')}

  <out_of_scope>[TODO: what is NOT included]</out_of_scope>
  <risks><risk level="LOW">[TODO: potential issues]</risk></risks>
</kelar_plan>`;

  const planDir = p('plans');
  fs.mkdirSync(planDir, { recursive: true });
  const planFile = path.join(planDir, `${slug}-plan.xml`);
  fs.writeFileSync(planFile, xml, 'utf8');
  out({ ok: true, plan_file: planFile.replace(process.cwd(), '.'), feature_slug: slug, waves: waves.length, detected: { hasUI, hasAuth, hasDB, hasAPI, hasService } });
}

function knowledgeExtract() {
  const commits = bash('git log --oneline -20 2>/dev/null');
  if (!commits) { out({ suggestions: [], reason: 'No git history' }); return; }
  const suggestions = [];
  for (const line of commits.split('\n').filter(Boolean)) {
    const hash = line.split(' ')[0];
    const message = line.substring(hash.length + 1);
    const isFix     = /fix|bug|broken|error|crash|null|undefined|wrong/i.test(message);
    const isGotcha  = /workaround|hack|trick|weird|quirk|actually|turns out/i.test(message);
    const isPattern = /pattern|prefer|instead|refactor|switch|improve/i.test(message);
    const isConfig  = /config|env|setup|install|dependency|version|upgrade/i.test(message);
    if (isFix || isGotcha || isPattern || isConfig) {
      const category = isFix ? 'technical' : isConfig ? 'environment' : isPattern ? 'solutions' : 'technical';
      suggestions.push({ commit: hash, message, category, reason: isFix ? 'Bug fix worth documenting' : isGotcha ? 'Non-obvious workaround' : isPattern ? 'Pattern change — capture reasoning' : 'Config change', save_command: `node .kelar/kelar-tools.cjs memory save ${category} "${message.substring(0, 50)}" "[your notes]"` });
    }
  }
  out({ commits_analyzed: commits.split('\n').filter(Boolean).length, suggestions_found: suggestions.length, suggestions });
}

function timeline(maxItems) {
  const n = parseInt(maxItems) || 20;
  const tasksContent = readF(TASKS_F);
  const gitLog = bash(`git log --pretty=format:"%h|%ai|%s" -${n} 2>/dev/null`);
  const taskEntries = [...tasksContent.matchAll(/## \[(.+?)\] (TASK|FEATURE|FIX) (STARTED|COMPLETE)[^\n]*(.*)/g)]
    .map(m => ({ timestamp: m[1], type: `${m[2]}_${m[3]}`, description: m[4].trim(), source: 'tasks' }));
  const gitEntries = gitLog.split('\n').filter(Boolean).map(line => {
    const parts = line.split('|');
    return parts.length >= 3 ? { hash: parts[0], timestamp: parts[1], message: parts[2], source: 'git' } : null;
  }).filter(Boolean);
  const all = [...taskEntries, ...gitEntries].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, n);
  out({ generated_at: now(), total_events: all.length, task_events: taskEntries.length, git_commits: gitEntries.length, timeline: all });
}

function debtScore() {
  const srcDir = path.join(process.cwd(), 'src');
  if (!fs.existsSync(srcDir)) { out({ score: 0, reason: 'No src/ directory' }); return; }
  const files = walkFiles(srcDir);
  let anyTypes = 0, todos = 0, emptyCatch = 0;
  for (const f of files) {
    const c = readF(f);
    anyTypes   += (c.match(/:\s*any\b|as\s+any\b/g) || []).length;
    todos      += (c.match(/\/\/\s*TODO:|\/\/\s*FIXME:/gi) || []).length;
    emptyCatch += (c.match(/catch\s*\([^)]*\)\s*\{\s*\}/g) || []).length;
  }
  const debtItems = readF(DEBT_F).split('\n').filter(l => l.startsWith('|') && !l.includes('Date') && !l.includes('---'));
  const high = debtItems.filter(l => l.includes('🔴')).length;
  const med  = debtItems.filter(l => l.includes('🟡')).length;
  const low  = debtItems.filter(l => l.includes('🟢')).length;
  const score = Math.min(100, high * 10 + med * 5 + low * 2 + anyTypes * 3 + todos + emptyCatch * 8);
  const level = score >= 60 ? 'CRITICAL' : score >= 30 ? 'HIGH' : score >= 15 ? 'MEDIUM' : 'LOW';
  const scoreFile = p('state/DEBT_SCORE.json');
  const history = fs.existsSync(scoreFile) ? JSON.parse(readF(scoreFile)) : [];
  const prev = history.at(-1);
  history.push({ date: nowDate(), score });
  if (history.length > 30) history.shift();
  fs.writeFileSync(scoreFile, JSON.stringify(history, null, 2), 'utf8');
  out({ score, level, trend: prev ? (score > prev.score ? '↗ WORSENING' : score < prev.score ? '↘ IMPROVING' : '→ STABLE') : 'first scan', previous_score: prev?.score ?? null, breakdown: { debt_md: { high, med, low }, any_types: anyTypes, todos, empty_catch: emptyCatch }, files_scanned: files.length, recommendation: level === 'CRITICAL' ? '🔴 Stop features. Fix HIGH items first.' : level === 'HIGH' ? '🟡 Schedule debt reduction.' : '🟢 Debt under control.' });
}

function similar(filePath) {
  if (!filePath) die('Usage: similar <file>');
  const abs = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(abs)) die(`Not found: ${filePath}`);
  const content = readF(abs);
  const imports = [...content.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m => m[1]);
  const ext = path.extname(abs); const dir = path.dirname(abs);
  const suffix = path.basename(abs).replace(/\.[^.]+$/, '').match(/[A-Z][a-z]+$/)?.[0];
  const scored = walkFiles(path.join(process.cwd(), 'src')).filter(f => f !== abs && path.extname(f) === ext).map(f => {
    const fc = readF(f);
    const fi = [...fc.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m => m[1]);
    const shared = imports.filter(i => fi.includes(i));
    let score = shared.length * 3;
    if (path.dirname(f) === dir) score += 5;
    if (suffix && f.includes(suffix)) score += 4;
    if (Math.abs(content.length - fc.length) / Math.max(content.length, fc.length) < 0.3) score += 2;
    return { file: path.relative(process.cwd(), f), score, shared_imports: shared };
  }).filter(f => f.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
  out({ target: path.relative(process.cwd(), abs), similar_files: scored, usage: scored.length > 0 ? `Best reference: ${scored[0].file}` : 'No similar files found.' });
}

function watch(watchPath) {
  const abs = path.resolve(process.cwd(), watchPath || 'src');
  if (!fs.existsSync(abs)) die(`Not found: ${watchPath}`);
  const active = JSON.parse(bash(`node "${__filename}" tasks active`) || '{}');
  process.stderr.write(`\n🔍 KELAR WATCH ACTIVE — ${watchPath || 'src'} — ${active.name || 'no active task'} — Ctrl+C to stop\n\n`);
  const seen = new Set(); let changes = 0;
  function check() {
    for (const f of walkFiles(abs, [])) {
      try {
        const mtime = fs.statSync(f).mtimeMs; const key = `${f}:${mtime}`;
        if (!seen.has(key)) {
          if (seen.size > 0) {
            const rel = path.relative(process.cwd(), f);
            const isNew = ![...seen].some(k => k.startsWith(f + ':'));
            const action = isNew ? 'CREATED' : 'MODIFIED'; changes++;
            appendF(TASKS_F, `[${now()}] 📝 WATCH: ${action}: ${rel}`);
            process.stderr.write(`[${now()}] ${action}: ${rel}\n`);
          }
          seen.add(key);
        }
      } catch { /* deleted */ }
    }
  }
  check();
  const iv = setInterval(check, 1500);
  process.on('SIGINT', () => { clearInterval(iv); process.stderr.write(`\n🛑 STOPPED — ${changes} changes logged to TASKS.md\n\n`); process.exit(0); });
}

function agentBrief(name) { contextInject(name); }

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTER
// ═══════════════════════════════════════════════════════════════════════════════
const [,, cmd, sub, ...rest] = process.argv;
const args = sub ? [sub, ...rest] : rest;

switch (cmd) {
  case 'state':
    if (sub==='get') stateGet(args[1]); else if (sub==='patch') statePatch(args[1], rest.join(' ')); else if (sub==='snapshot') stateSnapshot(); else die('state: get|patch|snapshot'); break;
  case 'tasks':
    if (sub==='log') tasksLog(args[1], rest.join(' ')); else if (sub==='active') tasksActive(); else if (sub==='complete') tasksLog('done', rest.join(' ')); else if (sub==='pause') tasksPause(args[1], rest.join(' ')); else die('tasks: log|active|complete|pause'); break;
  case 'memory':
    if (sub==='search') memorySearch(rest.join(' ')); else if (sub==='save') memorySave(args[1], args[2], rest.slice(1).join(' ')); else if (sub==='index') memoryRebuildIndex(); else die('memory: search|save|index'); break;
  case 'patterns':
    if (sub==='get') patternsGet(rest.join(' ')); else if (sub==='set') patternsSet(args[1], rest.join(' ')); else if (sub==='list') patternsList(); else die('patterns: get|set|list'); break;
  case 'handoff':
    if (sub==='write') handoffWrite(); else if (sub==='read') handoffRead(); else die('handoff: write|read'); break;
  case 'plan':
    if (sub==='validate') planValidate(args[1]); else if (sub==='tasks') planTasks(args[1]); else if (sub==='wave') planWave(args[1], args[2]); else if (sub==='generate') planGenerate(rest.join(' ')); else die('plan: validate|tasks|wave|generate'); break;
  case 'git':
    if (sub==='status') gitStatus(); else if (sub==='changed') gitChanged(); else if (sub==='commit') gitCommit(rest.join(' ')); else if (sub==='checkpoint') gitCheckpoint(); else die('git: status|changed|commit|checkpoint'); break;
  case 'debt':
    if (sub==='add') debtAdd(args[1], args[2], args[3]); else if (sub==='list') debtList(); else if (sub==='score') debtScore(); else die('debt: add|list|score'); break;
  case 'session':
    if (sub==='start') sessionStart(rest.join(' ')); else if (sub==='end') sessionEnd(); else die('session: start|end'); break;
  // V2
  case 'context':
    if (sub==='build') contextBuild(rest.join(' ')); else if (sub==='inject') contextInject(args[1]); else die('context: build|inject'); break;
  case 'scan':
    if (sub==='risk') scanRisk(args[1]); else if (sub==='imports') scanImports(args[1]); else die('scan: risk|imports'); break;
  case 'impact':
    if (sub==='score') impactScore(args[1]); else die('impact: score'); break;
  case 'diff':
    if (sub==='smart') diffSmart(args[1], args[2]); else die('diff: smart'); break;
  case 'tokens':
    if (sub==='estimate') tokensEstimate(args[1]); else die('tokens: estimate'); break;
  case 'plan':
    if (sub==='generate') planGenerate(rest.join(' ')); break;
  case 'timeline': timeline(sub); break;
  case 'knowledge':
    if (sub==='extract') knowledgeExtract(); else die('knowledge: extract'); break;
  case 'similar': similar(sub); break;
  case 'watch': watch(sub); break;
  case 'agent':
    if (sub==='brief') agentBrief(args[1]); else die('agent: brief'); break;
  case 'health': health(); break;
  case 'version': out(VERSION); break;
  default:
    process.stderr.write(`
KELAR Tools v${VERSION}

Standard:  state · tasks · memory · patterns · handoff · plan · git · debt · session · health
Ultra:     context build/inject · scan risk/imports · impact score
           diff smart · tokens estimate · plan generate · knowledge extract
           timeline · debt score · similar · watch · agent brief

Examples:
  node .kelar/kelar-tools.cjs context build "add stripe payment"
  node .kelar/kelar-tools.cjs context inject kelar-executor
  node .kelar/kelar-tools.cjs scan risk src/
  node .kelar/kelar-tools.cjs scan imports src/services/Auth.ts
  node .kelar/kelar-tools.cjs impact score src/lib/db.ts
  node .kelar/kelar-tools.cjs diff smart HEAD~5 HEAD
  node .kelar/kelar-tools.cjs tokens estimate src/
  node .kelar/kelar-tools.cjs plan generate "add stripe payment checkout"
  node .kelar/kelar-tools.cjs knowledge extract
  node .kelar/kelar-tools.cjs similar src/services/UserService.ts
  node .kelar/kelar-tools.cjs debt score
  node .kelar/kelar-tools.cjs timeline 20
  node .kelar/kelar-tools.cjs watch src/
  node .kelar/kelar-tools.cjs agent brief kelar-planner
\n`);
    process.exit(1);
}
