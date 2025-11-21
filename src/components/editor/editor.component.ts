import { Component, ChangeDetectionStrategy, input, output, signal, viewChild, ElementRef, OnInit, inject, effect, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DocumentService } from '../../services/document.service';
import { GeminiService } from '../../services/gemini.service';
import type { Document } from '../../models/document.model';
import type { Chat, GenerateContentResponse } from '@google/genai';

// These would be global in a real app from the script tags
declare var jspdf: any;
declare var html2canvas: any;
declare var docx: any;

@Component({
  selector: 'app-editor',
  templateUrl: './editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule]
})
export class EditorComponent implements OnInit, AfterViewInit {
  documentId = input<string | null>();
  close = output<void>();

  private docService = inject(DocumentService);
  private geminiService = inject(GeminiService);
  
  editorRef = viewChild<ElementRef<HTMLDivElement>>('editor');
  
  document = signal<Document | null>(null);
  isAiChatVisible = signal(false);
  isExportMenuVisible = signal(false);
  saveStatus = signal<'idle' | 'saving' | 'saved'>('idle');

  // Modal States
  isProtectModalVisible = signal(false);
  isShareModalVisible = signal(false);

  // Password State
  newPassword = signal('');
  confirmPassword = signal('');
  passwordSetError = signal<string | null>(null);

  // Share State
  shareLink = signal('');
  copyButtonText = signal('Copy');

  // Toolbar State
  isBold = signal(false);
  isItalic = signal(false);
  isUnderline = signal(false);

  // AI Chat State
  isAiAvailable = signal(this.geminiService.isConfigured());
  chatSession = signal<Chat | null>(null);
  chatMessages = signal<{ role: 'user' | 'model'; text: string; id: number }[]>([]);
  userMessage = signal('');
  isAiLoading = signal(false);

  private lastSelection: Range | null = null;
  private readonly pageBreakHtml = '<hr class="page-break" contenteditable="false">';

  constructor() {
    effect(() => {
        const doc = this.document();
        const editorEl = this.editorRef()?.nativeElement;
        if(doc && editorEl) {
            const fullContent = doc.content.join(this.pageBreakHtml);
            if (editorEl.innerHTML !== fullContent) {
                editorEl.innerHTML = fullContent;
            }
        }
    });
  }

  ngOnInit() {
    const id = this.documentId();
    let docToLoad: Document | undefined | null = null;
    if (id) {
      docToLoad = this.docService.getDocument(id);
    } else {
      docToLoad = this.docService.createDocument();
    }
    
    if (docToLoad) {
      this.document.set(docToLoad);
    } else {
      this.onClose();
    }
  }

  ngAfterViewInit() {
    const editorEl = this.editorRef()?.nativeElement;
    if (editorEl) {
      editorEl.addEventListener('blur', () => this.saveLastSelection());
      const updateState = () => this.updateToolbarState();
      editorEl.addEventListener('keyup', updateState);
      editorEl.addEventListener('mouseup', updateState);
      document.addEventListener('selectionchange', () => {
        const selection = window.getSelection();
        if (selection && editorEl.contains(selection.anchorNode)) {
          updateState();
        }
      });
    }
  }
  
