export const bankruptcy = {
  name: "bankruptcy",
  title: "Konkurs",
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
      name: "bankruptcyDate",
      title: "Konkursdato",
      type: "date",
      validation: (Rule: any) => Rule.required(),
    },
    {
      name: "kommune",
      title: "Kommune",
      type: "reference",
      to: [{ type: "kommune" }],
      validation: (Rule: any) => Rule.required(),
    },
    {
      name: "address",
      title: "Adresse",
      type: "string",
    },
    {
      name: "industry",
      title: "Bransje",
      type: "string",
    },
    {
      name: "previousAddresses",
      title: "Tidligere adresser",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            {
              name: "address",
              title: "Adresse",
              type: "string",
            },
            {
              name: "kommune",
              title: "Kommune",
              type: "reference",
              to: [{ type: "kommune" }],
            },
            {
              name: "fromDate",
              title: "Fra dato",
              type: "date",
            },
            {
              name: "toDate",
              title: "Til dato",
              type: "date",
            },
          ],
        },
      ],
    },
    {
      name: "hasRecentAddressChange",
      title: "Har nylig adresseendring",
      type: "boolean",
      description: "Har endret adresse ut av kommune innen siste år før konkurs",
    },
  ],
};
