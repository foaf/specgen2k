import { RdfXmlParser } from 'rdfxml-streaming-parser';
import { Parser as N3Parser } from 'n3';
import { readFile } from 'fs/promises';

/**
 * Parse an RDF file (RDF/XML, Turtle, or NTriples) into an array of RDFJS quads.
 * @param {string} filePath - Path to the RDF file
 * @param {string} [format] - Format hint: 'rdfxml', 'turtle', 'ntriples'. Auto-detected from extension if omitted.
 * @returns {Promise<Array>} Array of RDFJS quads
 */
export async function parseRdf(filePath, format) {
  if (!format) {
    if (filePath.endsWith('.rdf') || filePath.endsWith('.xml')) format = 'rdfxml';
    else if (filePath.endsWith('.ttl')) format = 'turtle';
    else if (filePath.endsWith('.nt')) format = 'ntriples';
    else format = 'rdfxml';
  }

  const content = await readFile(filePath, 'utf-8');

  if (format === 'rdfxml') {
    return parseRdfXml(content);
  } else {
    return parseN3(content, format);
  }
}

function parseRdfXml(content) {
  return new Promise((resolve, reject) => {
    const parser = new RdfXmlParser();
    const quads = [];
    parser.on('data', (quad) => quads.push(quad));
    parser.on('error', reject);
    parser.on('end', () => resolve(quads));
    parser.end(content);
  });
}

function parseN3(content, format) {
  return new Promise((resolve, reject) => {
    const mimeType = format === 'turtle' ? 'text/turtle' : 'application/n-triples';
    const parser = new N3Parser({ format: mimeType });
    const quads = [];
    parser.parse(content, (error, quad) => {
      if (error) reject(error);
      else if (quad) quads.push(quad);
      else resolve(quads);
    });
  });
}
