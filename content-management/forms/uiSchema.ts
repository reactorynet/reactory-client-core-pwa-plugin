import Reactory from '@reactorynet/reactory-core';

export const MaterialTableUIOptions: Reactory.Client.Components.IMaterialTableWidgetOptions = {
  showLabel: false,
  allowAdd: true,
  allowDelete: true,
  search: false, // Handled by custom ContentManagementToolbar
  columns: [
    {
      title: 'Slug',
      field: 'slug',
      width: 220,
      cellStyle: {
        fontFamily: 'monospace',
        fontWeight: 600,
        color: '#1976d2',
      },
    },
    {
      title: 'Title',
      field: 'title',
      width: 260,
      cellStyle: {
        fontWeight: 500,
      },
    },
    {
      title: 'Status',
      field: 'published',
      width: 140,
      component: 'core.ContentStatusBadge@1.0.0',
      propsMap: {
        'rowData.published': 'value',
      },
    },
    {
      title: 'Format',
      field: 'format',
      width: 130,
      component: 'core.ContentFormatBadge@1.0.0',
      propsMap: {
        'rowData.format': 'value',
      },
    },
    {
      title: 'Locale',
      field: 'locale',
      width: 90,
      align: 'center',
    },
    {
      title: 'Version',
      field: 'version',
      width: 100,
      align: 'center',
    },
    {
      title: 'Updated',
      field: 'updatedAt',
      width: 160,
      component: 'RelativeTimeWidget',
      propsMap: {
        'rowData.updatedAt': 'date',
      },
      type: 'datetime',
      defaultSort: 'desc',
    },
  ],
  remoteData: true,
  query: 'ReactoryGetContentList',
  options: {
    selection: false,
    search: false,
    grouping: false,
    filtering: false,
    exportButton: true,
    exportAllData: true,
    columnsButton: true,
    pageSize: 10,
    pageSizeOptions: [10, 25, 50],
    emptyRowsWhenPaging: false,
    debounceInterval: 300,
    detailPanelType: 'single',
    showDetailPanelIcon: true,
    detailPanelColumnAlignment: 'left',
  },
  headerStyle: {
    fontWeight: 600,
    fontSize: '0.875rem',
  },
  refreshEvents: [{ name: 'core.ContentSavedEvent' }, { name: 'core.ContentRefreshRequested' }],
  componentMap: {
    Toolbar: 'core.ContentManagementToolbar@1.0.0',
    DetailsPanel: 'core.ContentDetailPanel@1.0.0',
  },
  detailPanelPropsMap: {
    'props.rowData': 'content',
  },
  variables: {},
};

export const uiSchema: Reactory.Schema.IFormUISchema = {
  'ui:form': {
    componentType: 'div',
    showSubmit: false,
    showRefresh: false,
  },
  'ui:field': 'GridLayout',
  'ui:grid-layout': [
    {
      contentList: { xs: 12, sm: 12, md: 12, lg: 12, xl: 12 },
    },
  ],
  contentList: {
    'ui:title': null,
    'ui:widget': 'MaterialTableWidget',
    'ui:options': MaterialTableUIOptions,
  },
};

export default uiSchema;
