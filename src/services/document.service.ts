import { Injectable, signal } from '@angular/core';
import { Document } from '../models/document.model';

@Injectable({
  providedIn: 'root',
})
export class DocumentService {
  private readonly storageKey = 'ai-text-editor-documents';
  
  documents = signal<Document[]>(this.loadDocumentsFromStorage());

  private loadDocumentsFromStorage(): Document[] {
    try {
      const docsJson = localStorage.getItem(this.storageKey);
      if (!docsJson) return [];
      const docs: Document[] = JSON.parse(docsJson);
      // Migration for old format (content as string) to new format (content as string[])
      return docs.map((doc: any) => {
        if (typeof doc.content === 'string') {
          return { ...doc, content: [doc.content || '<p><br></p>'] };
        }
        return doc;
      });
    } catch (e) {
      console.error('Error loading documents from storage', e);
      return [];
    }
  }

  private saveDocumentsToStorage() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.documents()));
    } catch (e) {
      console.error('Error saving documents to storage', e);
    }
  }

  getDocument(id: string): Document | undefined {
    return this.documents().find(doc => doc.id === id);
  }

  createDocument(): Document {
    const newDoc: Document = {
      id: self.crypto.randomUUID(),
      title: 'Untitled Document',
      content: ['<h1>Start writing...</h1><p><br></p>'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.documents.update(docs => [...docs, newDoc]);
    this.saveDocumentsToStorage();
    return newDoc;
  }

  importSharedDocument(data: { title: string; content: string }): Document {
    const newDoc: Document = {
      id: self.crypto.randomUUID(),
      title: `Shared: ${data.title}`,
      content: [data.content], // Import as the first page
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.documents.update(docs => [newDoc, ...docs]);
    this.saveDocumentsToStorage();
    return newDoc;
  }

  updateDocument(updatedDoc: Document) {
    updatedDoc.updatedAt = Date.now();
    this.documents.update(docs => 
      docs.map(doc => (doc.id === updatedDoc.id ? updatedDoc : doc))
    );
    this.saveDocumentsToStorage();
  }

  deleteDocument(id: string) {
    this.documents.update(docs => docs.filter(doc => doc.id !== id));
    this.saveDocumentsToStorage();
  }
}