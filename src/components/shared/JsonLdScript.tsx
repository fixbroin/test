
"use client";

import Script from 'next/script';
import { useId } from 'react';

interface JsonLdScriptProps {
  data: Record<string, unknown>;
  idSuffix?: string; // To make ID more unique if multiple on page
}

const JsonLdScript: React.FC<JsonLdScriptProps> = ({ data, idSuffix }) => {
  const reactId = useId();
  const baseId = idSuffix ? `json-ld-${idSuffix}` : 'json-ld-script';
  const scriptId = `${baseId}-${reactId.replace(/:/g, '')}`;

  return (
    <Script
      id={scriptId}
      type="application/ld+json"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
};

export default JsonLdScript;
