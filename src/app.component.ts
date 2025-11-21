import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HomeComponent } from './components/home/home.component';
import { EditorComponent } from './components/editor/editor.component';
import { DocumentService } from './services/document.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, HomeComponent, EditorComponent]
})
export class AppComponent implements OnInit {
  currentView = signal<'home' | 'editor'>('home');
  selectedDocumentId = signal<string | null>(null);
  private docService = inject(DocumentService);

  ngOnInit() {
    this.handleSharedDocument();
  }

  private handleSharedDocument() {
    const hash = window.location.hash;
    if (hash.startsWith('#/share/')) {
      try {
        const encodedData = hash.substring(8); // Length of '#/share/'
        const decodedJson = atob(encodedData);
        const sharedData = JSON.parse(decodedJson);

        if (sharedData.title && sharedData.content) {
          if (confirm('A shared document was detected. Do you want to import it?')) {
            const newDoc = this.docService.importSharedDocument(sharedData);
            this.navigateToEditor(newDoc.id);
          }
        }
      } catch (e) {
        console.error('Failed to parse shared document data from URL.', e);
        alert('Could not import the shared document. The link may be corrupted.');
      } finally {
        // Clean up the URL
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
  }

  navigateToEditor(docId: string | null) {
    this.selectedDocumentId.set(docId);
    this.currentView.set('editor');
  }

  navigateToHome() {
    this.selectedDocumentId.set(null);
    this.currentView.set('home');
  }
}
