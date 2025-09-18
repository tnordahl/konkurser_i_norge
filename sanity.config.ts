import { defineConfig } from "sanity";
import { deskTool } from "sanity/desk";
import { visionTool } from "@sanity/vision";
import { schemaTypes } from "./sanity/schema";

export default defineConfig({
  name: "default",
  title: "Konkurser i Norge",

  projectId: process.env.SANITY_PROJECT_ID || "placeholder-project-id",
  dataset: process.env.SANITY_DATASET || "production",

  plugins: [deskTool(), visionTool()],

  schema: {
    types: schemaTypes,
  },
});
