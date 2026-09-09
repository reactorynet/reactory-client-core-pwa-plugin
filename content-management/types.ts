import Reactory from '@reactorynet/reactory-core';
import { CMSContentData } from '@reactory/client-core/components/shared/StaticContent';

export type ContentFormat = 'markdown' | 'html' | 'text';

export interface IContentUser {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatar?: string;
}

export interface IContentTranslationItem {
  lang: string;
  title?: string;
  description?: string;
  content?: string;
  tags?: string[];
  machineTranslated?: boolean;
  sourceHash?: string;
  stale?: boolean;
  updatedAt?: string | Date;
  updatedBy?: IContentUser;
}

export interface IContentItem {
  id: string;
  slug: string;
  title: string;
  description?: string;
  content?: string;
  format?: ContentFormat;
  locale?: string;
  topics?: string[];
  published?: boolean;
  version?: string;
  template?: boolean;
  engine?: string;
  helpTopic?: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: IContentUser;
  updatedBy?: IContentUser;
  translations?: IContentTranslationItem[];
  roles?: string[];
  [key: string]: any;
}

export type ContentStatusFilter = 'all' | 'published' | 'draft';
export type ContentFormatFilter = 'all' | 'markdown' | 'html' | 'text';

export interface ContentFilterState {
  searchString: string;
  status: ContentStatusFilter;
  format: ContentFormatFilter;
  topic?: string;
}

export interface ContentFilterEntry {
  field: string;
  value: any;
}

export interface ContentManagementToolbarProps {
  reactory: Reactory.Client.ReactorySDK;
  data?: {
    data?: IContentItem[];
    paging?: {
      hasNext?: boolean;
      hasPrevious?: boolean;
      page: number;
      pageSize: number;
      total: number;
      totalPages?: number;
    };
    selected?: IContentItem[] | null;
  };
  filterState?: ContentFilterState;
  onFilterChange?: (filters: ContentFilterEntry[]) => void;
  onRefresh?: () => void;
  onAddNew?: () => void;
  onSearchChange?: (search: string) => void;
  viewMode?: 'grid' | 'list';
  onViewModeChange?: (mode: 'grid' | 'list') => void;
}

export interface ContentDetailPanelProps {
  reactory: Reactory.Client.ReactorySDK;
  content?: IContentItem;
  rowData?: IContentItem;
  onEdit?: (item: IContentItem) => void;
  onDelete?: (item: IContentItem) => void;
  onRefresh?: () => void;
}

export interface ContentEditorDrawerProps {
  open: boolean;
  onClose: () => void;
  contentData: CMSContentData | null;
  onSave?: (savedContent: CMSContentData) => void | Promise<void>;
  reactory: Reactory.Client.ReactorySDK;
}

export interface NewContentDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    slug: string;
    title: string;
    description: string;
    format: ContentFormat;
    locale: string;
    topics: string[];
  }) => void;
  reactory: Reactory.Client.ReactorySDK;
}
