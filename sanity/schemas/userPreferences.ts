export const userPreferences = {
  name: "userPreferences",
  title: "Brukerinnstillinger",
  type: "document",
  fields: [
    {
      name: "userId",
      title: "Bruker ID",
      type: "string",
      validation: (Rule: any) => Rule.required(),
    },
    {
      name: "email",
      title: "E-postadresse",
      type: "string",
      validation: (Rule: any) => Rule.required().email(),
    },
    {
      name: "followedKommuner",
      title: "Fulgte kommuner",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            {
              name: "kommune",
              title: "Kommune",
              type: "reference",
              to: [{ type: "kommune" }],
              validation: (Rule: any) => Rule.required(),
            },
            {
              name: "emailNotifications",
              title: "E-postvarsler",
              type: "boolean",
              initialValue: true,
            },
            {
              name: "pushNotifications",
              title: "Push-varsler",
              type: "boolean",
              initialValue: true,
            },
            {
              name: "smsNotifications",
              title: "SMS-varsler",
              type: "boolean",
              initialValue: false,
            },
            {
              name: "dateAdded",
              title: "Dato lagt til",
              type: "datetime",
              validation: (Rule: any) => Rule.required(),
            },
          ],
        },
      ],
    },
    {
      name: "notificationFrequency",
      title: "Varslingsfrekvens",
      type: "string",
      options: {
        list: [
          { title: "Umiddelbart", value: "immediate" },
          { title: "Daglig sammendrag", value: "daily" },
          { title: "Ukentlig sammendrag", value: "weekly" },
        ],
      },
      initialValue: "immediate",
    },
    {
      name: "phoneNumber",
      title: "Telefonnummer",
      type: "string",
      description: "For SMS-varsler",
    },
  ],
};
