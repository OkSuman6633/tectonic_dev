import { Document, Packer, Paragraph, TextRun, HeadingLevel, BorderStyle, Header, Footer, PageNumber, AlignmentType, ShadingType } from 'docx';
import { saveAs } from 'file-saver';

const COLORS = {
  primary: '6366F1', secondary: '8B5CF6', success: '10B981',
  dark: '1E293B', gray: '64748B', lightGray: '94A3B8', background: 'F8FAFC',
};

function parseInlineMarkdown(line, baseSize = 22) {
  // Parse inline **bold** and *italic* formatting
  const runs = [];
  const regex = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|([^*`]+))/g;
  let match;
  while ((match = regex.exec(line)) !== null) {
    if (match[2]) { // **bold**
      runs.push(new TextRun({ text: match[2], bold: true, size: baseSize, color: COLORS.dark }));
    } else if (match[3]) { // *italic*
      runs.push(new TextRun({ text: match[3], italics: true, size: baseSize, color: COLORS.gray }));
    } else if (match[4]) { // `code`
      runs.push(new TextRun({ text: match[4], font: 'Consolas', size: baseSize - 2, color: '059669', shading: { type: ShadingType.SOLID, color: 'F0FDF4' } }));
    } else if (match[5]) { // plain text
      runs.push(new TextRun({ text: match[5], size: baseSize, color: COLORS.dark }));
    }
  }
  return runs.length > 0 ? runs : [new TextRun({ text: line, size: baseSize, color: COLORS.dark })];
}

function parseMarkdownContent(text) {
  if (!text) return [new TextRun({ text: 'No content available.', color: COLORS.lightGray, italics: true })];
  const lines = text.split('\n');
  const runs = [];
  lines.forEach((line, i) => {
    if (line.startsWith('#### ')) {
      runs.push(new TextRun({ text: line.replace('#### ', ''), bold: true, size: 22, color: COLORS.secondary }));
    } else if (line.startsWith('### ')) {
      runs.push(new TextRun({ text: line.replace('### ', ''), bold: true, size: 24, color: COLORS.dark }));
    } else if (line.startsWith('## ')) {
      runs.push(new TextRun({ text: line.replace('## ', ''), bold: true, size: 28, color: COLORS.primary }));
    } else if (line.startsWith('# ')) {
      runs.push(new TextRun({ text: line.replace('# ', ''), bold: true, size: 32, color: COLORS.primary }));
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      runs.push(new TextRun({ text: '  • ', size: 22, color: COLORS.primary }));
      runs.push(...parseInlineMarkdown(line.substring(2)));
    } else if (line.match(/^\d+\./)) {
      const num = line.match(/^(\d+\.)/)[1];
      runs.push(new TextRun({ text: '  ' + num + ' ', size: 22, color: COLORS.primary }));
      runs.push(...parseInlineMarkdown(line.substring(num.length + 1)));
    } else if (line.startsWith('>')) {
      runs.push(new TextRun({ text: '│ ' + line.substring(1).trim(), italics: true, size: 22, color: COLORS.gray }));
    } else if (line.trim() === '') {
      runs.push(new TextRun({ text: '', break: 1 }));
    } else if (line.trim() === '---' || line.trim() === '***') {
      runs.push(new TextRun({ text: '─'.repeat(50), size: 16, color: COLORS.lightGray }));
    } else {
      runs.push(...parseInlineMarkdown(line));
    }
    if (i < lines.length - 1 && line.trim() !== '') runs.push(new TextRun({ break: 1 }));
  });
  return runs;
}

function createDivider() {
  return new Paragraph({ children: [new TextRun({ text: '─'.repeat(80), color: COLORS.lightGray, size: 16 })], spacing: { before: 200, after: 200 }, alignment: AlignmentType.CENTER });
}

function createSectionHeader(text, color = COLORS.primary) {
  return new Paragraph({ children: [new TextRun({ text: '▌ ', color, size: 28 }), new TextRun({ text: text.toUpperCase(), bold: true, size: 28, color })], spacing: { before: 400, after: 200 } });
}

export async function downloadFinalReport(missionId, objective, finalOutput) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const sections = [{
    headers: { default: new Header({ children: [new Paragraph({ children: [new TextRun({ text: 'AGENTS OFFICE', bold: true, size: 18, color: COLORS.primary }), new TextRun({ text: '  |  Mission Report', size: 18, color: COLORS.gray })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Page ', size: 16, color: COLORS.lightGray }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: COLORS.gray })] })] }) },
    children: [
      new Paragraph({ spacing: { after: 600 } }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '✦', size: 48, color: COLORS.primary })] }),
      new Paragraph({ spacing: { after: 200 } }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'MISSION COMPLETE', size: 64, bold: true, color: COLORS.primary })] }),
      new Paragraph({ spacing: { after: 200 } }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: dateStr, size: 24, color: COLORS.gray })] }),
      new Paragraph({ spacing: { after: 400 } }),
      new Paragraph({ alignment: AlignmentType.CENTER, shading: { type: ShadingType.SOLID, color: COLORS.background }, children: [new TextRun({ text: 'OBJECTIVE: ', bold: true, size: 20, color: COLORS.gray }), new TextRun({ text: objective || 'Mission', size: 20, color: COLORS.dark })] }),
      new Paragraph({ pageBreakBefore: true }),
      createSectionHeader('Final Result', COLORS.success),
      new Paragraph({ children: parseMarkdownContent(finalOutput.output), spacing: { after: 400 } }),
      createDivider(),
      createSectionHeader('Task Outputs', COLORS.secondary),
      ...finalOutput.allOutputs.flatMap((task, i) => [
        new Paragraph({ shading: { type: ShadingType.SOLID, color: COLORS.background }, children: [new TextRun({ text: `${i + 1}. ${task.name}`, bold: true, size: 24, color: COLORS.dark })], spacing: { before: 300, after: 150 }, border: { left: { style: BorderStyle.SINGLE, size: 24, color: COLORS.primary } } }),
        new Paragraph({ children: parseMarkdownContent(task.output), spacing: { after: 300 } }),
      ]),
      createDivider(),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Generated by Agents Office', size: 18, color: COLORS.lightGray })] }),
    ],
  }];

  const doc = new Document({ creator: 'Agents Office', title: `Mission Report`, styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } }, sections });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `Mission_Report_${now.toISOString().split('T')[0]}.docx`);
}

export async function exportMissionReport(missionId) {
  const res = await fetch(`/api/v1/missions/${missionId}/report`);
  if (!res.ok) throw new Error('Failed to fetch report');
  const report = await res.json();
  const finalOutput = { output: report.summary || '', allOutputs: (report.tasks || []).map(t => ({ name: t.name, output: t.output || '' })) };
  await downloadFinalReport(missionId, report.mission?.objective, finalOutput);
}
