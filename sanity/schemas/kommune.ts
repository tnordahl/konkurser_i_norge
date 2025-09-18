export const kommune = {
  name: "kommune",
  title: "Kommune",
  type: "document",
  fields: [
    {
      name: "name",
      title: "Navn",
      type: "string",
      validation: (Rule: any) => Rule.required(),
    },
    {
      name: "kommuneNumber",
      title: "Kommunenummer",
      type: "string",
      validation: (Rule: any) => Rule.required(),
    },
    {
      name: "county",
      title: "Fylke",
      type: "string",
      validation: (Rule: any) => Rule.required(),
    },
  ],
};
