const ReactoryGetContentListQuery = `
  query ReactoryGetContentList($search: Any, $paging: PagingRequest) {
    ReactoryGetContentList(search: $search, paging: $paging) {
      paging {
        page
        pageSize
        total
        hasNext
      }
      data {
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
  }
`;

export default {
  query: {
    name: 'ReactoryGetContentList',
    text: ReactoryGetContentListQuery,
    variables: {
      'query.search': 'search.searchString',
      'query.status': 'search.status',
      'query.format': 'search.format',
      'query.page': 'paging.page',
      'query.pageSize': 'paging.pageSize',
    },
    resultType: 'object',
    resultMap: {
      'paging': 'paging',
      'data': 'data',
    },
    edit: false,
    new: false,
  },
};
