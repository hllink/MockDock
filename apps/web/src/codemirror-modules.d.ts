declare module "@codemirror/language" {
  export const bracketMatching: (...args: any[]) => any;
  export const defaultHighlightStyle: any;
  export const foldGutter: (...args: any[]) => any;
  export const foldKeymap: readonly any[];
  export const highlightSpecialChars: (...args: any[]) => any;
  export const indentOnInput: (...args: any[]) => any;
  export const syntaxHighlighting: (...args: any[]) => any;
}

declare module "@codemirror/search" {
  export const highlightSelectionMatches: (...args: any[]) => any;
  export const searchKeymap: readonly any[];
}

declare module "@codemirror/autocomplete" {
  export const autocompletion: (...args: any[]) => any;
  export const closeBrackets: (...args: any[]) => any;
  export const closeBracketsKeymap: readonly any[];
  export const completionKeymap: readonly any[];
}

declare module "@codemirror/lint" {
  export const lintKeymap: readonly any[];
}
