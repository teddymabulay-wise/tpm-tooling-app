// Materiality classification engine
// Classifies suppliers into Material, Non-Material, or Standard based on tag combinations

export type MaterialityClassification = "Material" | "Non-Material" | "Standard" | "Unclassified";

interface TagRule {
  tags: string[];
}

// Each rule set is an array of OR conditions. Each condition requires ALL tags to be present.
const materialRules: TagRule[] = [
  { tags: ["Materiality Impact = High", "CIF = TRUE", "Third Party Supplier = TRUE", "Materiality Substitutability = Difficult"] },
  { tags: ["Materiality Impact = High", "CIF = TRUE", "Third Party Supplier = TRUE", "Materiality Substitutability = Impossible"] },
  { tags: ["Materiality Impact = High", "Materiality Substitutability = Difficult", "Banking Supplier", "BSP - Market Tier 1"] },
  { tags: ["Materiality Impact = High", "Materiality Substitutability = Impossible", "Banking Supplier", "BSP - Market Tier 1"] },
  { tags: ["Materiality Impact = High", "Materiality Substitutability = Impossible", "Banking Supplier", "BSP - Market Tier 2"] },
];

const nonMaterialRules: TagRule[] = [
  // CIF-based
  { tags: ["Materiality Impact = Low", "Materiality Substitutability = Easy", "CIF = TRUE", "Third Party Supplier = TRUE"] },
  { tags: ["Materiality Impact = Low", "Materiality Substitutability = Difficult", "CIF = TRUE", "Third Party Supplier = TRUE"] },
  { tags: ["Materiality Impact = Low", "Materiality Substitutability = Impossible", "CIF = TRUE", "Third Party Supplier = TRUE"] },
  { tags: ["Materiality Impact = High", "Materiality Substitutability = Easy", "CIF = TRUE", "Third Party Supplier = TRUE"] },
  { tags: ["Materiality Impact = High", "Materiality Substitutability = Instant Replacement", "CIF = TRUE", "Third Party Supplier = TRUE"] },
  // Supportive-based
  { tags: ["Materiality Impact = High", "Materiality Substitutability = Impossible", "SUPPORTIVE = TRUE", "Third Party Supplier = TRUE"] },
  { tags: ["Materiality Impact = High", "Materiality Substitutability = Difficult", "SUPPORTIVE = TRUE", "Third Party Supplier = TRUE"] },
  // Banking - various combinations
  { tags: ["Materiality Impact = High", "Materiality Substitutability = Impossible", "Banking Supplier"] },
  { tags: ["Materiality Impact = High", "Materiality Substitutability = Difficult", "Banking Supplier", "BSP - Market Tier 2"] },
  { tags: ["Materiality Impact = High", "Materiality Substitutability = Difficult", "Banking Supplier", "BSP - Market Tier 3"] },
  { tags: ["Materiality Impact = High", "Materiality Substitutability = Instant Replacement", "Banking Supplier", "BSP - Market Tier 1"] },
  { tags: ["Materiality Impact = High", "Materiality Substitutability = Instant Replacement", "Banking Supplier", "BSP - Market Tier 2"] },
  { tags: ["Materiality Impact = High", "Materiality Substitutability = Instant Replacement", "Banking Supplier", "BSP - Market Tier 3"] },
  { tags: ["Materiality Impact = Low", "Materiality Substitutability = Easy", "Banking Supplier", "BSP - Market Tier 1"] },
  { tags: ["Materiality Impact = Low", "Materiality Substitutability = Easy", "Banking Supplier", "BSP - Market Tier 2"] },
  { tags: ["Materiality Impact = Low", "Materiality Substitutability = Easy", "Banking Supplier", "BSP - Market Tier 3"] },
  { tags: ["Materiality Impact = High", "Materiality Substitutability = Easy", "Banking Supplier", "BSP - Market Tier 1"] },
  { tags: ["Materiality Impact = High", "Materiality Substitutability = Easy", "Banking Supplier", "BSP - Market Tier 2"] },
  { tags: ["Materiality Impact = High", "Materiality Substitutability = Easy", "Banking Supplier", "BSP - Market Tier 3"] },
  { tags: ["Materiality Impact = Low", "Materiality Substitutability = Difficult", "Banking Supplier", "BSP - Market Tier 1"] },
  { tags: ["Materiality Impact = Low", "Materiality Substitutability = Difficult", "Banking Supplier", "BSP - Market Tier 2"] },
  { tags: ["Materiality Impact = Low", "Materiality Substitutability = Difficult", "Banking Supplier", "BSP - Market Tier 3"] },
  { tags: ["Materiality Impact = Low", "Materiality Substitutability = Impossible", "Banking Supplier", "BSP - Market Tier 1"] },
  { tags: ["Materiality Impact = Low", "Materiality Substitutability = Impossible", "Banking Supplier", "BSP - Market Tier 2"] },
  { tags: ["Materiality Impact = Low", "Materiality Substitutability = Impossible", "Banking Supplier", "BSP - Market Tier 3"] },
  { tags: ["Materiality Impact = Low", "Materiality Substitutability = Instant Replacement", "Banking Supplier", "BSP - Market Tier 1"] },
  { tags: ["Materiality Impact = Low", "Materiality Substitutability = Instant Replacement", "Banking Supplier", "BSP - Market Tier 2"] },
  { tags: ["Materiality Impact = High", "Materiality Substitutability = Impossible", "Banking Supplier", "BSP - Market Tier 3"] },
  { tags: ["Materiality Impact = High", "Materiality Substitutability = Difficult", "Banking Supplier", "BSP - Market Tier 2"] },
  { tags: ["Materiality Impact = High", "Materiality Substitutability = Difficult", "Banking Supplier", "BSP - Market Tier 3"] },
];

