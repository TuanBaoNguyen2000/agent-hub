import { Fragment, type ReactNode } from 'react';

// Agents write the documents, so their Markdown is shown as React elements only: no HTML from the
// file ever reaches the page, and links are shown, not opened (ADR-021 item 8). Enough of
// CommonMark for documents: headings, paragraphs, lists with checkboxes, quotes, code, tables.

const INLINE = /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)|\*\*([^*]+)\*\*|(?<![\p{L}\p{N}])__([^_]+)__(?![\p{L}\p{N}])|\*([^*\s][^*]*?)\*|(?<![\p{L}\p{N}])_([^_\s][^_]*?)_(?![\p{L}\p{N}])|\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gu;

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    const [, , code, bold1, bold2, italic1, italic2, linkText, href] = match;
    if (code !== undefined) parts.push(<code key={key++}>{code.trim()}</code>);
    else if (bold1 ?? bold2) parts.push(<strong key={key++}>{inline((bold1 ?? bold2) as string)}</strong>);
    else if (italic1 ?? italic2) parts.push(<em key={key++}>{inline((italic1 ?? italic2) as string)}</em>);
    else if (linkText !== undefined)
      parts.push(
        <span key={key++} className="md-link" title={href}>
          {inline(linkText)}
        </span>,
      );
    last = index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'list'; ordered: boolean; items: { text: string; checked: boolean | null; depth: number }[] }
  | { kind: 'table'; header: string[]; rows: string[][] }
  | { kind: 'rule' };

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/;
const cells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, '|'));

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] as string;
    if (line.trim() === '') {
      index += 1;
      continue;
    }
    const fence = /^\s*(```|~~~)/.exec(line);
    if (fence) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] as string).trim().startsWith(fence[1] as string)) body.push(lines[index++] as string);
      index += 1;
      blocks.push({ kind: 'code', text: body.join('\n') });
      continue;
    }
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      blocks.push({ kind: 'heading', level: (heading[1] as string).length, text: heading[2] as string });
      index += 1;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ kind: 'rule' });
      index += 1;
      continue;
    }
    if (line.trim().startsWith('|') && /^\s*\|?\s*:?-{2,}/.test(lines[index + 1] ?? '')) {
      const header = cells(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && (lines[index] as string).trim().startsWith('|')) rows.push(cells(lines[index++] as string));
      blocks.push({ kind: 'table', header, rows });
      continue;
    }
    if (line.trim().startsWith('>')) {
      const quote: string[] = [];
      while (index < lines.length && (lines[index] as string).trim().startsWith('>')) quote.push((lines[index++] as string).trim().replace(/^>\s?/, ''));
      blocks.push({ kind: 'quote', lines: quote });
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      const ordered = /\d/.test(item[2] as string);
      const items: { text: string; checked: boolean | null; depth: number }[] = [];
      while (index < lines.length) {
        const current = LIST_ITEM.exec(lines[index] as string);
        if (current) {
          items.push({ text: current[4] as string, checked: current[3] === undefined ? null : current[3] !== ' ', depth: Math.floor((current[1] as string).length / 2) });
          index += 1;
        } else if ((lines[index] as string).trim() !== '' && /^\s+/.test(lines[index] as string) && items.length > 0) {
          const previous = items[items.length - 1] as { text: string };
          previous.text += ` ${(lines[index] as string).trim()}`;
          index += 1;
        } else break;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index] as string;
      if (current.trim() === '' || /^(#{1,6}\s|\s*(```|~~~)|\s*>)/.test(current) || LIST_ITEM.test(current) || current.trim().startsWith('|')) break;
      paragraph.push(current.trim());
      index += 1;
    }
    if (paragraph.length === 0) {
      paragraph.push(line.trim());
      index += 1;
    }
    blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
  }
  return blocks;
}

function renderBlock(block: Block, key: number): ReactNode {
  switch (block.kind) {
    case 'heading': {
      const Tag = `h${Math.min(block.level + 1, 6)}` as 'h2';
      return <Tag key={key}>{inline(block.text)}</Tag>;
    }
    case 'paragraph':
      return <p key={key}>{inline(block.text)}</p>;
    case 'code':
      return (
        <pre key={key}>
          <code>{block.text}</code>
        </pre>
      );
    case 'quote':
      return <blockquote key={key}>{inline(block.lines.join(' '))}</blockquote>;
    case 'rule':
      return <hr key={key} />;
    case 'table':
      return (
        <div key={key} className="md-table">
          <table>
            <thead>
              <tr>
                {block.header.map((cell, index) => (
                  <th key={index}>{inline(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, index) => (
                    <td key={index}>{inline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return (
        <Tag key={key}>
          {block.items.map((item, index) => (
            <li key={index} className={item.checked === null ? undefined : 'md-task'} style={item.depth > 0 ? { marginLeft: `${item.depth * 1.25}em` } : undefined}>
              {item.checked !== null && <input type="checkbox" checked={item.checked} readOnly tabIndex={-1} aria-hidden="true" />}
              {inline(item.text)}
            </li>
          ))}
        </Tag>
      );
    }
  }
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  return <div className={`markdown ${className ?? ''}`}>{parseMarkdown(source).map((block, index) => <Fragment key={index}>{renderBlock(block, index)}</Fragment>)}</div>;
}
