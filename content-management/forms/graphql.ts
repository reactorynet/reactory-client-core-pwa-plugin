const ReactoryGetContentListQuery = `
  query ReactoryGetContentList {
    ReactoryGetContentList {
      id
      slug
      title
      format
      locale
      topics
      published
      version
      template
      engine
      helpTopic
      createdAt
      updatedAt
    }
  }
`;

export default {
  query: {
    name: 'ReactoryGetContentList',
    text: ReactoryGetContentListQuery,
    variables: {},
    resultType: 'array',
    resultMap: {
      '[].*': 'contentList',
    },
    edit: false,
    new: false,
  },
};
