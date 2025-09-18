import { createClient } from "next-sanity";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || "production";
const apiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2024-01-01";
const token = process.env.SANITY_API_TOKEN;

// Validate required environment variables
if (!projectId) {
  console.warn(
    "⚠️  NEXT_PUBLIC_SANITY_PROJECT_ID is not set. Sanity client will not work properly."
  );
}

// Create client with fallback configuration
export const client = createClient({
  projectId: projectId || "dummy-project-id", // Fallback to prevent initialization errors
  dataset,
  apiVersion,
  token,
  useCdn: false, // Set to true in production for better performance
});

// Export a helper function to check if Sanity is properly configured
export const isSanityConfigured = () => {
  return !!(projectId && dataset);
};
