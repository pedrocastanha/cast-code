export interface ParsedMarkdown<T> {
  frontmatter: T;
  content: string;
}
