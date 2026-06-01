import React, { useState } from 'react';

interface CodeEditorProps {
  language: string;
  code: string;
  onChange: (code: string) => void;
  onRun: () => void;
  isRunning: boolean;
}

export function CodeEditor({ language, code, onChange, onRun, isRunning }: CodeEditorProps) {
  return (
    <div className="flex flex-col h-full gap-4">
      {/* Language selector and run button */}
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-foreground/70">Language: {language}</label>
        </div>
        <button
          onClick={onRun}
          disabled={isRunning}
          className="inline-flex h-9 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isRunning ? 'Running...' : 'Run Code'}
        </button>
      </div>

      {/* Code editor area */}
      <div className="flex-1 rounded-lg border border-foreground/10 bg-foreground/[0.02] overflow-hidden">
        <textarea
          value={code}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-full p-4 bg-transparent text-foreground font-mono text-sm resize-none border-0 focus:outline-none"
          placeholder={`Write your ${language} code here...`}
          spellCheck="false"
        />
      </div>
    </div>
  );
}
