import nunjucks from 'nunjucks';
import { readFile, readdir } from 'fs/promises';
import path from 'path';
import { parseRdf } from './rdf-parser.js';

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const OWL = 'http://www.w3.org/2002/07/owl#';
const DCTERMS = 'http://purl.org/dc/terms/';
const DCAM = 'http://purl.org/dc/dcam/';
const VS = 'http://www.w3.org/2003/06/sw-vocab-status/ns#';
const SKOS = 'http://www.w3.org/2004/02/skos/core#';

const CLASS_TYPES = new Set([
  `${RDFS}Class`,
  `${OWL}Class`,
]);

const PROPERTY_TYPES = new Set([
  `${RDF}Property`,
  `${OWL}ObjectProperty`,
  `${OWL}DatatypeProperty`,
  `${OWL}FunctionalProperty`,
  `${OWL}InverseFunctionalProperty`,
  `${OWL}AnnotationProperty`,
]);

const DATATYPE_TYPES = new Set([
  `${RDFS}Datatype`,
]);

const VES_TYPES = new Set([
  `${DCAM}VocabularyEncodingScheme`,
]);

// Configure nunjucks: no autoescape (we're generating HTML from trusted RDF data),
// no template path lookup (we load templates ourselves).
const nunjucksEnv = new nunjucks.Environment(null, { autoescape: false });

// Helper: extract local name from a URI (after last / or #)
function localNameFromUri(uri) {
  const hashIdx = uri.lastIndexOf('#');
  const slashIdx = uri.lastIndexOf('/');
  return uri.slice(Math.max(hashIdx, slashIdx) + 1);
}

// Helper: format a URI as a term reference (local link if in namespace, full URI otherwise)
function formatTermRef(uri, ns) {
  if (ns && uri.startsWith(ns)) {
    const localName = uri.slice(ns.length);
    return { uri, localName, isLocal: true };
  }
  return { uri, localName: localNameFromUri(uri), isLocal: false };
}

// Helper: get all objects for a given subject+predicate
function getValues(quads, subject, predicate) {
  return quads
    .filter(q => q.subject.value === subject && q.predicate.value === predicate)
    .map(q => q.object.value);
}

// Helper: get first object value for a given subject+predicate
function getValue(quads, subject, predicate) {
  const q = quads.find(q => q.subject.value === subject && q.predicate.value === predicate);
  return q ? q.object.value : undefined;
}

/**
 * Extract vocabulary data (classes, properties) from parsed RDF quads.
 */
