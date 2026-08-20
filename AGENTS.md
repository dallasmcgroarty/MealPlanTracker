## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

# Nawtch Project Rules

## Content accuracy (highest priority)
- Every factual claim, formula, or statistic needs a real, verifiable
  citation. Research and confirm sources directly before writing —
  never assume or fabricate a citation.
- If a number is being cited alongside a link to the source, verify the
  number actually matches what's in that source before publishing.
- No supplement, diet, or peptide page should present anything as
  "the best" or make a recommendation to use. Present evidence
  evenhandedly, and say plainly when evidence is weak or absent
  (see: Whole30, most Tier 2/3 peptides).
- Peptide pages specifically: never include dosing, administration, or
  cycle information for Tier 2 or Tier 3 substances. State tier and
  regulatory status prominently near the top of the page. Add/update a
  "Last verified" date whenever content is reviewed or changed.

## Data integrity
- Never let a later edit retroactively change historical data. This
  applies to: daily calorie/macro target ranges (store what was active
  at the time), Bowl Builder (editing a saved Bowl must never change a
  Food entry already created from it), and daily food logs (store a
  full snapshot per logged item — name, servings, macros, cost — not a
  reference/ID lookup).
- Prefer storing one canonical unit internally (e.g. kcal, not kJ) and
  converting only for display, matching the existing pattern for
  weight, energy units, and currency.

## SEO / metadata (applies to every page)
- Title tag: 60 characters max. Meta description: 160 characters max.
- Every page needs: canonical URL, hreflang="en" (absolute URLs only,
  matching canonical), OG tags, Twitter tags.
- Match og/twitter title+description to the final page title/description
  — don't leave them out of sync after an edit.
- New calculators/diets/supplements should each get their own page
  (hub + individual pages pattern), not tabs on a shared page.
- Always update sitemap.xml after any page content updates, not JS changes

## Code/architecture
- No new dependencies without discussing it first.
- Match existing patterns before inventing new ones — check how similar
  features are already built (e.g. modal component, saved-item
  list/edit/delete pattern, mobile heading treatment) before writing new
  UI.
- Before schema/data-model changes, explain the planned shape and get
  confirmation before implementing.
- always update sitemap.xml
- Svelte vs. vanilla JS for new islands: `@astrojs/svelte` is installed
  but unused — every existing island (`src/islands/vanilla/**`) is plain
  DOM-manipulation JS, matching the current codebase's pattern. Default
  to vanilla JS for new calculators/tools to match that pattern. Only
  reach for Svelte when a new island has real justification for it —
  meaningfully complex interdependent reactive state, heavy component
  composition/reuse across islands, not just "it's a new feature."
  Don't migrate existing vanilla islands to Svelte without discussing it
  first — that's a rewrite of working code, not a new-feature decision.

## Prose markup (compressHTML whitespace bug)
- Astro's `compressHTML` (on by default for static builds) eats the
  whitespace when a line break falls directly between plain text and an
  inline tag (`<a>`, `<strong>`, `<em>`, `<b>`, `<i>`, `<span>`, `<code>`)
  with no `<br />` in between — e.g. text ending a line right before
  `<a href="...">` renders with the words glued together (`examplego`
  instead of `example go`), unlike normal HTML which would collapse the
  newline to a single space.
- Rule: keep prose text and an adjacent inline tag on the **same source
  line** — never let a line break land immediately at a text↔inline-tag
  boundary. Line breaks are fine between plain text and plain text, and
  fine right after `<br />`/`<br/>`.
- After adding/editing prose containing inline tags, it's worth building
  and grepping `dist/**/*.html` for glued-together words before shipping.

## When unsure
- If a spec is ambiguous, underspecified, or something you're asked to
  cite seems inconsistent with a primary source you can check, flag it
  and ask rather than guessing or picking an interpretation silently.
