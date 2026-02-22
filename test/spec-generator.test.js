import { describe, it, expect } from 'vitest';
import { parseRdf } from '../src/rdf-parser.js';
import { extractVocabulary, loadDocFragments, generateSpec } from '../src/spec-generator.js';
import { readFile } from 'fs/promises';
import path from 'path';

const FOAF_RDF = path.resolve('../third_party/xmlns-foaf/xmlns-foaf-rdf.xml');
const FOAF_HTML = path.resolve('../third_party/xmlns-foaf/xmlns-foaf-currentpage.html');
const FOAF_DOC_DIR = path.resolve('../third_party/xmlns-foaf/doc');

const DCTERMS_RDF = path.resolve('../third_party/dcterms/dcterms-rdf.xml');
const DCTERMS_HTML = path.resolve('../third_party/dcterms/dcmi-terms-currentpage.html');

describe('Vocabulary Extraction', () => {

  describe('FOAF vocabulary extraction', () => {
    it('should extract classes from FOAF RDF', async () => {
      const quads = await parseRdf(FOAF_RDF);
      const vocab = extractVocabulary(quads, { namespace: 'http://xmlns.com/foaf/0.1/' });
      expect(vocab.classes).toBeDefined();
      expect(vocab.classes.length).toBe(13);
    });

    it('should extract properties from FOAF RDF', async () => {
      const quads = await parseRdf(FOAF_RDF);
      const vocab = extractVocabulary(quads, { namespace: 'http://xmlns.com/foaf/0.1/' });
      expect(vocab.properties).toBeDefined();
      expect(vocab.properties.length).toBeGreaterThan(50);
    });

    it('should extract label, comment, and status for each class', async () => {
      const quads = await parseRdf(FOAF_RDF);
      const vocab = extractVocabulary(quads, { namespace: 'http://xmlns.com/foaf/0.1/' });
      const person = vocab.classes.find(c => c.localName === 'Person');
      expect(person).toBeDefined();
      expect(person.label).toBe('Person');
      expect(person.comment).toBe('A person.');
      expect(person.status).toBe('stable');
    });

    it('should extract domain and range for properties', async () => {
      const quads = await parseRdf(FOAF_RDF);
      const vocab = extractVocabulary(quads, { namespace: 'http://xmlns.com/foaf/0.1/' });
      const knows = vocab.properties.find(p => p.localName === 'knows');
      expect(knows).toBeDefined();
      expect(knows.domain).toContain('http://xmlns.com/foaf/0.1/Person');
      expect(knows.range).toContain('http://xmlns.com/foaf/0.1/Person');
    });

    it('should extract inverse relationships', async () => {
      const quads = await parseRdf(FOAF_RDF);
      const vocab = extractVocabulary(quads, { namespace: 'http://xmlns.com/foaf/0.1/' });
      const made = vocab.properties.find(p => p.localName === 'made');
      expect(made).toBeDefined();
      expect(made.inverseOf).toBe('http://xmlns.com/foaf/0.1/maker');
    });

    it('should compute in-domain-of and in-range-of for classes', async () => {
      const quads = await parseRdf(FOAF_RDF);
      const vocab = extractVocabulary(quads, { namespace: 'http://xmlns.com/foaf/0.1/' });
      const agent = vocab.classes.find(c => c.localName === 'Agent');
      expect(agent).toBeDefined();
      // Agent is in the domain of mbox, gender, jabberID, etc.
      expect(agent.inDomainOf.length).toBeGreaterThan(0);
      // Agent is in the range of maker, member
      expect(agent.inRangeOf.length).toBeGreaterThan(0);
    });
  });

  describe('DC Terms vocabulary extraction', () => {
    it('should extract properties from DC Terms RDF', async () => {
      const quads = await parseRdf(DCTERMS_RDF);
      const vocab = extractVocabulary(quads, { namespace: 'http://purl.org/dc/terms/' });
      expect(vocab.properties).toBeDefined();
      expect(vocab.properties.length).toBeGreaterThan(40);
    });

    it('should extract classes from DC Terms RDF', async () => {
      const quads = await parseRdf(DCTERMS_RDF);
      const vocab = extractVocabulary(quads, { namespace: 'http://purl.org/dc/terms/' });
      expect(vocab.classes).toBeDefined();
      expect(vocab.classes.length).toBeGreaterThan(15);
    });

    it('should extract label, comment, and issued date for dcterms:title', async () => {
      const quads = await parseRdf(DCTERMS_RDF);
      const vocab = extractVocabulary(quads, { namespace: 'http://purl.org/dc/terms/' });
      const title = vocab.properties.find(p => p.localName === 'title');
      expect(title).toBeDefined();
      expect(title.label).toBe('Title');
      expect(title.issued).toBeDefined();
    });

    it('should extract dcam:rangeIncludes for dcterms:creator', async () => {
      const quads = await parseRdf(DCTERMS_RDF);
      const vocab = extractVocabulary(quads, { namespace: 'http://purl.org/dc/terms/' });
      const creator = vocab.properties.find(p => p.localName === 'creator');
      expect(creator).toBeDefined();
      expect(creator.rangeIncludes).toContain('http://purl.org/dc/terms/Agent');
    });

    it('should extract subPropertyOf relationships', async () => {
      const quads = await parseRdf(DCTERMS_RDF);
      const vocab = extractVocabulary(quads, { namespace: 'http://purl.org/dc/terms/' });
      const creator = vocab.properties.find(p => p.localName === 'creator');
      expect(creator).toBeDefined();
      expect(creator.subPropertyOf.length).toBeGreaterThan(0);
    });
  });
});