export function extractVocabulary(quads, options = {}) {
  const ns = options.namespace || '';

  // Find all subjects with their rdf:type values
  const typeQuads = quads.filter(q => q.predicate.value === `${RDF}type`);

  // Collect URIs that are classes, properties, datatypes, or VES within the namespace
  const classUris = new Set();
  const propertyUris = new Set();
  const datatypeUris = new Set();
  const vesUris = new Set();

  for (const q of typeQuads) {
    const uri = q.subject.value;
    if (ns && !uri.startsWith(ns)) continue;
    if (CLASS_TYPES.has(q.object.value)) classUris.add(uri);
    if (PROPERTY_TYPES.has(q.object.value)) propertyUris.add(uri);
    if (DATATYPE_TYPES.has(q.object.value)) datatypeUris.add(uri);
    if (VES_TYPES.has(q.object.value)) vesUris.add(uri);
  }

  // Collect all rdf:type values for each URI (for OWL type detection)
  const allTypes = new Map(); // uri -> Set of type URIs
  for (const q of typeQuads) {
    if (!allTypes.has(q.subject.value)) allTypes.set(q.subject.value, new Set());
    allTypes.get(q.subject.value).add(q.object.value);
  }

  // Helper: format a URI reference with label lookup
  function formatRef(u) {
    const localName = localNameFromUri(u);
    const label = getValue(quads, u, `${RDFS}label`) || localName;
    const isLocal = ns && u.startsWith(ns);
    return { uri: u, localName: isLocal ? u.slice(ns.length) : localName, label, isLocal };
  }

  // Build property objects first (needed for inDomainOf/inRangeOf on classes)
  const properties = [...propertyUris].map(uri => {
    const localName = uri.slice(ns.length);
    const types = allTypes.get(uri) || new Set();
    const isIFP = types.has(`${OWL}InverseFunctionalProperty`);
    const isFP = types.has(`${OWL}FunctionalProperty`);

    // Format domain/range: if URI is in our namespace, use localName link; otherwise full URI
    // Deduplicate URIs (some vocabs declare the same domain/range twice)
    const domainUris = [...new Set(getValues(quads, uri, `${RDFS}domain`))];
    const rangeUris = [...new Set(getValues(quads, uri, `${RDFS}range`))];

    return {
      uri,
      localName,
      label: getValue(quads, uri, `${RDFS}label`) || localName,
      comment: getValue(quads, uri, `${RDFS}comment`) || '',
      description: getValue(quads, uri, `${DCTERMS}description`) || '',
      status: getValue(quads, uri, `${VS}term_status`) || '',
      issued: getValue(quads, uri, `${DCTERMS}issued`) || '',
      domain: domainUris,
      range: rangeUris,
      subPropertyOf: getValues(quads, uri, `${RDFS}subPropertyOf`),
      inverseOf: getValue(quads, uri, `${OWL}inverseOf`) || '',
      rangeIncludes: getValues(quads, uri, `${DCAM}rangeIncludes`),
      domainIncludes: getValues(quads, uri, `${DCAM}domainIncludes`),
      domainLocalNames: domainUris.map(u => localNameFromUri(u)),
      rangeLocalNames: rangeUris.map(u => localNameFromUri(u)),
      isInverseFunctionalProperty: isIFP,
      isFunctionalProperty: isFP,
      // Formatted domain/range for templates: each entry has {uri, localName, label, isLocal}
      domainFormatted: domainUris.map(u => formatRef(u)),
      rangeFormatted: rangeUris.map(u => formatRef(u)),
      // Range excluding rdfs:Literal (suppressed by some specgens as uninformative)
      rangeFormattedNonLiteral: rangeUris.filter(u => u !== `${RDFS}Literal`).map(u => formatRef(u)),
      termType: 'Property',
    };
  });

  // Build domain/range lookup for classes (using Sets to deduplicate)
  const domainIndex = new Map(); // classUri -> Set of propertyLocalName
  const rangeIndex = new Map();  // classUri -> Set of propertyLocalName

  for (const prop of properties) {
    for (const d of prop.domain) {
      if (!domainIndex.has(d)) domainIndex.set(d, new Set());
      domainIndex.get(d).add(prop.localName);
    }
    for (const r of prop.range) {
      if (!rangeIndex.has(r)) rangeIndex.set(r, new Set());
      rangeIndex.get(r).add(prop.localName);
    }
  }

  // Build subclass inverse lookup: for each class, which classes have it as superclass
  const subClassIndex = new Map(); // classUri -> [subclass localNames]
  for (const uri of classUris) {
    const supers = getValues(quads, uri, `${RDFS}subClassOf`);
    for (const sup of supers) {
      if (!subClassIndex.has(sup)) subClassIndex.set(sup, []);
      subClassIndex.get(sup).push(uri.slice(ns.length));
    }
  }

  const classes = [...classUris].map(uri => {
    const localName = uri.slice(ns.length);
    const subClassOfUris = getValues(quads, uri, `${RDFS}subClassOf`);
    const disjointWithUris = getValues(quads, uri, `${OWL}disjointWith`);
    return {
      uri,
      localName,
      label: getValue(quads, uri, `${RDFS}label`) || localName,
      comment: getValue(quads, uri, `${RDFS}comment`) || '',
      description: getValue(quads, uri, `${DCTERMS}description`) || '',
      status: getValue(quads, uri, `${VS}term_status`) || '',
      issued: getValue(quads, uri, `${DCTERMS}issued`) || '',
      subClassOf: subClassOfUris,
      subClassOfFormatted: subClassOfUris.map(u => formatRef(u)),
      disjointWith: disjointWithUris,
      disjointWithFormatted: disjointWithUris.map(u => formatRef(u)),
      hasSubClass: (subClassIndex.get(uri) || []).map(ln => {
        const u = ns + ln;
        const label = getValue(quads, u, `${RDFS}label`) || ln;
        return { localName: ln, label };
      }),
      inDomainOf: [...(domainIndex.get(uri) || [])],
      inRangeOf: [...(rangeIndex.get(uri) || [])],
      memberOf: getValue(quads, uri, `${DCAM}memberOf`) || '',
      termType: 'Class',
    };
  });

  // Build simple term objects for datatypes and vocabulary encoding schemes
  function buildSimpleTerm(uri, termType) {
    const localName = uri.slice(ns.length);
    return {
      uri,
      localName,
      label: getValue(quads, uri, `${RDFS}label`) || localName,
      comment: getValue(quads, uri, `${RDFS}comment`) || '',
      description: getValue(quads, uri, `${DCTERMS}description`) || '',
      status: getValue(quads, uri, `${VS}term_status`) || '',
      issued: getValue(quads, uri, `${DCTERMS}issued`) || '',
      seeAlso: getValues(quads, uri, `${RDFS}seeAlso`),
      memberOf: getValue(quads, uri, `${DCAM}memberOf`) || '',
      termType,
    };
  }

  const datatypes = [...datatypeUris].map(uri => buildSimpleTerm(uri, 'Datatype'));
  const vocabularyEncodingSchemes = [...vesUris].map(uri => buildSimpleTerm(uri, 'Vocabulary Encoding Scheme'));

  // Add seeAlso to properties and classes too
  for (const term of [...properties, ...classes]) {
    term.seeAlso = getValues(quads, term.uri, `${RDFS}seeAlso`);
  }

  // Collect external classes referenced in domain/range but not in namespace
  const externalClasses = new Map(); // uri -> {uri, localName, label}
  for (const prop of properties) {
    for (const u of [...prop.domain, ...prop.range]) {
      if (ns && !u.startsWith(ns) && !externalClasses.has(u)) {
        // Find rdfs:label if declared inline in the RDF
        const label = getValue(quads, u, `${RDFS}label`) || localNameFromUri(u);
        externalClasses.set(u, { uri: u, localName: localNameFromUri(u), label });
      }
    }
  }
  // Also check subClassOf targets
  for (const cls of classes) {
    for (const u of cls.subClassOf) {
      if (ns && !u.startsWith(ns) && !externalClasses.has(u)) {
        const label = getValue(quads, u, `${RDFS}label`) || localNameFromUri(u);
        externalClasses.set(u, { uri: u, localName: localNameFromUri(u), label });
      }
    }
  }

  return { classes, properties, datatypes, vocabularyEncodingSchemes, externalClasses: [...externalClasses.values()] };
}

