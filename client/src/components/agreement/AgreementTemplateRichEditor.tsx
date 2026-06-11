import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import UnderlineExtension from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import {
  VariableExtension,
  TEMPLATE_VARIABLES,
  tiptapJsonToPlainText,
  plainTextToTiptapJson,
} from './VariableExtension';

interface AgreementTemplateRichEditorProps {
  /** Tiptap JSON content — used when available. */
  valueJson?: unknown | null;
  /** Plain text fallback — used when contentJson is absent. */
  fallbackText: string;
  /** Called when Tiptap JSON changes. */
  onChangeJson?: (json: unknown) => void;
  /** Called when the fallback plain text changes. */
  onChangeText?: (text: string) => void;
  /** Whether the editor is disabled. */
  disabled?: boolean;
  /** Minimum height in px. */
  minHeight?: number;
}

const FONT_SIZES = ['8px', '9px', '10px', '11px', '12px', '14px', '16px', '18px'];
const TEXT_COLORS = ['#111827', '#012061', '#475569', '#b91c1c', '#047857'];

const FontSizeExtension = Extension.create({
  name: 'fontSize',

  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: element => element.style.fontSize || null,
            renderHTML: attributes => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },
});

export default function AgreementTemplateRichEditor({
  valueJson,
  fallbackText,
  onChangeJson,
  onChangeText,
  disabled = false,
  minHeight = 300,
}: AgreementTemplateRichEditorProps) {
  // Determine initial content: prefer contentJson, fall back to plain text
  const initialContent = useMemo(() => {
    if (valueJson && typeof valueJson === 'object') {
      return valueJson as any;
    }
    return plainTextToTiptapJson(fallbackText || '');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Track whether the current update is from an external prop change
  const externalChangeRef = useRef(false);
  const lastJsonRef = useRef<string>(JSON.stringify(initialContent));

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      UnderlineExtension,
      TextStyle,
      Color,
      FontSizeExtension,
      VariableExtension,
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
    ],
    content: initialContent,
    editable: !disabled,
    onUpdate: ({ editor: ed }) => {
      if (externalChangeRef.current) {
        externalChangeRef.current = false;
        return;
      }
      const json = ed.getJSON();
      lastJsonRef.current = JSON.stringify(json);
      onChangeJson?.(json);
      const plain = tiptapJsonToPlainText(json);
      onChangeText?.(plain);
    },
    editorProps: {
      attributes: {
        class: 'tiptap-editor-content',
      },
    },
  });

  // When the external valueJson or fallbackText changes (e.g., template switch), re-initialize
  useEffect(() => {
    if (!editor) return;
    const incoming = valueJson && typeof valueJson === 'object'
      ? valueJson
      : plainTextToTiptapJson(fallbackText || '');
    const incomingStr = JSON.stringify(incoming);
    if (incomingStr !== lastJsonRef.current) {
      externalChangeRef.current = true;
      lastJsonRef.current = incomingStr;
      editor.commands.setContent(incoming as any);
    }
  }, [editor, valueJson, fallbackText]);

  // When disabled changes, update editor
  useEffect(() => {
    if (editor) editor.setEditable(!disabled);
  }, [editor, disabled]);

  // Insert variable at cursor
  const insertVariable = useCallback(
    (name: string, label: string) => {
      if (!editor) return;
      editor.chain().focus().insertContent({
        type: 'variable',
        attrs: { name, label },
      }).run();
    },
    [editor],
  );

  const setTextStyle = useCallback(
    (attrs: Record<string, string | null>) => {
      if (!editor) return;
      const current = editor.getAttributes('textStyle');
      editor.chain().focus().setMark('textStyle', { ...current, ...attrs }).run();
    },
    [editor],
  );

  const currentTextStyle = editor?.getAttributes('textStyle') ?? {};
  const currentFontSize = typeof currentTextStyle.fontSize === 'string' ? currentTextStyle.fontSize : '';
  const currentColor = typeof currentTextStyle.color === 'string' ? currentTextStyle.color : '#111827';

  if (!editor) return null;

  return (
    <div className="border border-slate-300 dark:border-slate-600 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="space-y-1.5 bg-slate-50 px-2 py-1.5 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-600">
        <div className="flex flex-wrap items-center gap-1">
          <ToolbarButton
            onClick={() => { editor.chain().focus().toggleBold().run(); }}
            active={editor.isActive('bold')}
            title="Bold"
          >
            <span className="font-bold text-xs">B</span>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => { editor.chain().focus().toggleItalic().run(); }}
            active={editor.isActive('italic')}
            title="Italic"
          >
            <span className="italic text-xs">I</span>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => { editor.chain().focus().toggleUnderline().run(); }}
            active={editor.isActive('underline')}
            title="Underline"
          >
            <span className="underline text-xs">U</span>
          </ToolbarButton>
          <select
            className="h-7 rounded border border-slate-300 bg-white px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
            value={currentFontSize}
            onChange={(e) => {
              const fontSize = e.target.value || null;
              setTextStyle({ fontSize });
            }}
            title="Font size"
          >
            <option value="">Font size</option>
            {FONT_SIZES.map(size => (
              <option key={size} value={size}>{size.replace('px', '')}</option>
            ))}
          </select>
          <div className="flex items-center gap-1 pl-1" title="Text color">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Color</span>
            {TEXT_COLORS.map(color => (
              <button
                key={color}
                type="button"
                onClick={() => setTextStyle({ color })}
                className={`h-6 w-6 rounded border transition-transform hover:scale-105 ${
                  currentColor.toLowerCase() === color.toLowerCase()
                    ? 'border-[#f8931f] ring-2 ring-[#f8931f]/30'
                    : 'border-slate-300 dark:border-slate-600'
                }`}
                style={{ backgroundColor: color }}
                aria-label={`Set text color ${color}`}
              />
            ))}
            <input
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(currentColor) ? currentColor : '#111827'}
              onChange={(e) => setTextStyle({ color: e.target.value })}
              className="h-6 w-7 cursor-pointer rounded border border-slate-300 bg-white p-0.5 dark:border-slate-600 dark:bg-slate-700"
              title="Custom text color"
            />
          </div>
          <ToolbarButton
            onClick={() => { editor.chain().focus().unsetMark('textStyle').run(); }}
            active={false}
            title="Clear font style"
          >
            <span className="text-xs">Clear</span>
          </ToolbarButton>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <ToolbarButton
            onClick={() => { editor.chain().focus().toggleBulletList().run(); }}
            active={editor.isActive('bulletList')}
            title="Bullet List"
          >
            <span className="text-xs">• List</span>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => { editor.chain().focus().toggleOrderedList().run(); }}
            active={editor.isActive('orderedList')}
            title="Ordered List"
          >
            <span className="text-xs">1. List</span>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => { editor.chain().focus().insertTable({ rows: 2, cols: 3, withHeaderRow: true }).run(); }}
            active={false}
            title="Insert Table"
          >
            <span className="text-xs">⊞ Table</span>
          </ToolbarButton>
          <select
            className="h-7 min-w-[220px] rounded border border-slate-300 bg-white px-2 text-[11px] font-medium text-[#012061] hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
            value=""
            onChange={(e) => {
              if (e.target.value) {
                const v = TEMPLATE_VARIABLES.find((t) => t.name === e.target.value);
                if (v) insertVariable(v.name, v.label);
                e.target.value = '';
              }
            }}
            title="Insert Variable"
          >
            <option value="">+ Variable</option>
            {TEMPLATE_VARIABLES.map((v) => {
              const display = `{{${v.name}}} - ${v.label}`;
              return <option key={v.name} value={v.name}>{display}</option>;
            })}
          </select>
        </div>
      </div>

      {/* Editor content */}
      <div
        className="p-3 bg-white dark:bg-slate-900 overflow-y-auto"
        style={{ minHeight, maxHeight: '60vh' }}
      >
        <EditorContent editor={editor} />
      </div>

      {/* Tiptap styles */}
      <style>{`
        .tiptap-editor-content:focus { outline: none; }
        .tiptap-editor-content p { margin: 0 0 0.4em 0; }
        .tiptap-editor-content ul, .tiptap-editor-content ol { margin: 0.3em 0; padding-left: 1.5em; }
        .tiptap-editor-content li { margin: 0.1em 0; }
        .tiptap-editor-content table { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
        .tiptap-editor-content td, .tiptap-editor-content th {
          border: 1px solid #cbd5e1; padding: 4px 8px; min-width: 60px; vertical-align: top;
        }
        .tiptap-editor-content th { background: #f1f5f9; font-weight: 600; font-size: 0.8em; }
      `}</style>
    </div>
  );
}

function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-1.5 py-1 rounded text-xs transition-colors ${
        active
          ? 'bg-[#012061] text-white'
          : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600'
      }`}
    >
      {children}
    </button>
  );
}
