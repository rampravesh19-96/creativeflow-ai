import Markdown from "react-markdown";

const decodeEntities = (value: string) =>
  value
    .replaceAll("&#x20;", " ")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");

export function GeneratedContent({ content }: { content: string }) {
  return (
    <div className="generated-content">
      <Markdown>{decodeEntities(content)}</Markdown>
    </div>
  );
}

export { decodeEntities };
