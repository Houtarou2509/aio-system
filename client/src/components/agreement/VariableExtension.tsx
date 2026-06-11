import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewProps } from '@tiptap/react';

/**
 * Variable node attributes — matches the template placeholder system.
 */
export interface VariableNodeAttributes {
  name: string;
  label: string;
}

/**
 * All supported template variables with display labels.
 */
export const TEMPLATE_VARIABLES: { name: string; label: string }[] = [
  { name: 'date', label: 'Date' },
  { name: 'fullName', label: 'Full Name' },
  { name: 'personnelName', label: 'Personnel Name' },
  { name: 'designation', label: 'Designation' },
  { name: 'designationComma', label: 'Designation (comma)' },
  { name: 'institution', label: 'Institution' },
  { name: 'institutionText', label: 'Institution (suffix)' },
  { name: 'project', label: 'Project' },
  { name: 'projectText', label: 'Project (suffix)' },
  { name: 'assetName', label: 'Asset Name' },
  { name: 'serialNumber', label: 'Serial Number' },
  { name: 'propertyNumber', label: 'Property Number' },
  { name: 'condition', label: 'Condition' },
  { name: 'assetSection', label: 'Asset Section' },
  { name: 'assetTable', label: 'Asset Table' },
  { name: 'assetParagraph', label: 'Asset Paragraph' },
  { name: 'assetCount', label: 'Asset Count' },
];

/** React component rendered inline inside the editor for each variable pill. */
function VariableView({ node }: NodeViewProps) {
  const name = (node.attrs as VariableNodeAttributes).name || '';
  const label = (node.attrs as VariableNodeAttributes).label || name;
  return (
    <NodeViewWrapper as="span" draggable={false} style={{ display: 'inline' }}>
      <span
        contentEditable={false}
        className="inline-flex items-center rounded bg-[#012061]/10 text-[#012061] text-[11px] font-semibold px-1.5 py-0 mx-0.5 select-none border border-[#012061]/20"
        title={`{{${name}}}`}
      >
        {label}
      </span>
    </NodeViewWrapper>
  );
}

/**
 * Custom Tiptap inline node for template variables.
 * Stored as: { type: "variable", attrs: { name: "fullName", label: "Full Name" } }
 * Fallback text output: {{fullName}}
 */
export const VariableExtension = Node.create({
  name: 'variable',
  group: 'inline',
  inline: true,
  atom: true, // treated as a single unit — no editing inside

  addAttributes() {
    return {
      name: { default: '' },
      label: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-variable]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-variable': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VariableView);
  },

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { empty, from } = editor.state.selection;
        if (!empty) return false;
        const nodeBefore = editor.state.doc.resolve(from).nodeBefore;
        if (nodeBefore?.type.name === 'variable') {
          editor.chain().focus().deleteRange({ from: from - 1, to: from }).run();
          return true;
        }
        return false;
      },
    };
  },
});

/**
 * Convert Tiptap JSON content to a plain-text fallback string.
 * Variable nodes become {{name}} tokens; other nodes use their text content.
 */
export function tiptapJsonToPlainText(json: any): string {
  if (!json) return '';
  if (typeof json === 'string') return json;

  const parts: string[] = [];

  function walk(node: any) {
    if (!node) return;
    if (node.type === 'variable' && node.attrs?.name) {
      parts.push(`{{${node.attrs.name}}}`);
    } else if (node.type === 'text' && node.text != null) {
      parts.push(node.text);
    } else if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        walk(child);
      }
      // Add newline after block nodes (paragraphs, headings, etc.)
      if (node.type === 'paragraph' || node.type === 'heading') {
        parts.push('\n');
      } else if (node.type === 'bulletList' || node.type === 'orderedList') {
        // Lists already have newlines from list items
      } else if (node.type === 'listItem') {
        parts.push('\n');
      }
    }
  }

  if (json.content) {
    for (const child of json.content) {
      walk(child);
    }
  }

  // Clean up: collapse multiple newlines, trim
  return parts.join('').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Convert a plain-text template string with {{variable}} placeholders
 * into Tiptap JSON. Each line becomes a paragraph; {{variables}} become
 * variable nodes.
 */
export function plainTextToTiptapJson(text: string): any {
  if (!text) {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }

  const lines = text.split('\n');
  const paragraphs: any[] = [];

  for (const line of lines) {
    const content: any[] = [];
    // Split on {{variable}} patterns
    const parts = line.split(/(\{\{(\w+)\}\})/g);
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;

      if (part.startsWith('{{') && part.endsWith('}}')) {
        const key = parts[i + 1];
        if (key) {
          const variable = TEMPLATE_VARIABLES.find(v => v.name === key);
          content.push({
            type: 'variable',
            attrs: { name: key, label: variable?.label || key },
          });
          i++; // skip the key group
        } else {
          content.push({ type: 'text', text: part });
        }
      } else {
        // Check if this is the key group (part after {{token}})
        if (i > 0 && parts[i - 1]?.startsWith('{{')) {
          // This is the captured key name — already handled above
          continue;
        }
        if (part) {
          content.push({ type: 'text', text: part });
        }
      }
    }

    paragraphs.push({
      type: 'paragraph',
      content: content.length > 0 ? content : undefined,
    });
  }

  return { type: 'doc', content: paragraphs };
}