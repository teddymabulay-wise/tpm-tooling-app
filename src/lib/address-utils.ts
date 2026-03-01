export interface ParsedAddress {
  address: string;
  city: string;
  county: string;
  postCode: string;
  country: string;
}

export function parseAddress(raw: string): ParsedAddress {
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);

  if (parts.length === 0) {
    return { address: "", city: "", county: "", postCode: "", country: "" };
  }

  // Try to extract post code (last numeric-looking segment)
  let postCode = "";
  let country = "";
  let county = "";
  let city = "";
  let address = "";

  const lastPart = parts[parts.length - 1];
  const secondLast = parts.length > 1 ? parts[parts.length - 2] : "";

  // Check if last part is a post code (contains digits)
  if (/\d/.test(lastPart) && lastPart.length <= 10) {
    postCode = lastPart;
    country = parts.length > 2 ? parts[parts.length - 3] : "";
    county = parts.length > 3 ? parts[parts.length - 4] : "";
    city = parts.length > 4 ? parts[parts.length - 5] : parts[1] || "";
    address = parts[0] || "";
  } else if (/\d/.test(secondLast) && secondLast.length <= 10) {
    postCode = secondLast;
    country = lastPart;
    county = parts.length > 3 ? parts[parts.length - 3] : "";
    city = parts.length > 2 ? parts[1] : "";
    address = parts[0] || "";
  } else {
    // Best guess: last is country, work backwards
    country = lastPart;
    county = parts.length > 2 ? parts[parts.length - 2] : "";
    city = parts.length > 1 ? parts[1] : "";
    address = parts[0] || "";
  }

  return { address, city, county, postCode, country };
}
