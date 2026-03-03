# Plan: UTF-8 Character Autocomplete for AMPL Plugin

## Goal
Add Julia-style LaTeX-to-Unicode character autocomplete to the AMPL plugin.
When a user types `\alpha` and accepts the completion (Tab/Enter), it inserts `α` into the editor.
AMPL reads bytes, so UTF-8 characters like Greek letters, subscripts, and superscripts are valid in identifiers and comments.

---

## Reference Implementation

Based on the [JuliaEditorSupport/unicode-latex](https://github.com/ojsheikh/unicode-latex) extension:

- A `CompletionItemProvider` is registered with `\` as the trigger character
- A large TypeScript map (`Record<string, string>`) maps LaTeX names (e.g. `\alpha`) to Unicode chars (e.g. `α`)
- The provider uses a regex like `/\\[\^_]?[^\s\\]*/` to detect the backslash-prefixed word at cursor
- Each completion item has the LaTeX name as the label and the Unicode char as `insertText`
- The completion replaces the entire `\alpha` prefix with the Unicode character

---

## Implementation Plan

### Step 1: Create `src/unicodeCompletions.ts` — The symbol mapping data

A TypeScript file exporting a `Record<string, string>` containing the LaTeX-to-Unicode mappings.
We will curate a focused subset relevant to mathematical optimization / AMPL usage:

| Category | Examples | Count (approx) |
|----------|----------|-----------------|
| Greek lowercase | `\alpha` → α, `\beta` → β, `\gamma` → γ, `\lambda` → λ, `\mu` → μ, `\sigma` → σ, ... | ~24 |
| Greek uppercase | `\Alpha` → Α, `\Gamma` → Γ, `\Delta` → Δ, `\Sigma` → Σ, `\Omega` → Ω, ... | ~24 |
| Subscripts | `\_0` → ₀, `\_1` → ₁, ..., `\_i` → ᵢ, `\_n` → ₙ, ... | ~30 |
| Superscripts | `\^0` → ⁰, `\^1` → ¹, ..., `\^n` → ⁿ, ... | ~20 |
| Math operators | `\sum` → ∑, `\prod` → ∏, `\infty` → ∞, `\leq` → ≤, `\geq` → ≥, `\neq` → ≠, ... | ~30 |
| Set theory | `\in` → ∈, `\notin` → ∉, `\subset` → ⊂, `\cup` → ∪, `\cap` → ∩, `\emptyset` → ∅, ... | ~15 |
| Arrows | `\rightarrow` → →, `\leftarrow` → ←, `\Rightarrow` → ⇒, ... | ~10 |
| Misc math | `\partial` → ∂, `\nabla` → ∇, `\forall` → ∀, `\exists` → ∃, `\pm` → ±, `\cdot` → ·, ... | ~15 |

**Total: ~170 entries** — focused on what's useful for optimization modeling.
Can be expanded later.

### Step 2: Create `src/unicodeCompletionProvider.ts` — The CompletionItemProvider

```
class UnicodeCompletionProvider implements vscode.CompletionItemProvider {
    private completionItems: vscode.CompletionItem[];

    constructor(symbols: Record<string, string>) {
        // Pre-build completion items from the symbol map
        // Each item: label = "\alpha", insertText = "α", detail = "α"
        // kind = CompletionItemKind.Text
    }

    provideCompletionItems(document, position, token, context) {
        // Use regex /\\[\^_]?[^\s\\]*/ to find the backslash-word at cursor
        // Return all completion items with the matched range
        // VSCode's fuzzy matching will filter to relevant items
    }
}
```

Key design decisions:
- **Trigger character**: `\` — registered when calling `registerCompletionItemProvider`
- **Word detection regex**: `/\\[\^_]?[^\s\\]*/` — matches `\alpha`, `\^2`, `\_i`, etc.
- **Replacement range**: The entire `\...` prefix is replaced with the Unicode character
- **Item kind**: `CompletionItemKind.Text` — shows a plain text icon
- **Pre-built items**: Build once in constructor, return references in each call (performance)

### Step 3: Register the provider in `src/extension.ts`

In the `initializeExtension()` function, add:

```typescript
import { UnicodeCompletionProvider } from './unicodeCompletionProvider';
import { latexSymbols } from './unicodeCompletions';

// In initializeExtension():
const unicodeProvider = new UnicodeCompletionProvider(latexSymbols);
context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
        [{ language: 'ampl' }, { language: 'ampl-dat' }],
        unicodeProvider,
        '\\'  // trigger character
    )
);
```

This registers the provider for both `ampl` and `ampl-dat` document types.

### Step 4: No changes needed to package.json

The `CompletionItemProvider` is registered programmatically — no `contributes` changes needed. The `\` trigger character is passed directly to the API. The existing `activationEvents` already cover AMPL file opening.

---

## Architecture Notes

- **Independent of Language Server**: This feature works entirely client-side in TypeScript. It does NOT interfere with the Java-based LSP completions. VSCode merges completions from all providers automatically.
- **No conflict with existing snippets**: The existing snippets in `snippets/ampl.json` use prefixes like `set`, `param`, `var` — none start with `\`, so there's no overlap.
- **Tab completion**: VSCode's built-in completion UI handles Tab/Enter to accept — no custom keybinding needed.
- **Performance**: Pre-building ~170 CompletionItem objects in the constructor is negligible. The regex match per keystroke is O(1).

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/unicodeCompletions.ts` | **CREATE** | LaTeX-to-Unicode symbol map (~170 entries) |
| `src/unicodeCompletionProvider.ts` | **CREATE** | CompletionItemProvider class |
| `src/extension.ts` | **MODIFY** | Import and register the provider in `initializeExtension()` |

---

## Future Enhancements (not in scope)

- Expand the symbol map with more entries (full Julia set has ~2500)
- Add a configuration setting to enable/disable the feature
- Support tab completion in the AMPL terminal/REPL
- Custom documentation for each symbol showing its Unicode codepoint