const standardRules: TagRule[] = [
  { tags: ["Materiality Impact = Low", "Materiality Substitutability = Instant Replacement", "Banking Supplier", "BSP - Market Tier 3"] },
  { tags: ["Materiality Impact = Low", "Materiality Substitutability = Instant Replacement", "Third Party Supplier = TRUE", "CIF = TRUE"] },
  { tags: ["Materiality Impact = Low", "Third Party Supplier = TRUE", "SUPPORTIVE = TRUE"] },
  { tags: ["Materiality Impact = High", "Materiality Substitutability = Instant Replacement", "Third Party Supplier = TRUE", "SUPPORTIVE = TRUE"] },
  { tags: ["Materiality Impact = High", "Materiality Substitutability = Easy", "Third Party Supplier = TRUE", "SUPPORTIVE = TRUE"] },
];

function matchesAnyRule(supplierTags: string[], rules: TagRule[]): boolean {
  return rules.some(rule =>
    rule.tags.every(requiredTag => supplierTags.includes(requiredTag))
  );
}

/**
 * Classify a supplier based on its tags.
 * Priority: Material > Non-Material > Standard > Unclassified
 */
export function classifySupplier(supplierTags: string[]): MaterialityClassification {
  if (matchesAnyRule(supplierTags, materialRules)) return "Material";
  if (matchesAnyRule(supplierTags, nonMaterialRules)) return "Non-Material";
  if (matchesAnyRule(supplierTags, standardRules)) return "Standard";
  return "Unclassified";
}

/**
 * Check if the supplier's declared materialityLevel matches the computed classification.
 * Returns true if there's a mismatch (i.e., the supplier should be highlighted).
 */
export function hasMaterialityMismatch(
  declaredLevel: string,
  computedLevel: MaterialityClassification
): boolean {
  if (computedLevel === "Unclassified") return false;
  const normalizedDeclared = declaredLevel.toLowerCase().replace(/[\s-]/g, "");
  const normalizedComputed = computedLevel.toLowerCase().replace(/[\s-]/g, "");
  return normalizedDeclared !== normalizedComputed;
}

/** All materiality filter options for the upper-level filter */
export const materialityLevels: MaterialityClassification[] = [
  "Material",
  "Non-Material",
  "Standard",
  "Unclassified",
];
