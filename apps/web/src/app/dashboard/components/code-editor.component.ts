import { ChangeDetectionStrategy, Component, effect, input, output, viewChild } from "@angular/core";
import type { AfterViewInit, ElementRef, OnDestroy } from "@angular/core";
import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting
} from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap
} from "@codemirror/autocomplete";
import { lintKeymap } from "@codemirror/lint";

type CodeEditorLanguage = "json" | "xml" | "plain";

const editorTheme = EditorView.theme({
  "&": {
    display: "grid",
    gridTemplateRows: "minmax(0, 1fr)",
    height: "100%",
    minHeight: "0",
    maxHeight: "100%",
    overflow: "hidden",
    border: "0",
    borderRadius: "0",
    color: "#e5eefc",
    backgroundColor: "#0f1117",
    boxShadow: "none"
  },
  ".cm-scroller": {
    height: "100%",
    minHeight: "0",
    maxHeight: "100%",
    overflow: "auto",
    overscrollBehavior: "contain",
    fontFamily: '"IBM Plex Mono", "SFMono-Regular", monospace',
    lineHeight: "1.5"
  },
  ".cm-sizer, .cm-content": {
    minHeight: "100%"
  },
  ".cm-content": {
    caretColor: "#7dd3fc"
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "#7dd3fc"
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "rgba(94, 173, 255, 0.22)"
  },
  ".cm-gutters": {
    minHeight: "100%",
    flexShrink: "0",
    backgroundColor: "#11131a",
    color: "#717c91",
    borderRight: "1px solid rgba(177, 129, 245, 0.12)"
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(119, 141, 255, 0.1)"
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(119, 141, 255, 0.1)",
    color: "#c7d2fe"
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "rgba(177, 129, 245, 0.14)",
    border: "none",
    color: "#d8c7f4"
  },
  ".cm-tooltip": {
    backgroundColor: "#171b24",
    border: "1px solid rgba(177, 129, 245, 0.18)"
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 0.7rem 0 0.9rem"
  },
  ".cm-scroller::-webkit-scrollbar": {
    width: "0.85rem",
    height: "0.85rem"
  },
  ".cm-scroller::-webkit-scrollbar-track": {
    background: "rgba(17, 19, 26, 0.82)"
  },
  ".cm-scroller::-webkit-scrollbar-thumb": {
    border: "0.18rem solid rgba(17, 19, 26, 0.82)",
    borderRadius: "999px",
    background: "rgba(119, 141, 255, 0.46)"
  }
}, { dark: true });

@Component({
  selector: "app-code-editor",
  standalone: true,
  template: `<div #host class="code-editor-host"></div>`,
  styles: [
    `
      :host {
        display: grid;
        min-height: 0;
        height: 100%;
        max-height: 100%;
        overflow: hidden;
      }

      .code-editor-host {
        display: grid;
        min-height: 0;
        height: 100%;
        max-height: 100%;
        overflow: hidden;
      }

      .cm-editor {
        display: grid;
        grid-template-rows: minmax(0, 1fr);
        height: 100%;
        min-height: 0;
        max-height: 100%;
        overflow: hidden;
        border: 1px solid rgba(177, 129, 245, 0.22);
        border-radius: 1rem;
        background: #0f0f14;
        box-shadow:
          inset 0 0 0 1px rgba(255, 255, 255, 0.02),
          0 14px 34px rgba(3, 3, 8, 0.24);
      }

      .cm-scroller {
        height: 100%;
        min-height: 0;
        max-height: 100%;
        font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
        line-height: 1.5;
        overflow: auto !important;
        overscroll-behavior: contain;
      }

      .cm-sizer,
      .cm-content {
        min-height: 100%;
      }

      .cm-gutters {
        min-height: 100%;
        flex-shrink: 0;
      }

      .cm-gutters {
        background: #11131a;
        border-right: 1px solid rgba(177, 129, 245, 0.12);
        color: #717c91;
      }

      .cm-activeLine,
      .cm-activeLineGutter {
        background: rgba(119, 141, 255, 0.1);
      }

      .cm-focused {
        outline: 1px solid rgba(94, 173, 255, 0.5);
        outline-offset: -1px;
      }

      .cm-lineNumbers .cm-gutterElement {
        padding: 0 0.7rem 0 0.9rem;
      }

      .cm-selectionBackground {
        background: rgba(94, 173, 255, 0.22);
      }

      .cm-cursor {
        border-left-color: #7dd3fc;
      }

      .cm-scroller::-webkit-scrollbar {
        width: 0.85rem;
        height: 0.85rem;
      }

      .cm-scroller::-webkit-scrollbar-track {
        background: rgba(17, 19, 26, 0.82);
      }

      .cm-scroller::-webkit-scrollbar-thumb {
        border: 0.18rem solid rgba(17, 19, 26, 0.82);
        border-radius: 999px;
        background: rgba(119, 141, 255, 0.46);
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CodeEditorComponent implements AfterViewInit, OnDestroy {
  readonly value = input("");
  readonly language = input<CodeEditorLanguage>("plain");
  readonly resetToken = input("");
  readonly valueChange = output<string>();
  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>("host");

  private readonly languageCompartment = new Compartment();
  private view: EditorView | null = null;
  private suppressChange = false;
  private lastResetToken = "";

  constructor() {
    effect(() => {
      const nextLanguage = this.language();
      if (!this.view) {
        return;
      }

      this.view.dispatch({
        effects: this.languageCompartment.reconfigure(this.getLanguageExtension(nextLanguage))
      });
    });

    effect(() => {
      const nextValue = this.value();
      if (!this.view) {
        return;
      }

      if (nextValue === this.view.state.doc.toString()) {
        return;
      }

      this.suppressChange = true;
      this.view.dispatch({
        changes: {
          from: 0,
          to: this.view.state.doc.length,
          insert: nextValue
        }
      });
      this.view.dispatch({
        selection: { anchor: 0 },
        scrollIntoView: true
      });
      this.view.scrollDOM.scrollTop = 0;
      this.view.scrollDOM.scrollLeft = 0;
      this.suppressChange = false;
    });

    effect(() => {
      const nextResetToken = this.resetToken();
      if (!this.view) {
        return;
      }

      if (!nextResetToken || nextResetToken === this.lastResetToken) {
        return;
      }

      this.lastResetToken = nextResetToken;
      this.view.dispatch({
        selection: { anchor: 0 },
        scrollIntoView: true
      });
      this.view.scrollDOM.scrollTop = 0;
      this.view.scrollDOM.scrollLeft = 0;
    });
  }

  ngAfterViewInit(): void {
    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      dropCursor(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      rectangularSelection(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      keymap.of([
        indentWithTab,
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        ...searchKeymap,
        ...lintKeymap
      ]),
      editorTheme,
      EditorView.updateListener.of((update) => {
        if (!update.docChanged || this.suppressChange) {
          return;
        }

        this.valueChange.emit(update.state.doc.toString());
      }),
      this.languageCompartment.of(this.getLanguageExtension(this.language()))
    ];

    this.view = new EditorView({
      state: EditorState.create({
        doc: this.value(),
        extensions
      }),
      parent: this.host().nativeElement
    });
    this.lastResetToken = this.resetToken();
  }

  ngOnDestroy(): void {
    this.view?.destroy();
  }

  private getLanguageExtension(language: CodeEditorLanguage) {
    switch (language) {
      case "json":
        return json();
      case "xml":
        return xml();
      case "plain":
      default:
        return [];
    }
  }
}
