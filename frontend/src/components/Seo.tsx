import { useEffect } from "react";

const siteUrl = "https://clcarhub.com";

type SeoProps = {
  title: string;
  description: string;
  path?: string;
  noindex?: boolean;
  structuredData?: Record<string, unknown>;
};

function setMeta(name: string, content: string, attribute = "name") {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${name}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, name);
    document.head.appendChild(element);
  }
  element.content = content;
}

export default function Seo({ title, description, path = window.location.pathname, noindex = false, structuredData }: SeoProps) {
  useEffect(() => {
    const canonicalUrl = `${siteUrl}${path === "/" ? "/" : path.replace(/\/+$/, "")}`;
    document.title = title;
    setMeta("description", description);
    setMeta("robots", noindex ? "noindex, nofollow" : "index, follow");
    setMeta("og:title", title, "property");
    setMeta("og:description", description, "property");
    setMeta("og:type", "website", "property");
    setMeta("og:url", canonicalUrl, "property");
    setMeta("og:image", `${siteUrl}/clcarhublogo_upscaled.png`, "property");
    setMeta("twitter:card", "summary", "name");
    setMeta("twitter:title", title, "name");
    setMeta("twitter:description", description, "name");

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    const existingStructuredData = document.head.querySelector<HTMLScriptElement>('script[data-seo-structured-data="true"]');
    existingStructuredData?.remove();
    if (structuredData) {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.dataset.seoStructuredData = "true";
      script.textContent = JSON.stringify(structuredData);
      document.head.appendChild(script);
    }
  }, [description, noindex, path, structuredData, title]);

  return null;
}

export { siteUrl };
