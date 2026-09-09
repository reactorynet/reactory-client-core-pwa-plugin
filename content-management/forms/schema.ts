import Reactory from '@reactorynet/reactory-core';

export const ContentSchema: Reactory.Schema.ISchema = {
  type: 'object',
  title: 'Content Item',
  properties: {
    id: { type: 'string', title: 'ID' },
    slug: { type: 'string', title: 'Slug' },
    title: { type: 'string', title: 'Title' },
    description: { type: 'string', title: 'Description' },
    format: { type: 'string', title: 'Format' },
    locale: { type: 'string', title: 'Locale' },
    published: { type: 'boolean', title: 'Published' },
    version: { type: 'string', title: 'Version' },
    updatedAt: { type: 'string', title: 'Updated' },
    createdAt: { type: 'string', title: 'Created' },
    topics: {
      type: 'array',
      title: 'Topics',
      items: { type: 'string' },
    },
  },
};

export const schema: Reactory.Schema.ISchema = {
  type: 'object',
  properties: {
    contentList: {
      type: 'array',
      title: 'Content Items',
      items: ContentSchema,
    },
  },
};

export default schema;
