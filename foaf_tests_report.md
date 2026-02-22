# FOAF Spec Generation — Quirks, Bugs, and Lessons Learned

This documents everything discovered while building specgen2k's FOAF template to match
the 2014 "Paddington Edition" reference output (`xmlns-foaf-currentpage.html`).

## Status

With `--replicate-ancient-bugs foaf.ancient-bugs.json`, the generated output is
**identical** to the reference when trailing whitespace is stripped (0 content diff lines).
The remaining ~608 raw diff lines are trailing spaces on static HTML lines in the reference.

---

## Known Bugs in the 2014 Reference Output

These are bugs in the old Python specgen's output that we replicate only when the
`--replicate-ancient-bugs` flag is used.

### 1. Missing `rdfs:isDefinedBy` for 3 classes

The classes **Agent**, **Group**, and **PersonalProfileDocument** are missing their
`<tr><td><span rel="rdfs:isDefinedBy" .../>` rows in the reference output. All 13 FOAF
classes declare `rdfs:isDefinedBy` in the RDF data. The old specgen inconsistently skipped
these 3.

Config: `"skipIsDefinedBy": ["Agent", "Group", "PersonalProfileDocument"]`

### 2. Broken `foaf:skype` linkification

The FOAF RDF defines a property called `skypeID` (URI: `foaf:skypeID`). The doc fragment
for `skypeID` contains the text `<code>foaf:skype</code>`. The old specgen's linkifier
matched this and produced `<a href='#term_skype'>skype</a>` — a broken anchor pointing
to a nonexistent `#term_skype` section. The correct term is `skypeID`, not `skype`.

Our linkifier correctly skips unknown term names. With `--replicate-ancient-bugs`, it
linkifies all `<code>foaf:X</code>` patterns regardless of whether X is a known term.

Config: `"brokenLinks": { "linkifyUnknownTerms": true }`

### 3. rdflib hash-based property ordering

The old specgen used Python 2's rdflib, which stored triples in dicts with hash-based
ordering. This made property lists (inDomainOf, inRangeOf, hasSubClass, disjointWith)
appear in a deterministic but arbitrary order that depends on CPython 2's string hash
function and dict implementation.

Our tool sorts alphabetically within status groups by default. The `--replicate-ancient-bugs`
flag applies per-class ordering overrides from the config file to match the old output exactly.

Config: `"ordering": { "Agent": { "inDomainOf": [...], "inRangeOf": [...] }, ... }`

Affected classes: Agent, Document, Group, Image, Organization, Person, OnlineAccount, Project.

---

## Template Quirks (Nunjucks Whitespace)

### Empty placeholder lines

When a class has neither `inDomainOf` nor `inRangeOf` properties, the old specgen emitted
indented blank lines (12 spaces) as placeholders in the HTML table. The number of
placeholder lines depends on whether `subClassOf` is also present:

- Both empty, no subClassOf: **2 placeholder lines**
- Both empty, has subClassOf: **1 placeholder line** (the other merges into the Subclass Of row)
- One present, other empty: **no placeholder**

This is handled in `spec-generator.js` via `cls.emptyPlaceholder` rather than in the
template, because Nunjucks whitespace stripping (`{%- %}`) makes it extremely difficult
to conditionally emit blank lines from templates.

### Subclass Of spacing depends on preceding section

The `<tr><th>Subclass Of</th>` row has different whitespace depending on what precedes it:

- After `inRangeOf` ("Used with"): `</td></tr> <tr>` — space, same line
- After `inDomainOf` ("Properties include") or empty: `</td></tr>\n            <tr>` — newline + 12-space indentation

Template fix: `{% if cls.inRangeOf | length %} {% else %}\n            {% endif %}<tr>`

### Has Subclass spacing depends on preceding section

The `<tr><th>Has Subclass</th>` row:

- After `inRangeOf` or `inDomainOf` (no Subclass Of): `</td></tr> <tr>` — with space
- After `Subclass Of`: `</td></tr><tr>` — no space

Template fix: `{% if not cls.subClassOfFormatted | length %} {% endif %}<tr>`

### Nunjucks whitespace stripping gotchas

- `{%- %}` strips ALL whitespace (including newlines) BEFORE the tag
- `{% -%}` strips ALL whitespace AFTER the tag
- In templates with conditional blank lines, it's very easy for `{%-` to eat content
  you wanted to keep. Moving logic to JS (`cls.emptyPlaceholder`) was more reliable
  than fighting Nunjucks whitespace control.
- `{% if %}` on its own line produces a newline in the output even when the condition
  is false (the line containing the tag is emitted). Use `{%- if %}` to suppress this,
  but then the true branch loses its preceding newline too.

---

## Data/Template Bugs Fixed During Development

### `subPropertyOf` missing from property extraction
Early versions didn't extract `rdfs:subPropertyOf` triples. Added to `extractVocabulary()`.

### Duplicate domain/range values
Some vocabs declare the same domain/range twice in RDF. Fixed by deduplicating with
`[...new Set(getValues(...))]`.

### `rdfs:Literal` range suppression
The old specgen suppressed `rdfs:Literal` from the Range display (it's uninformative).
Added `rangeFormattedNonLiteral` which filters it out.

### A-Z index sort order
JavaScript's `localeCompare` sorts `_` (underscore) differently than raw string comparison.
The reference A-Z index uses raw string sort (`<` operator), not locale-aware sort.
Fixed: `a.localName < b.localName ? -1 : a.localName > b.localName ? 1 : 0`.

### Doc fragment linkification format
The old specgen used single quotes in links: `<a href='#term_X'>X</a>`. Our initial
implementation used double quotes. Fixed to match.

### `owl:FunctionalProperty` / `owl:InverseFunctionalProperty` detection
Properties can have multiple `rdf:type` values. We collect all types per URI and check
for these OWL property types to emit the "Functional Property" / "Inverse Functional
Property" table rows.

### Case-insensitive doc fragment lookup
Some doc fragment filenames don't match the term's case exactly (e.g., `givenname.en`
for term `givenName`). Added case-insensitive fallback lookup.

---

## Trailing Whitespace

The 2014 reference has trailing spaces on ~300 static HTML lines. These are invisible
to browsers but show up in raw diffs. About 67 of these were added to the template's
static content to reduce the raw diff. The remaining ~600 raw diff lines are trailing
whitespace that would require adding trailing spaces to Nunjucks output lines (impractical
since they're generated by template tags, not static content).

---

## File Reference

- **Template**: `templates/foaf.njk`
- **Bug config**: `templates/foaf.ancient-bugs.json`
- **Reference**: `../third_party/xmlns-foaf/xmlns-foaf-currentpage.html`
- **RDF source**: `../third_party/xmlns-foaf/xmlns-foaf-rdf.xml`
- **Doc fragments**: `../third_party/xmlns-foaf/doc/*.en`
- **Spec generator**: `src/spec-generator.js`
- **CLI**: `src/cli.js`