describe('Doc Fragment Loading', () => {
  it('should load FOAF doc fragments from disk', async () => {
    const fragments = await loadDocFragments(FOAF_DOC_DIR);
    expect(fragments).toBeDefined();
    expect(fragments.get('Person')).toContain('foaf:Person');
    expect(fragments.get('Agent')).toBeDefined();
  });

  it('should load all available doc fragments', async () => {
    const fragments = await loadDocFragments(FOAF_DOC_DIR);
    // At least the 13 classes should have fragments
    expect(fragments.size).toBeGreaterThanOrEqual(13);
  });
});

describe('FOAF HTML Generation', () => {
  it('should generate HTML containing all FOAF class names', async () => {
    const html = await generateSpec({
      rdfPath: FOAF_RDF,
      templatePath: path.resolve('templates/foaf.njk'),
      docDir: FOAF_DOC_DIR,
    });
    const expectedClasses = [
      'Agent', 'Person', 'Document', 'Organization', 'Group',
      'Project', 'Image', 'PersonalProfileDocument', 'OnlineAccount',
    ];
    for (const cls of expectedClasses) {
      expect(html).toContain(`foaf:${cls}`);
    }
  });

  it('should generate HTML containing term status for each class', async () => {
    const html = await generateSpec({
      rdfPath: FOAF_RDF,
      templatePath: path.resolve('templates/foaf.njk'),
      docDir: FOAF_DOC_DIR,
    });
    // Person should show as stable
    expect(html).toContain('stable');
    expect(html).toContain('testing');
  });

  it('should include doc fragment content for Person', async () => {
    const html = await generateSpec({
      rdfPath: FOAF_RDF,
      templatePath: path.resolve('templates/foaf.njk'),
      docDir: FOAF_DOC_DIR,
    });
    // Person.en fragment content
    expect(html).toContain("all people are considered 'agents'");
  });

  it('should generate HTML with term anchors matching the reference output', async () => {
    const html = await generateSpec({
      rdfPath: FOAF_RDF,
      templatePath: path.resolve('templates/foaf.njk'),
      docDir: FOAF_DOC_DIR,
    });
    expect(html).toContain('id="term_Person"');
    expect(html).toContain('id="term_Agent"');
    expect(html).toContain('id="term_knows"');
  });

  it('should include domain and range info in generated HTML', async () => {
    const html = await generateSpec({
      rdfPath: FOAF_RDF,
      templatePath: path.resolve('templates/foaf.njk'),
      docDir: FOAF_DOC_DIR,
    });
    // foaf:knows has domain and range of Person
    expect(html).toMatch(/Domain.*Person/s);
    expect(html).toMatch(/Range.*Person/s);
  });
});

describe('DC Terms HTML Generation', () => {
  it('should generate HTML containing all DC Terms property names', async () => {
    const html = await generateSpec({
      rdfPath: DCTERMS_RDF,
      templatePath: path.resolve('templates/dcterms.njk'),
    });
    const expectedProps = ['abstract', 'creator', 'title', 'subject', 'description', 'publisher', 'date'];
    for (const prop of expectedProps) {
      expect(html).toContain(prop);
    }
  });

  it('should generate HTML with URI for each term', async () => {
    const html = await generateSpec({
      rdfPath: DCTERMS_RDF,
      templatePath: path.resolve('templates/dcterms.njk'),
    });
    expect(html).toContain('http://purl.org/dc/terms/title');
    expect(html).toContain('http://purl.org/dc/terms/creator');
  });

  it('should generate HTML with labels and definitions', async () => {
    const html = await generateSpec({
      rdfPath: DCTERMS_RDF,
      templatePath: path.resolve('templates/dcterms.njk'),
    });
    expect(html).toContain('Title');
    expect(html).toContain('Creator');
  });

  it('should include rangeIncludes and subPropertyOf info', async () => {
    const html = await generateSpec({
      rdfPath: DCTERMS_RDF,
      templatePath: path.resolve('templates/dcterms.njk'),
    });
    // dcterms:creator rangeIncludes Agent
    expect(html).toContain('Agent');
  });

  it('should generate HTML with article elements for each term', async () => {
    const html = await generateSpec({
      rdfPath: DCTERMS_RDF,
      templatePath: path.resolve('templates/dcterms.njk'),
    });
    expect(html).toContain('<article');
    // Should have many article elements (one per term)
    const articleCount = (html.match(/<article/g) || []).length;
    expect(articleCount).toBeGreaterThan(40);
  });
});
