
import { Injectable } from '@nestjs/common';
import { MemoryEntry } from '../types/ltm.types';

interface TermData {
  df: number; 
  postings: Map<string, number[]>; 
}

interface DocumentData {
  content: string;
  terms: Set<string>;
  length: number;
}

@Injectable()
export class LTMIndexService {
  private invertedIndex: Map<string, TermData> = new Map();
  private documents: Map<string, DocumentData> = new Map();
  private memoryIndex: Map<string, MemoryEntry> = new Map();
  private readonly STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
    'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she',
    'we', 'they', 'what', 'which', 'who', 'whom', 'whose', 'where', 'when',
    'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
    'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
    'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there', 'then',
    'once', 'if', 'because', 'as', 'until', 'while', 'about', 'against',
    'between', 'into', 'through', 'during', 'before', 'after', 'above',
    'below', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further',
    'then', 'any', 'code', 'using', 'used', 'use', 'task', 'agent', 'error',
  ]);

    index(memory: MemoryEntry): void {
    const content = this.preprocess(memory.content);
    const terms = this.tokenize(content);

    
    this.documents.set(memory.id, {
      content: memory.content,
      terms: new Set(terms),
      length: terms.length,
    });

    
    this.memoryIndex.set(memory.id, memory);

    
    const termFreq = this.computeTermFrequency(terms);

    for (const [term, tf] of Object.entries(termFreq)) {
      if (!this.invertedIndex.has(term)) {
        this.invertedIndex.set(term, {
          df: 0,
          postings: new Map(),
        });
      }

      const termData = this.invertedIndex.get(term)!;
      const isNewDoc = !termData.postings.has(memory.id);

      if (isNewDoc) {
        termData.df++;
      }

      termData.postings.set(memory.id, tf);
    }
  }

    remove(memoryId: string): void {
    const doc = this.documents.get(memoryId);
    if (!doc) return;

    
    for (const term of doc.terms) {
      const termData = this.invertedIndex.get(term);
      if (termData && termData.postings.has(memoryId)) {
        termData.postings.delete(memoryId);
        termData.df--;

        if (termData.df === 0) {
          this.invertedIndex.delete(term);
        }
      }
    }

    
    this.documents.delete(memoryId);
    this.memoryIndex.delete(memoryId);
  }

    search(query: string, limit: number = 10): MemoryEntry[] {
    const queryTerms = this.tokenize(this.preprocess(query));
    const queryTf = this.computeTermFrequency(queryTerms);

    const scores: Map<string, number> = new Map();

    
    for (const [term, queryTfValue] of Object.entries(queryTf)) {
      const termData = this.invertedIndex.get(term);
      if (!termData) continue;

      const idf = Math.log((this.documents.size + 1) / (termData.df + 1)) + 1;

      for (const [docId, docTf] of termData.postings.entries()) {
        const currentScore = scores.get(docId) || 0;
        const tfidf = queryTfValue * docTf * idf;
        scores.set(docId, currentScore + tfidf);
      }
    }

    
    const normalizedScores: Map<string, number> = new Map();
    for (const [docId, score] of scores.entries()) {
      const doc = this.documents.get(docId);
      if (doc && doc.length > 0) {
        normalizedScores.set(docId, score / Math.sqrt(doc.length));
      } else {
        normalizedScores.set(docId, score);
      }
    }

    
    const sorted = Array.from(normalizedScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([docId]) => this.memoryIndex.get(docId))
      .filter((m): m is MemoryEntry => m !== undefined);

    return sorted;
  }

    searchWithRecency(query: string, limit: number = 10, recencyWeight: number = 0.3): MemoryEntry[] {
    const semanticResults = this.search(query, limit * 2);

    if (semanticResults.length === 0) {
      return [];
    }

    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; 

    const scored = semanticResults.map((memory) => {
      const semanticScore = this.calculateSemanticScore(query, memory);
      const recencyScore = Math.exp(-(now - memory.timestamp) / maxAge);
      const combinedScore = semanticScore * (1 - recencyWeight) + recencyScore * recencyWeight;

      return { memory, score: combinedScore };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.memory);
  }

    clear(): void {
    this.invertedIndex.clear();
    this.documents.clear();
    this.memoryIndex.clear();
  }

    getStats(): { documentCount: number; termCount: number; avgDocLength: number } {
    const totalLength = Array.from(this.documents.values()).reduce(
      (sum, doc) => sum + doc.length,
      0,
    );

    return {
      documentCount: this.documents.size,
      termCount: this.invertedIndex.size,
      avgDocLength: this.documents.size > 0 ? totalLength / this.documents.size : 0,
    };
  }

    private preprocess(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

    private tokenize(text: string): string[] {
    return text
      .split(' ')
      .filter((term) => term.length > 1 && !this.STOP_WORDS.has(term));
  }

    private computeTermFrequency(terms: string[]): Record<string, number> {
    const tf: Record<string, number> = {};

    for (const term of terms) {
      tf[term] = (tf[term] || 0) + 1;
    }

    
    const total = terms.length || 1;
    for (const term of Object.keys(tf)) {
      tf[term] = tf[term] / total;
    }

    return tf;
  }

    private calculateSemanticScore(query: string, memory: MemoryEntry): number {
    const queryTerms = this.tokenize(this.preprocess(query));
    const memoryTerms = this.documents.get(memory.id)?.terms || new Set();

    const matches = queryTerms.filter((term) => memoryTerms.has(term)).length;
    return matches / queryTerms.length;
  }
}