  private saveLastSelection() {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const editorEl = this.editorRef()?.nativeElement;
      if (editorEl && editorEl.contains(selection.getRangeAt(0).commonAncestorContainer)) {
         this.lastSelection = selection.getRangeAt(0).cloneRange();
      }
    }
  }

  updateToolbarState() {
    this.isBold.set(document.queryCommandState('bold'));
    this.isItalic.set(document.queryCommandState('italic'));
    this.isUnderline.set(document.queryCommandState('underline'));
  }

  onClose() {
    this.saveDocument();
    this.close.emit();
  }

  saveDocument(docToSave?: Document) {
    const currentDoc = docToSave || this.document();
    const editor = this.editorRef()?.nativeElement;
    if (currentDoc && editor) {
      const content = editor.innerHTML;
      const pages = content.split(this.pageBreakHtml);
      
      const currentFullContent = currentDoc.content.join(this.pageBreakHtml);
      if (currentFullContent === content && !docToSave) return;
      
      this.saveStatus.set('saving');
      const updatedDoc = { ...currentDoc, content: pages };
      this.docService.updateDocument(updatedDoc);
      this.document.set(updatedDoc);
      this.saveStatus.set('saved');
      setTimeout(() => this.saveStatus.set('idle'), 2000);
    }
  }

  updateTitle(event: Event) {
    const newTitle = (event.target as HTMLInputElement).value;
    const currentDoc = this.document();
    if (currentDoc) {
      this.document.set({ ...currentDoc, title: newTitle });
    }
  }

  applyFormat(command: string, value: string | null = null) {
    document.execCommand(command, false, value);
    this.editorRef()?.nativeElement.focus();
    this.updateToolbarState();
  }

  addPage() {
    this.applyFormat('insertHTML', this.pageBreakHtml);
  }
  
  toggleAiChat() {
    this.isAiChatVisible.update(v => !v);
    if (this.isAiChatVisible() && !this.chatSession()) {
      this.chatSession.set(this.geminiService.startChat());
    }
  }
  
  async sendChatMessage() {
    const message = this.userMessage().trim();
    if (!message || !this.chatSession() || this.isAiLoading()) return;

    this.isAiLoading.set(true);
    this.chatMessages.update(m => [...m, { role: 'user', text: message, id: Date.now() }]);
    this.userMessage.set('');
    
    try {
      const chat = this.chatSession();
      if (!chat) throw new Error("Chat not initialized");
      const stream = await chat.sendMessageStream({ message });
      let fullResponse = '';
      const modelMessageId = Date.now();
      this.chatMessages.update(m => [...m, { role: 'model', text: '...', id: modelMessageId }]);
      
      for await (const chunk of stream) {
        fullResponse += chunk.text;
        this.chatMessages.update(m => m.map(msg => msg.id === modelMessageId ? {...msg, text: fullResponse + '...'} : msg));
      }
      this.chatMessages.update(m => m.map(msg => msg.id === modelMessageId ? {...msg, text: fullResponse} : msg));

    } catch (error) {
      console.error('Error sending message to AI:', error);
       this.chatMessages.update(m => [...m.filter(msg => msg.text !== '...'), {role: 'model', text: 'Sorry, an error occurred.', id: Date.now()}]);
    } finally {
      this.isAiLoading.set(false);
    }
  }

  insertAiResponse(text: string) {
    const editor = this.editorRef()?.nativeElement;
    if (editor) {
        editor.focus();
        const selection = window.getSelection();
        if (selection) {
            if (this.lastSelection) {
                selection.removeAllRanges();
                selection.addRange(this.lastSelection);
            }
            const paragraph = `<p>${text.replace(/\n/g, '</p><p>')}</p>`;
            document.execCommand('insertHTML', false, paragraph);
            this.saveLastSelection();
        }
    }
  }
  
  toggleExportMenu() { this.isExportMenuVisible.update(v => !v); }
  
  toggleProtectModal() {
    this.isProtectModalVisible.update(v => !v);
    this.passwordSetError.set(null);
    this.newPassword.set('');
    this.confirmPassword.set('');
  }
  
  setDocumentPassword() {
    if(this.newPassword() !== this.confirmPassword()){
      this.passwordSetError.set("Passwords do not match.");
      return;
    }
    if(this.newPassword().length < 4) {
      this.passwordSetError.set("Password must be at least 4 characters long.");
      return;
    }
    const currentDoc = this.document();
    if(currentDoc) {
      const updatedDoc = {...currentDoc, password: this.newPassword()};
      this.saveDocument(updatedDoc);
    }
    this.toggleProtectModal();
  }

  removeDocumentPassword() {
    const currentDoc = this.document();
    if(currentDoc) {
      const { password, ...rest } = currentDoc;
      const updatedDoc = rest as Document;
      this.saveDocument(updatedDoc);
    }
    this.toggleProtectModal();
  }

  toggleShareModal() {
    this.isShareModalVisible.update(v => !v);
    if(this.isShareModalVisible()) {
      this.generateShareLink();
    }
  }
  
  generateShareLink() {
    const doc = this.document();
    if (!doc) return;
    const singleContent = doc.content.join('<br><hr><br>');
    const shareData = { title: doc.title, content: singleContent };
    const jsonString = JSON.stringify(shareData);
    const base64Data = btoa(jsonString);
    const link = `${window.location.origin}${window.location.pathname}#/share/${base64Data}`;
    this.shareLink.set(link);
    this.copyButtonText.set('Copy');
  }

  copyShareLink() {
    navigator.clipboard.writeText(this.shareLink()).then(() => {
      this.copyButtonText.set('Copied!');
      setTimeout(() => this.copyButtonText.set('Copy'), 2000);
    });
  }

  exportAs(format: 'txt' | 'json' | 'docx' | 'pdf' | 'png') {
    // Implementation remains the same...
    this.isExportMenuVisible.set(false);
    const doc = this.document();
    const editor = this.editorRef()?.nativeElement;
    if (!doc || !editor) return;
    const title = doc.title.replace(/ /g, '_');
    switch (format) {
      case 'txt': this.downloadFile(title + '.txt', editor.innerText, 'text/plain'); break;
      case 'json':
        const jsonContent = JSON.stringify({ title: doc.title, content: doc.content, updatedAt: doc.updatedAt }, null, 2);
        this.downloadFile(title + '.json', jsonContent, 'application/json'); break;
      case 'png':
        html2canvas(editor, { backgroundColor: '#ffffff' }).then((canvas: any) => {
          this.downloadFile(title + '.png', canvas.toDataURL('image/png'), 'image/png', true);
        }); break;
      case 'pdf':
        const { jsPDF } = jspdf;
        const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
        pdf.html(editor, {
            callback: (doc: any) => { doc.save(title + '.pdf'); },
            margin: [40, 40, 40, 40], autoPaging: 'text', width: 515, windowWidth: 515
        }); break;
      case 'docx':
        const { Document, Packer, Paragraph, HeadingLevel } = docx;
        // FIX: Cast editor children to HTMLElement to correctly infer the type of `el` and access properties like `tagName` and `textContent`.
        const docxChildren = Array.from(editor.children as HTMLCollectionOf<HTMLElement>)
          .filter(el => el.tagName !== 'HR') // Filter out page break <hr> elements
          .map(el => {
            switch(el.tagName) {
                case 'H1': return new Paragraph({ text: el.textContent || '', heading: HeadingLevel.HEADING_1 });
                case 'H2': return new Paragraph({ text: el.textContent || '', heading: HeadingLevel.HEADING_2 });
                case 'H3': return new Paragraph({ text: el.textContent || '', heading: HeadingLevel.HEADING_3 });
                default: return new Paragraph({ text: el.textContent || '' });
            }
        });
        const file = new Document({ sections: [{ children: docxChildren }] });
        Packer.toBlob(file).then((blob: any) => { this.downloadFile(title + '.docx', URL.createObjectURL(blob), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, true); });
        break;
    }
  }
  
  private downloadFile(filename: string, content: string, mimeType: string, isUrl = false, shouldRevoke = false) {
      const a = document.createElement('a');
      a.download = filename;
      a.href = isUrl ? content : URL.createObjectURL(new Blob([content], { type: mimeType }));
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if(!isUrl || shouldRevoke) URL.revokeObjectURL(a.href);
  }
}