export const addressChange = {
  name: "addressChange",
  title: "Adresseendring",
  type: "document",
  fields: [
    {
      name: "companyName",
      title: "Firmanavn",
      type: "string",
      validation: (Rule: any) => Rule.required(),
    },
    {
      name: "organizationNumber",
      title: "Organisasjonsnummer",
      type: "string",
      validation: (Rule: any) => Rule.required(),
    },
    {
      name: "changeDate",
      title: "Endringsdato",
      type: "date",
      validation: (Rule: any) => Rule.required(),
    },
    {
      name: "fromKommune",
      title: "Fra kommune",
      type: "reference",
      to: [{ type: "kommune" }],
    },
    {
      name: "toKommune",
      title: "Til kommune",
      type: "reference",
      to: [{ type: "kommune" }],
      validation: (Rule: any) => Rule.required(),
    },
    {
      name: "fromAddress",
      title: "Fra adresse",
      type: "string",
    },
    {
      name: "toAddress",
      title: "Til adresse",
      type: "string",
      validation: (Rule: any) => Rule.required(),
    },
    {
      name: "industry",
      title: "Bransje",
      type: "string",
    },
  ],
};
