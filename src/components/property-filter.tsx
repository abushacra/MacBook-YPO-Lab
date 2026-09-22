"use client";

import { useRouter } from "next/navigation";

/** Navigates as soon as the property changes, so filtering is a single tap. */
export function PropertyFilter({
  properties,
  value,
  basePath,
  extraParams = {},
}: {
  properties: { id: string; name: string }[];
  value: string;
  basePath: string;
  extraParams?: Record<string, string>;
}) {
  const router = useRouter();

  return (
    <select
      name="property"
      aria-label="Filter by property"
      className="input"
      value={value}
      onChange={(event) => {
        const params = new URLSearchParams(extraParams);
        if (event.target.value) params.set("property", event.target.value);
        const query = params.toString();
        router.push(query ? `${basePath}?${query}` : basePath);
      }}
    >
      <option value="">All properties</option>
      {properties.map((property) => (
        <option key={property.id} value={property.id}>
          {property.name}
        </option>
      ))}
    </select>
  );
}
