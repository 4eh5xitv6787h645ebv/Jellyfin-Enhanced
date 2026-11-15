import { tagRuntimeHost } from '../host';
import { createTagHidden } from './tag-hidden';
import { createTagRenderer } from './tag-renderer-base';

const JE = tagRuntimeHost();
createTagRenderer(JE);
JE.core.tagHidden = createTagHidden(() => JE.pluginConfig);
