"use client";

import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { Compartment, EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";

import type { SupportedLanguage } from "@/lib/codeRunner";

const languageExtension = (language: SupportedLanguage) =>
  language === "python" ? python() : language === "cpp" ? cpp() : language === "java" ? java() : javascript();

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "13.5px", backgroundColor: "var(--color-surface)", color: "var(--color-text)" },
  ".cm-scroller": { fontFamily: "var(--font-geist-mono), ui-monospace, monospace", lineHeight: "1.6" },
  ".cm-gutters": { backgroundColor: "var(--color-surface-muted)", color: "var(--color-text-muted)", border: "none", borderRight: "1px solid var(--color-border)" },
  ".cm-activeLine": { backgroundColor: "rgb(225 217 188 / 0.25)" },
  ".cm-activeLineGutter": { backgroundColor: "rgb(225 217 188 / 0.45)" },
  "&.cm-focused": { outline: "2px solid var(--color-primary)", outlineOffset: "-2px" },
  ".cm-cursor": { borderLeftColor: "var(--color-primary)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": { backgroundColor: "rgb(172 186 196 / 0.45) !important" },
});

type CodeEditorProps = {
  language: SupportedLanguage;
  value: string;
  onChange: (code: string) => void;
  label: string;
  className?: string;
};

/**
 * CodeMirror 6 editor with syntax highlighting for the four supported
 * languages. Tab is not captured, so keyboard users can move focus out.
 */
export function CodeEditor({ language, value, onChange, label, className }: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const languageConf = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          theme,
          languageConf.current.of(languageExtension(language)),
          EditorView.contentAttributes.of({ "aria-label": label }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The editor is created once; language and external value changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: languageConf.current.reconfigure(languageExtension(language)) });
  }, [language]);

  useEffect(() => {
    const view = viewRef.current;
    if (view && view.state.doc.toString() !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
  }, [value]);

  return <div ref={hostRef} className={className} />;
}
