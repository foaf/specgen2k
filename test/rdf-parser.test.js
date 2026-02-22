import { describe, it, expect } from 'vitest';
import { parseRdf } from '../src/rdf-parser.js';
import path from 'path';

const FOAF_RDF = path.resolve('../third_party/xmlns-foaf/xmlns-foaf-rdf.xml');
const DCTERMS_RDF = path.resolve('../third_party/dcterms/dcterms-rdf.xml');

describe('RDF Parser', () => {

  describe('FOAF RDF/XML', () => {
    it('should parse FOAF RDF/XML without errors', async () => {
      const quads = await parseRdf(FOAF_RDF, 'rdfxml');
      expect(quads.length).toBeGreaterThan(0);
    });

    it('should find foaf:Person as an rdfs:Class', async () => {
      const quads = await parseRdf(FOAF_RDF, 'rdfxml');
      const personType = quads.find(
        q => q.subject.value === 'http://xmlns.com/foaf/0.1/Person'
          && q.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
          && q.object.value === 'http://www.w3.org/2000/01/rdf-schema#Class'
      );
      expect(personType).toBeDefined();
    });

    it('should find rdfs:label for foaf:Person', async () => {
      const quads = await parseRdf(FOAF_RDF, 'rdfxml');
      const label = quads.find(
        q => q.subject.value === 'http://xmlns.com/foaf/0.1/Person'
          && q.predicate.value === 'http://www.w3.org/2000/01/rdf-schema#label'
      );
      expect(label).toBeDefined();
      expect(label.object.value).toBe('Person');
    });

    it('should find vs:term_status for foaf:Person', async () => {
      const quads = await parseRdf(FOAF_RDF, 'rdfxml');
      const status = quads.find(
        q => q.subject.value === 'http://xmlns.com/foaf/0.1/Person'
          && q.predicate.value === 'http://www.w3.org/2003/06/sw-vocab-status/ns#term_status'
      );
      expect(status).toBeDefined();
      expect(status.object.value).toBe('stable');
    });

    it('should find all 13 FOAF classes', async () => {
      const quads = await parseRdf(FOAF_RDF, 'rdfxml');
      const classes = new Set(
        quads
          .filter(q =>
            q.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
            && q.object.value === 'http://www.w3.org/2000/01/rdf-schema#Class'
            && q.subject.value.startsWith('http://xmlns.com/foaf/0.1/')
          )
          .map(q => q.subject.value)
      );
      expect(classes.size).toBe(13);
    });

    it('should find foaf:knows as an rdf:Property', async () => {
      const quads = await parseRdf(FOAF_RDF, 'rdfxml');
      const knowsProp = quads.find(
        q => q.subject.value === 'http://xmlns.com/foaf/0.1/knows'
          && q.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
          && q.object.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#Property'
      );
      expect(knowsProp).toBeDefined();
    });

    it('should find rdfs:domain for foaf:knows', async () => {
      const quads = await parseRdf(FOAF_RDF, 'rdfxml');
      const domain = quads.find(
        q => q.subject.value === 'http://xmlns.com/foaf/0.1/knows'
          && q.predicate.value === 'http://www.w3.org/2000/01/rdf-schema#domain'
      );
      expect(domain).toBeDefined();
      expect(domain.object.value).toBe('http://xmlns.com/foaf/0.1/Person');
    });

    it('should find rdfs:range for foaf:knows', async () => {
      const quads = await parseRdf(FOAF_RDF, 'rdfxml');
      const range = quads.find(
        q => q.subject.value === 'http://xmlns.com/foaf/0.1/knows'
          && q.predicate.value === 'http://www.w3.org/2000/01/rdf-schema#range'
      );
      expect(range).toBeDefined();
      expect(range.object.value).toBe('http://xmlns.com/foaf/0.1/Person');
    });

    it('should find owl:inverseOf between foaf:made and foaf:maker', async () => {
      const quads = await parseRdf(FOAF_RDF, 'rdfxml');
      const inverse = quads.find(
        q => q.subject.value === 'http://xmlns.com/foaf/0.1/made'
          && q.predicate.value === 'http://www.w3.org/2002/07/owl#inverseOf'
          && q.object.value === 'http://xmlns.com/foaf/0.1/maker'
      );
      expect(inverse).toBeDefined();
    });
  });

  describe('Dublin Core Terms RDF/XML', () => {
    it('should parse DC Terms RDF/XML without errors', async () => {
      const quads = await parseRdf(DCTERMS_RDF, 'rdfxml');
      expect(quads.length).toBeGreaterThan(0);
    });

    it('should find dcterms:title as an rdf:Property', async () => {
      const quads = await parseRdf(DCTERMS_RDF, 'rdfxml');
      const titleProp = quads.find(
        q => q.subject.value === 'http://purl.org/dc/terms/title'
          && q.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
          && q.object.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#Property'
      );
      expect(titleProp).toBeDefined();
    });

    it('should find rdfs:label for dcterms:title', async () => {
      const quads = await parseRdf(DCTERMS_RDF, 'rdfxml');
      const label = quads.find(
        q => q.subject.value === 'http://purl.org/dc/terms/title'
          && q.predicate.value === 'http://www.w3.org/2000/01/rdf-schema#label'
      );
      expect(label).toBeDefined();
      expect(label.object.value).toBe('Title');
    });

    it('should find dcterms:issued dates', async () => {
      const quads = await parseRdf(DCTERMS_RDF, 'rdfxml');
      const issued = quads.find(
        q => q.subject.value === 'http://purl.org/dc/terms/title'
          && q.predicate.value === 'http://purl.org/dc/terms/issued'
      );
      expect(issued).toBeDefined();
    });

    it('should find dcam:rangeIncludes for dcterms:creator', async () => {
      const quads = await parseRdf(DCTERMS_RDF, 'rdfxml');
      const rangeIncludes = quads.find(
        q => q.subject.value === 'http://purl.org/dc/terms/creator'
          && q.predicate.value === 'http://purl.org/dc/dcam/rangeIncludes'
      );
      expect(rangeIncludes).toBeDefined();
      expect(rangeIncludes.object.value).toBe('http://purl.org/dc/terms/Agent');
    });

    it('should find rdfs:subPropertyOf relationships', async () => {
      const quads = await parseRdf(DCTERMS_RDF, 'rdfxml');
      const subProp = quads.find(
        q => q.subject.value === 'http://purl.org/dc/terms/creator'
          && q.predicate.value === 'http://www.w3.org/2000/01/rdf-schema#subPropertyOf'
      );
      expect(subProp).toBeDefined();
    });
  });
});