/**
 * Load HTML doc fragments for terms (e.g. FOAF's doc/Person.en files).
 */
export async function loadDocFragments(docDir) {
  const files = await readdir(docDir);
  const fragments = new Map();
  for (const file of files) {
    if (!file.endsWith('.en')) continue;
    const termName = file.slice(0, -3); // strip .en
    const content = await readFile(path.join(docDir, file), 'utf-8');
    fragments.set(termName, content);
  }
  return fragments;
}

/**
 * Generate an HTML specification from RDF input and a template.
 */
export async function generateSpec(opts) {
  const { rdfPath, templatePath, docDir, vocabMeta = {}, ancientBugs = null, extraRdf = [] } = opts;

  const quads = await parseRdf(rdfPath);

  // Detect namespace from the RDF file
  const namespace = detectNamespace(quads);
  const vocab = extractVocabulary(quads, { namespace });

  // Load doc fragments if a directory is provided
  let fragments = new Map();
  if (docDir) {
    fragments = await loadDocFragments(docDir);
  }

  // Sort by status (stable > testing > unstable > archaic), then alphabetically within each group
  const statusOrder = { stable: 0, testing: 1, unstable: 2, archaic: 3, '': 4 };
  const statusSort = (a, b) => {
    const sa = statusOrder[a.status] ?? 4;
    const sb = statusOrder[b.status] ?? 4;
    if (sa !== sb) return sa - sb;
    return a.localName.localeCompare(b.localName);
  };
  vocab.classes.sort(statusSort);
  vocab.properties.sort(statusSort);

  // Apply ancient bugs overrides if configured
  if (ancientBugs) {
    applyAncientBugs(vocab, ancientBugs);
  }

  // Attach doc fragments to classes and properties, with internal link post-processing
  const allLocalNames = new Set([
    ...vocab.classes.map(c => c.localName),
    ...vocab.properties.map(p => p.localName),
  ]);
  // Detect prefix from namespace: for http://xmlns.com/foaf/0.1/ -> "foaf"
  const vocabPrefix = vocabMeta.prefix || detectPrefix(namespace);
  // Build case-insensitive lookup for doc fragments (e.g. givenname -> givenName.en)
  const fragLowerMap = new Map();
  for (const [k, v] of fragments) fragLowerMap.set(k.toLowerCase(), v);

  const linkifyAll = ancientBugs?.brokenLinks?.linkifyUnknownTerms || false;
  for (const term of [...vocab.classes, ...vocab.properties]) {
    let frag = fragments.get(term.localName) || fragLowerMap.get(term.localName.toLowerCase()) || '';
    if (frag && vocabPrefix) {
      frag = linkifyDocFragment(frag, allLocalNames, vocabPrefix, linkifyAll);
    }
    term.docFragment = frag;
  }

  // Load the template
  const template = await readFile(templatePath, 'utf-8');

  // Load raw RDF content for embedding (if needed by template)
  let rdfContent = '';
  try {
    rdfContent = await readFile(rdfPath, 'utf-8');
  } catch (e) { /* ignore */ }

  // Sort additional term types
  const datatypes = vocab.datatypes || [];
  const vocabularyEncodingSchemes = vocab.vocabularyEncodingSchemes || [];
  datatypes.sort(statusSort);
  vocabularyEncodingSchemes.sort(statusSort);

  // Build sections for dcterms-style templates
  const allTerms = [...vocab.classes, ...vocab.properties, ...datatypes, ...vocabularyEncodingSchemes];
  const sections = [{ id: 'terms', heading: 'Terms', terms: allTerms }];

  // Alphabetically sorted copies for A-Z index (raw string sort matches the live spec's order)
  const alphaClasses = [...vocab.classes].sort((a, b) => a.localName < b.localName ? -1 : a.localName > b.localName ? 1 : 0);
  const alphaProperties = [...vocab.properties].sort((a, b) => a.localName < b.localName ? -1 : a.localName > b.localName ? 1 : 0);
  const alphaDatatypes = [...datatypes].sort((a, b) => a.localName < b.localName ? -1 : a.localName > b.localName ? 1 : 0);
  const alphaVes = [...vocabularyEncodingSchemes].sort((a, b) => a.localName < b.localName ? -1 : a.localName > b.localName ? 1 : 0);

  // Build the "empty placeholder" lines that the old specgen emitted between
  // the status row and the first section row.
  // When both inDomainOf and inRangeOf are empty:
  //   - If subClassOf is present: 1 placeholder line (the other merges into Subclass Of row)
  //   - If subClassOf is absent: 2 placeholder lines
  // When one is present and the other isn't: no placeholder.
  for (const cls of vocab.classes) {
    const hasD = cls.inDomainOf.length > 0;
    const hasR = cls.inRangeOf.length > 0;
    const hasSC = cls.subClassOf.length > 0;
    if (!hasD && !hasR) {
      cls.emptyPlaceholder = hasSC ? '\n            ' : '\n            \n            ';
    } else {
      cls.emptyPlaceholder = '';
    }
  }

  const skipIsDefinedBy = new Set(ancientBugs?.skipIsDefinedBy || []);
  // Mark classes that should skip isDefinedBy (ancient bug replication)
  for (const cls of vocab.classes) {
    cls.showIsDefinedBy = !skipIsDefinedBy.has(cls.localName);
  }

  // Parse extra RDF files (e.g. dc-elements, dcmitype, dcam)
  const extraVocabs = {};
  for (const { name, path: rdfFilePath } of extraRdf) {
    const extraQuads = await parseRdf(rdfFilePath);
    const extraNs = detectNamespace(extraQuads);
    const extraVocab = extractVocabulary(extraQuads, { namespace: extraNs });
    // Sort all term types alphabetically
    const alphaSort = (a, b) => a.localName < b.localName ? -1 : a.localName > b.localName ? 1 : 0;
    extraVocab.classes.sort(alphaSort);
    extraVocab.properties.sort(alphaSort);
    extraVocab.datatypes.sort(alphaSort);
    extraVocab.vocabularyEncodingSchemes.sort(alphaSort);
    extraVocabs[name] = { ...extraVocab, namespace: extraNs };
  }

  const view = {
    ...vocabMeta,
    title: vocabMeta.title || 'Vocabulary Specification',
    classes: vocab.classes,
    properties: vocab.properties,
    datatypes,
    vocabularyEncodingSchemes,
    alphaClasses,
    alphaProperties,
    alphaDatatypes,
    alphaVes,
    externalClasses: vocab.externalClasses || [],
    sections,
    allTerms,
    rdfContent,
    namespace,
    extraVocabs,
  };

  return nunjucksEnv.renderString(template, view);
}

