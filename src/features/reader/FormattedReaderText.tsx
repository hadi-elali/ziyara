import { EnrichedMarkdownText } from 'react-native-enriched-markdown';

import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function FormattedReaderText({ text, arabic = false, italic = false, heading = false, fontSize = 16, lineHeight = 24 }: {
  text: string; arabic?: boolean; italic?: boolean; heading?: boolean; fontSize?: number; lineHeight?: number;
}) {
  const theme = useTheme();
  const blockStyle = {
    color: italic ? theme.textSecondary : theme.text, fontSize, lineHeight,
    fontFamily: arabic ? Fonts.serif : undefined,
    textAlign: arabic ? 'right' as const : 'left' as const,
    fontWeight: heading ? '700' : '400', marginTop: 0, marginBottom: 0,
  };
  // Existing transliterations use backticks as pronunciation characters.
  // Preserve those characters instead of letting Markdown create code spans.
  const markdown = italic ? `*${text.replace(/`/g, '\\`')}*` : text;
  return <EnrichedMarkdownText markdown={markdown}
    writingDirection={arabic ? 'rtl' : 'ltr'}
    md4cFlags={{ hardSoftBreaks: true, preserveBlankLines: true, latexMath: false, highlight: true }}
    markdownStyle={{ paragraph: blockStyle, h1: blockStyle, h2: blockStyle, h3: blockStyle,
      h4: blockStyle, h5: blockStyle, h6: blockStyle, strong: { color: theme.text },
      blockquote: { ...blockStyle, borderColor: theme.accent, backgroundColor: theme.accentSoft } }}
  />;
}
