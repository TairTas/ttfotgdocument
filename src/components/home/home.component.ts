import { Component, ChangeDetectionStrategy, output, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DocumentService } from '../../services/document.service';
import { Document } from '../../models/document.model';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule]
})
export class HomeComponent {
  create = output<void>();
  open = output<string>();

  private documentService = inject(DocumentService);
  documents = computed(() => this.documentService.documents().sort((a, b) => b.updatedAt - a.updatedAt));

  // Password prompt state
  documentToUnlock = signal<Document | null>(null);
  passwordAttempt = signal('');
  passwordError = signal<string | null>(null);

  onCreateNew() {
    this.create.emit();
  }

  onOpenDocument(doc: Document) {
    if (doc.password) {
      this.passwordError.set(null);
      this.passwordAttempt.set('');
      this.documentToUnlock.set(doc);
    } else {
      this.open.emit(doc.id);
    }
  }
  
  handlePasswordSubmit() {
    const doc = this.documentToUnlock();
    if (doc && doc.password === this.passwordAttempt()) {
      this.open.emit(doc.id);
      this.cancelUnlock();
    } else {
      this.passwordError.set('Incorrect password. Please try again.');
    }
  }
  
  cancelUnlock() {
    this.documentToUnlock.set(null);
  }

  onDeleteDocument(event: MouseEvent, id: string) {
    event.stopPropagation();
    if (confirm('Are you sure you want to delete this document?')) {
      this.documentService.deleteDocument(id);
    }
  }

  formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
}