/**
 * Post-process doc fragment HTML: replace <code>prefix:TermName</code> with linked version.
 */
function linkifyDocFragment(html, localNames, prefix, linkifyAll = false) {
  // Match <code>foaf:SomeTerm</code> and replace with <code><a href='#term_SomeTerm'>SomeTerm</a></code>
  // Uses single quotes and bare term name (no prefix) to match the live spec format.
  // When linkifyAll is true (ancient bugs mode), linkify even unknown terms — replicating
  // the old specgen's behavior that produced broken anchors like #term_skype for foaf:skype.
  return html.replace(
    new RegExp(`<code>${prefix}:(\\w+)</code>`, 'g'),
    (match, termName) => {
      if (localNames.has(termName) || linkifyAll) {
        return `<code><a href='#term_${termName}'>${termName}</a></code>`;
      }
      return match;
    }
  );
}

/**
 * Detect a short prefix from a namespace URI.
 * E.g. http://xmlns.com/foaf/0.1/ -> "foaf", http://purl.org/dc/terms/ -> "dcterms"
 */
function detectPrefix(namespace) {
  const known = {
    'http://xmlns.com/foaf/0.1/': 'foaf',
    'http://purl.org/dc/terms/': 'dcterms',
    'http://purl.org/dc/elements/1.1/': 'dc',
  };
  if (known[namespace]) return known[namespace];
  // Heuristic: take last non-version path segment
  const parts = namespace.replace(/[/#]$/, '').split('/');
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i] && !/^\d+(\.\d+)*$/.test(parts[i])) {
      return parts[i].toLowerCase();
    }
  }
  return '';
}

