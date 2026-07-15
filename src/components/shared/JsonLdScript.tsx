
interface JsonLdScriptProps {
  data: Record<string, unknown>;
  idSuffix?: string; // To make ID more unique if multiple on page
}

/**
 * Renders a JSON-LD structured data script tag.
 * Must be a Server Component (no "use client") so Google's crawler
 * sees the schema in the initial server-rendered HTML.
 */
const JsonLdScript: React.FC<JsonLdScriptProps> = ({ data, idSuffix }) => {
  const scriptId = idSuffix ? `json-ld-${idSuffix}` : 'json-ld-script';

  return (
    <script
      id={scriptId}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
};

export default JsonLdScript;
