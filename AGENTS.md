# Project Guidelines

## Tech Stack
- **Framework**: Next.js 14 (App Router), React 18, TypeScript strict mode
- **Styling**: Tailwind CSS 3 + tailwind-merge + clsx + lucide-react icons
- **Backend**: Supabase, Google Gemini AI (`@google/generative-ai`)
- **Scripts**: Python in `/scripts/` and `/scratch/` (data fetching, AI workers, CSV processing)
- **Path alias**: `@/` maps to workspace root
- **Build**: `next dev` / `next build` / `next lint`

## Behavioral Principles

These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding
- State assumptions explicitly. If uncertain, ask — don't guess.
- If multiple interpretations exist, present them. Don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- Don't hide confusion. If something is unclear, name what's confusing and ask.

### 2. Simplicity First
- Write the minimum code that solves the problem. Nothing speculative.
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.
- Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes
- Touch only what you must. Clean up only your own mess.
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.
- **Test**: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution
- Transform tasks into verifiable goals:
  - "Add validation" → "Write tests for invalid inputs, then make them pass"
  - "Fix the bug" → "Write a test that reproduces it, then make it pass"
  - "Refactor X" → "Ensure tests pass before and after"
- For multi-step tasks, state a brief plan with verification steps.
- Strong success criteria let you loop independently. Weak criteria require constant clarification.

## Project Conventions
- TypeScript strict mode — no `any` without explicit justification
- React components use functional style with hooks
- Tailwind utility classes preferred over custom CSS; use `tailwind-merge` + `clsx` for conditional classes
- API routes in `app/api/` follow Next.js App Router conventions
- Python scripts use Supabase client for data access; keep them self-contained

## Anti-patterns
- Refactoring adjacent code that isn't part of the task
- Adding abstractions "for future use"
- Silently choosing between multiple valid interpretations
- Deleting pre-existing dead code or comments without asking
