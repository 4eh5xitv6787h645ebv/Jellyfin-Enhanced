import { tagRuntimeHost } from '../../../host/tag-runtime-host';
import { createTagCacheStore } from './tag-cache-store';

tagRuntimeHost().tagCacheStore = createTagCacheStore();