/**
 * Apply ancient bug overrides: reorder class property lists to match the old specgen's output.
 */
function applyAncientBugs(vocab, config) {
  const ordering = config.ordering || {};

  for (const cls of vocab.classes) {
    const overrides = ordering[cls.localName];
    if (!overrides) continue;

    if (overrides.inDomainOf) {
      cls.inDomainOf = reorderByList(cls.inDomainOf, overrides.inDomainOf);
    }
    if (overrides.inRangeOf) {
      cls.inRangeOf = reorderByList(cls.inRangeOf, overrides.inRangeOf);
    }
    if (overrides.hasSubClass) {
      cls.hasSubClass = reorderByList(cls.hasSubClass, overrides.hasSubClass, 'localName');
    }
    if (overrides.disjointWith) {
      cls.disjointWithFormatted = reorderByList(cls.disjointWithFormatted, overrides.disjointWith, 'localName');
    }
  }
}

/**
 * Reorder items to match a reference ordering.
 * For simple string arrays, items are matched directly.
 * For object arrays, items are matched by the given key.
 * Items not in the reference order are appended at the end.
 */
function reorderByList(items, order, key = null) {
  const result = [];
  for (const name of order) {
    const idx = key
      ? items.findIndex(item => item[key] === name)
      : items.indexOf(name);
    if (idx !== -1) {
      result.push(items[idx]);
    }
  }
  // Append any items not in the override list
  for (const item of items) {
    const name = key ? item[key] : item;
    if (!order.includes(name)) {
      result.push(item);
    }
  }
  return result;
}

/**
 * Detect the primary namespace from quads by finding the most common rdfs:isDefinedBy target.
 */
function detectNamespace(quads) {
  const counts = new Map();
  for (const q of quads) {
    if (q.predicate.value === `${RDFS}isDefinedBy`) {
      const ns = q.object.value;
      counts.set(ns, (counts.get(ns) || 0) + 1);
    }
  }
  if (counts.size === 0) return '';
  let best = '';
  let bestCount = 0;
  for (const [ns, count] of counts) {
    if (count > bestCount) { best = ns; bestCount = count; }
  }
  return best;
}
